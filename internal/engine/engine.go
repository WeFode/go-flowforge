package engine

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/WeFode/go-flowforge/internal/config"
	"github.com/WeFode/go-flowforge/internal/store"
	"github.com/WeFode/go-flowforge/pkg/workflow"
)

type Engine struct {
	Store    *store.Store
	Config   config.Config
	Handlers map[string]Handler
}

func New(s *store.Store, c config.Config) *Engine { return &Engine{s, c, builtinHandlers(c)} }
func (e *Engine) Start(ctx context.Context) func() {
	var wg sync.WaitGroup
	wg.Go(func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			if err := e.Store.ScheduleTick(ctx); err != nil && ctx.Err() == nil {
				slog.Error("schedule tick", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	})
	for i := 0; i < e.Config.Workers; i++ {
		owner := workflow.NewID()
		wg.Go(func() {
			for ctx.Err() == nil {
				r, err := e.Store.Claim(ctx, owner, e.Config.Lease())
				if err != nil && ctx.Err() == nil {
					slog.Error("claim run", "error", err)
				}
				if r != nil {
					e.execute(ctx, r)
					continue
				}
				timer := time.NewTimer(e.Config.Poll())
				select {
				case <-ctx.Done():
					timer.Stop()
					return
				case <-timer.C:
				}
			}
		})
	}
	return wg.Wait
}
func event(step, kind, message string) workflow.Event {
	return workflow.Event{StepID: step, Type: kind, Message: message}
}
func fail(s workflow.Step, state *workflow.StepState, message string, now time.Time) workflow.Event {
	state.Error = redact(message)
	if state.Attempts < s.Retry.MaxAttempts {
		state.Status = "retry_wait"
		state.NextAt = retryAt(s, state, now)
		return event(s.ID, "step.retry_scheduled", state.Error)
	}
	state.Status = "failed"
	state.FinishedAt = &now
	return event(s.ID, "step.failed", state.Error)
}
func (e *Engine) execute(parent context.Context, r *workflow.Run) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	heartbeatDone := make(chan struct{})
	defer func() { cancel(); <-heartbeatDone }()
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(e.Config.Lease() / 3)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := e.Store.Renew(ctx, r, e.Config.Lease()); err != nil {
					cancel()
					return
				}
			}
		}
	}()
	defer func() {
		if v := recover(); v != nil {
			slog.Error("run panic; lease will expire", "run_id", r.ID, "panic", fmt.Sprint(v))
		}
	}()
	if err := e.advance(ctx, r); err != nil && parent.Err() == nil {
		slog.Warn("run execution interrupted", "run_id", r.ID, "error", err)
	}
}
func (e *Engine) advance(ctx context.Context, r *workflow.Run) error {
	now := time.Now().UTC()
	events := []workflow.Event{}
	if r.StartedAt == nil {
		r.StartedAt = &now
		events = append(events, event("", "run.started", r.Definition.Name))
	}
	deadline := r.StartedAt.Add(time.Duration(r.Definition.TimeoutSeconds) * time.Second)
	if !now.Before(deadline) {
		r.Status = "failed"
		r.Error = "workflow execution timeout"
		r.FinishedAt = &now
		for _, s := range r.Steps {
			if !workflow.Terminal(s.Status) {
				s.Status = "cancelled"
				s.FinishedAt = &now
			}
		}
		return e.Store.Save(ctx, r, true, append(events, event("", "run.failed", r.Error))...)
	}
	r.Status = "running"
	// A previous owner may have died after an external side effect. Recovery is at least once.
	for _, s := range r.Definition.Steps {
		state := r.Steps[s.ID]
		switch state.Status {
		case "running":
			events = append(events, fail(s, state, "worker interrupted; previous attempt outcome unknown", now))
		case "waiting_delay":
			if !now.Before(state.NextAt) {
				seconds, _ := workflow.Number(s.Config["seconds"])
				if time.Duration(seconds*float64(time.Second)) > time.Duration(s.TimeoutSeconds)*time.Second {
					events = append(events, fail(s, state, "delay step timed out", now))
					continue
				}
				state.Status = "succeeded"
				state.FinishedAt = &now
				state.Output = map[string]any{"delayed": true}
				events = append(events, event(s.ID, "step.succeeded", "delay completed"))
			}
		case "waiting_callback":
			status, output, message, err := e.Store.CallbackResult(ctx, r, s.ID)
			if err != nil {
				return err
			}
			if status == "succeeded" {
				state.Status = "succeeded"
				state.Output = output
				state.FinishedAt = &now
				events = append(events, event(s.ID, "step.succeeded", "callback received"))
			} else if status == "failed" {
				events = append(events, fail(s, state, message, now))
			} else if !now.Before(state.NextAt) {
				events = append(events, fail(s, state, "callback timed out", now))
			}
		}
	}
	stop := false
	for _, s := range r.Definition.Steps {
		if r.Steps[s.ID].Status == "failed" && s.OnError == "stop" {
			stop = true
		}
	}
	if stop {
		for id, state := range r.Steps {
			if !workflow.Terminal(state.Status) {
				state.Status = "skipped"
				state.Error = "workflow stopped by failed step"
				state.FinishedAt = &now
				events = append(events, event(id, "step.skipped", state.Error))
			}
		}
	}
	// Skip propagation iterates to a fixed point so definition order never affects dependency rules.
	for changed := true; changed; {
		changed = false
		for _, s := range r.Definition.Steps {
			state := r.Steps[s.ID]
			if state.Status != "pending" && state.Status != "retry_wait" {
				continue
			}
			ready, blocked := workflow.Readiness(s, r)
			if blocked || (ready && !workflow.ConditionMatches(s.Condition, r)) {
				state.Status = "skipped"
				state.Error = "dependency policy or condition not satisfied"
				state.FinishedAt = &now
				events = append(events, event(s.ID, "step.skipped", state.Error))
				changed = true
			}
		}
	}
	allDone := true
	failed := false
	for _, s := range r.Definition.Steps {
		state := r.Steps[s.ID]
		allDone = allDone && workflow.Terminal(state.Status)
		if state.Status == "failed" && s.ImpactsRun() {
			failed = true
		}
	}
	if allDone {
		r.Status = "succeeded"
		if failed {
			r.Status = "failed"
			r.Error = "one or more required steps failed"
		}
		r.FinishedAt = &now
		return e.Store.Save(ctx, r, true, append(events, event("", "run."+r.Status, r.Error))...)
	}
	windowAt := now
	if r.Definition.Window != nil {
		windowAt = r.Definition.Window.Next(now)
	}
	batch := []workflow.Step{}
	inflight := 0
	for _, state := range r.Steps {
		if state.Status == "waiting_callback" {
			inflight++
		}
	}
	for _, s := range r.Definition.Steps {
		state := r.Steps[s.ID]
		if state.Status != "pending" && state.Status != "retry_wait" {
			continue
		}
		if state.Status == "retry_wait" && now.Before(state.NextAt) {
			continue
		}
		ready, _ := workflow.Readiness(s, r)
		if !ready || windowAt.After(now) {
			continue
		}
		if len(batch)+inflight >= r.Definition.Concurrency {
			break
		}
		state.Attempts++
		state.Error = ""
		state.StartedAt = &now
		state.FinishedAt = nil
		if s.Type == "delay" {
			seconds, _ := workflow.Number(s.Config["seconds"])
			state.Status = "waiting_delay"
			state.NextAt = now.Add(min(time.Duration(seconds*float64(time.Second)), time.Duration(s.TimeoutSeconds)*time.Second))
			events = append(events, event(s.ID, "step.waiting", "delay scheduled"))
			continue
		}
		state.Status = "running"
		if s.AwaitsReport() {
			state.Status = "waiting_callback"
			state.NextAt = now.Add(time.Duration(s.TimeoutSeconds) * time.Second)
		}
		batch = append(batch, s)
		events = append(events, event(s.ID, "step.started", fmt.Sprintf("attempt %d", state.Attempts)))
	}
	// Persist attempts before dispatching. No external work starts without a durable state transition.
	if err := e.Store.Save(ctx, r, false, events...); err != nil {
		return err
	}
	events = nil
	type result struct {
		step   workflow.Step
		output any
		err    error
	}
	results := make(chan result, len(batch))
	var wg sync.WaitGroup
	for _, s := range batch {
		state := r.Steps[s.ID]
		attempt := state.Attempts
		resolved, err := workflow.Resolve(s.Config, workflow.Scope(r, s.Type == "http" || s.Type == "callback"))
		if err != nil {
			results <- result{s, nil, err}
			continue
		}
		callbackURL := ""
		if s.AwaitsReport() {
			token := workflow.NewID() + workflow.NewID()
			if err = e.Store.PrepareCallback(ctx, r, s.ID, token, state.NextAt); err != nil {
				return err
			}
			callbackURL = e.Config.PublicURL + "/api/v1/callbacks/" + token
		}
		request := Request{RunID: r.ID, StepID: s.ID, Attempt: attempt, CallbackURL: callbackURL, Config: resolved.(map[string]any)}
		wg.Go(func() {
			res := result{step: s}
			defer func() {
				if v := recover(); v != nil {
					res.err = fmt.Errorf("handler panic")
				}
				results <- res
			}()
			timeout := min(time.Duration(s.TimeoutSeconds)*time.Second, time.Until(deadline))
			stepCtx, stop := context.WithTimeout(ctx, timeout)
			defer stop()
			handler, ok := e.Handlers[s.Type]
			if !ok {
				res.err = fmt.Errorf("no handler for %s", s.Type)
				return
			}
			res.output, res.err = handler.Execute(stepCtx, request)
		})
	}
	wg.Wait()
	close(results)
	for res := range results {
		state := r.Steps[res.step.ID]
		finished := time.Now().UTC()
		if res.err != nil {
			events = append(events, fail(res.step, state, res.err.Error(), finished))
		} else if !res.step.AwaitsReport() {
			state.Status = "succeeded"
			state.Output = res.output
			state.FinishedAt = &finished
			events = append(events, event(res.step.ID, "step.succeeded", "completed"))
		} else {
			events = append(events, event(res.step.ID, "step.waiting", "awaiting external callback"))
		}
	}
	r.Status = "waiting"
	r.NextAt = time.Now().Add(e.Config.Poll())
	// Long delays, closed windows and retry backoff release workers instead of occupying goroutines.
	if len(batch) == 0 {
		next := deadline
		for _, s := range r.Definition.Steps {
			state := r.Steps[s.ID]
			switch state.Status {
			case "waiting_callback":
				next = minTime(next, state.NextAt)
			case "waiting_delay":
				next = minTime(next, state.NextAt)
			case "retry_wait":
				next = minTime(next, maxTime(state.NextAt, windowAt))
			case "pending":
				ready, _ := workflow.Readiness(s, r)
				if ready {
					next = minTime(next, windowAt)
				}
			}
		}
		r.NextAt = maxTime(time.Now().Add(e.Config.Poll()), next)
	}
	return e.Store.Save(ctx, r, true, events...)
}
func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
