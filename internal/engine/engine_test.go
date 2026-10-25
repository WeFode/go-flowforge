package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	erp "github.com/WeFode/go-flowforge/examples/erp"
	"github.com/WeFode/go-flowforge/examples/erp/agents"

	"github.com/WeFode/go-flowforge/internal/config"
	"github.com/WeFode/go-flowforge/internal/httpapi"
	"github.com/WeFode/go-flowforge/internal/store"
	"github.com/WeFode/go-flowforge/pkg/workflow"
)

func setup(t *testing.T) (*store.Store, config.Config) {
	t.Helper()
	dsn := os.Getenv("FLOWFORGE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set FLOWFORGE_TEST_DATABASE_URL to run real PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, err := store.Open(ctx, dsn, 8)
	if err != nil {
		t.Fatal(err)
	}
	schema := "ff_test_" + workflow.NewID()
	if _, err = admin.DB.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	s, err := store.Open(ctx, dsn+sep+"search_path="+schema, 16)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.DB.Close(); _, _ = admin.DB.Exec("DROP SCHEMA " + schema + " CASCADE"); admin.DB.Close() })
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	return s, config.Config{Workers: 4, PollMS: 50, LeaseSeconds: 10, HTTPAllowPrivate: true, APIToken: strings.Repeat("a", 32), PublicURL: "http://localhost"}
}
func put(t *testing.T, s *store.Store, d workflow.Definition) workflow.Definition {
	t.Helper()
	d.Normalize()
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	v, err := s.PutWorkflow(context.Background(), d, true)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
func enqueue(t *testing.T, s *store.Store, id, key string) workflow.Run {
	t.Helper()
	r, err := s.Enqueue(context.Background(), id, map[string]any{"topic": "test"}, "test", key, 0, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func waitRun(t *testing.T, s *store.Store, id string, predicate func(workflow.Run) bool) workflow.Run {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	var r workflow.Run
	for time.Now().Before(deadline) {
		var err error
		r, err = s.Run(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if predicate(r) {
			return r
		}
		time.Sleep(30 * time.Millisecond)
	}
	t.Fatalf("timed out: %s %+v", r.Status, r.Steps)
	return r
}
func start(t *testing.T, e *Engine) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	wait := e.Start(ctx)
	t.Cleanup(func() { cancel(); wait() })
}
func TestParallelJoinAndSnapshot(t *testing.T) {
	s, c := setup(t)
	d := put(t, s, workflow.Definition{ID: "parallel", Name: "parallel", Enabled: true, Concurrency: 2, Steps: []workflow.Step{{ID: "a", Type: "http", Config: map[string]any{"url": "https://example.test/a"}}, {ID: "b", Type: "http", Config: map[string]any{"url": "https://example.test/b"}}, {ID: "join", Type: "transform", DependsOn: []string{"a", "b"}, Config: map[string]any{"value": "{{steps.a.output}}"}}}})
	r := enqueue(t, s, d.ID, "")
	d.Name = "new definition"
	if _, err := s.PutWorkflow(context.Background(), d, false); err != nil {
		t.Fatal(err)
	}
	e := New(s, c)
	var active, maxActive atomic.Int32
	barrier := make(chan struct{})
	var entered atomic.Int32
	e.Handlers["http"] = HandlerFunc(func(ctx context.Context, r Request) (any, error) {
		n := active.Add(1)
		defer active.Add(-1)
		for old := maxActive.Load(); n > old && !maxActive.CompareAndSwap(old, n); old = maxActive.Load() {
		}
		if entered.Add(1) == 2 {
			close(barrier)
		}
		select {
		case <-barrier:
			return map[string]any{"step": r.StepID}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	})
	start(t, e)
	done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
	if done.Status != "succeeded" || maxActive.Load() != 2 || done.Definition.Name != "parallel" || done.Steps["join"].Output.(map[string]any)["step"] != "a" {
		t.Fatalf("unexpected run: %+v concurrency=%d", done, maxActive.Load())
	}
}
func TestRetryContinueAndOptionalFailure(t *testing.T) {
	s, c := setup(t)
	optional := false
	put(t, s, workflow.Definition{ID: "retry", Name: "retry", Enabled: true, Steps: []workflow.Step{{ID: "unstable", Type: "http", OnError: "continue", AffectsRun: &optional, Retry: workflow.Retry{MaxAttempts: 2, InitialSeconds: 1, MaxSeconds: 1}, Config: map[string]any{"url": "https://example.test"}}, {ID: "next", Type: "transform", DependsOn: []string{"unstable"}, Config: map[string]any{"value": "continued"}}}})
	r := enqueue(t, s, "retry", "")
	e := New(s, c)
	var calls atomic.Int32
	e.Handlers["http"] = HandlerFunc(func(context.Context, Request) (any, error) {
		calls.Add(1)
		return nil, fmt.Errorf("service unavailable")
	})
	start(t, e)
	done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
	if done.Status != "succeeded" || done.Steps["unstable"].Attempts != 2 || done.Steps["next"].Status != "succeeded" || calls.Load() != 2 {
		t.Fatalf("unexpected retry result %+v", done)
	}
}
func TestStopAndSkipBranch(t *testing.T) {
	for _, policy := range []string{"stop", "skip_dependents"} {
		t.Run(policy, func(t *testing.T) {
			s, c := setup(t)
			put(t, s, workflow.Definition{ID: "branches", Name: "branches", Enabled: true, Concurrency: 1, Steps: []workflow.Step{{ID: "bad", Type: "http", OnError: policy, Config: map[string]any{"url": "https://example.test"}}, {ID: "blocked", Type: "transform", DependsOn: []string{"bad"}}, {ID: "other", Type: "transform"}}})
			r := enqueue(t, s, "branches", "")
			e := New(s, c)
			e.Handlers["http"] = HandlerFunc(func(context.Context, Request) (any, error) { return nil, fmt.Errorf("failed") })
			start(t, e)
			done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
			if done.Status != "failed" || done.Steps["blocked"].Status != "skipped" {
				t.Fatal(done)
			}
			want := "succeeded"
			if policy == "stop" {
				want = "skipped"
			}
			if done.Steps["other"].Status != want {
				t.Fatal(done)
			}
		})
	}
}
func TestCallbackDeliveredBeforeDispatchReturns(t *testing.T) {
	s, c := setup(t)
	api := httptest.NewServer((&httpapi.Server{Store: s, Config: c}).Handler())
	defer api.Close()
	c.PublicURL = api.URL
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Idempotency-Key") == "" {
			t.Error("missing idempotency header")
		}
		resp, err := http.Post(r.Header.Get("X-FlowForge-Callback-URL"), "application/json", strings.NewReader(`{"status":"succeeded","output":{"answer":42}}`))
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Errorf("callback status %d", resp.StatusCode)
		}
		w.WriteHeader(202)
	}))
	defer remote.Close()
	put(t, s, workflow.Definition{ID: "callback", Name: "callback", Enabled: true, Steps: []workflow.Step{{ID: "external", Type: "callback", Config: map[string]any{"url": remote.URL}}, {ID: "join", Type: "transform", DependsOn: []string{"external"}, Config: map[string]any{"value": "{{steps.external.output.answer}}"}}}})
	r := enqueue(t, s, "callback", "")
	start(t, New(s, c))
	done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
	if done.Status != "succeeded" || done.Steps["join"].Output != float64(42) {
		t.Fatal(done)
	}
}
func TestLeaseFencingIdempotencyCancelAndReplay(t *testing.T) {
	s, c := setup(t)
	put(t, s, workflow.Definition{ID: "lease", Name: "lease", Enabled: true, Steps: []workflow.Step{{ID: "a", Type: "transform", Retry: workflow.Retry{MaxAttempts: 2}}}})
	r := enqueue(t, s, "lease", "unique")
	duplicate := enqueue(t, s, "lease", "unique")
	if r.ID != duplicate.ID {
		t.Fatal("idempotency failed")
	}
	ctx := context.Background()
	old, err := s.Claim(ctx, "old", c.Lease())
	if err != nil || old == nil {
		t.Fatal(err)
	}
	old.Steps["a"].Status = "running"
	old.Steps["a"].Attempts = 1
	if err = s.Save(ctx, old, false); err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec("UPDATE runs SET lease_until=now()-interval '1 second' WHERE id=$1", r.ID); err != nil {
		t.Fatal(err)
	}
	newOwner, err := s.Claim(ctx, "new", c.Lease())
	if err != nil || newOwner == nil {
		t.Fatal(err)
	}
	if err = s.Save(ctx, old, true); !errors.Is(err, store.ErrLeaseLost) {
		t.Fatal("stale worker wrote state", err)
	}
	if err = New(s, c).advance(ctx, newOwner); err != nil {
		t.Fatal(err)
	}
	recovered, _ := s.Run(ctx, r.ID)
	if recovered.Steps["a"].Status != "retry_wait" {
		t.Fatal(recovered)
	}
	if err = s.Cancel(ctx, r.ID); err != nil {
		t.Fatal(err)
	}
	cancelled, _ := s.Run(ctx, r.ID)
	if cancelled.Status != "cancelled" || cancelled.Steps["a"].Status != "cancelled" {
		t.Fatal(cancelled)
	}
	replay, err := s.Replay(ctx, r.ID, "replay-key")
	if err != nil || replay.ID == r.ID || replay.Steps["a"].Attempts != 0 {
		t.Fatal(replay, err)
	}
}
func TestScheduleIsAtomicAndAPIValidation(t *testing.T) {
	s, c := setup(t)
	put(t, s, workflow.Definition{ID: "cron", Name: "cron", Enabled: true, Schedule: &workflow.Schedule{Cron: "* * * * *", Timezone: "UTC"}, Steps: []workflow.Step{{ID: "a", Type: "transform"}}})
	if _, err := s.DB.Exec("UPDATE workflows SET next_schedule_at=now()-interval '1 minute'"); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	done := make(chan error, 2)
	for range 2 {
		go func() { done <- s.ScheduleTick(ctx) }()
	}
	for range 2 {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	runs, err := s.Runs(ctx, "cron", "", 100, 0)
	if err != nil || len(runs) != 1 {
		t.Fatal(len(runs), err)
	}
	h := (&httpapi.Server{Store: s, Config: c}).Handler()
	req := httptest.NewRequest("GET", "/api/v1/workflows", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatal(rec.Code)
	}
	req = httptest.NewRequest("POST", "/api/v1/workflows/cron/runs", strings.NewReader(`{"input":{},"typo":true}`))
	req.Header.Set("Authorization", "Bearer "+c.APIToken)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	b, _ := json.Marshal(runs[0].Definition)
	if strings.Contains(string(b), "token") {
		t.Fatal("token leaked")
	}
}
func TestHTTPDestinationPolicyAndRedirect(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "http://127.0.0.1/private", 302) }))
	defer remote.Close()
	_, err := HTTPHandler(config.Config{}).Execute(context.Background(), Request{Config: map[string]any{"url": remote.URL}})
	if err == nil {
		t.Fatal("private destination allowed")
	}
	_, err = HTTPHandler(config.Config{HTTPAllowPrivate: true}).Execute(context.Background(), Request{Config: map[string]any{"url": remote.URL}})
	if err == nil || !strings.Contains(err.Error(), "302") {
		t.Fatal("redirect followed", err)
	}
}

func TestActiveRunLimitIncludesDurableWaitsAcrossEngines(t *testing.T) {
	s, c := setup(t)
	put(t, s, workflow.Definition{ID: "limited", Name: "limited", Enabled: true, MaxActiveRuns: 1, Steps: []workflow.Step{{ID: "pause", Type: "delay", Config: map[string]any{"seconds": 1}}}})
	first := enqueue(t, s, "limited", "")
	second := enqueue(t, s, "limited", "")
	start(t, New(s, c))
	start(t, New(s, c))
	waitRun(t, s, first.ID, func(r workflow.Run) bool { return r.Steps["pause"].Status == "waiting_delay" })
	time.Sleep(200 * time.Millisecond)
	r, err := s.Run(context.Background(), second.ID)
	if err != nil || r.Status != "queued" {
		t.Fatalf("waiting run must retain workflow capacity: %s %v", r.Status, err)
	}
	waitRun(t, s, second.ID, func(r workflow.Run) bool { return r.Status == "succeeded" })
}

func TestDelayTimeoutAndCallbackExpiry(t *testing.T) {
	s, c := setup(t)
	put(t, s, workflow.Definition{ID: "timeout", Name: "timeout", Enabled: true, Steps: []workflow.Step{{ID: "pause", Type: "delay", TimeoutSeconds: 1, Config: map[string]any{"seconds": 5}}}})
	r := enqueue(t, s, "timeout", "")
	start(t, New(s, c))
	done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
	if done.Status != "failed" || !strings.Contains(done.Steps["pause"].Error, "timed out") {
		t.Fatal(done)
	}
	put(t, s, workflow.Definition{ID: "expired", Name: "expired", Enabled: true, Steps: []workflow.Step{{ID: "external", Type: "callback", Config: map[string]any{"url": "https://example.test"}}}})
	old, err := s.Enqueue(context.Background(), "expired", nil, "test", "", 0, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec("INSERT INTO callbacks(run_id,step_id,attempt,token_hash,expires_at) VALUES($1,'external',1,$2,now()-interval '1 second')", old.ID, store.TokenHash("expired-token")); err != nil {
		t.Fatal(err)
	}
	if err := s.CompleteCallback(context.Background(), "expired-token", "succeeded", nil, ""); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("expired callback accepted", err)
	}
}

func TestDeletePreservesHistoryAndOptimisticVersion(t *testing.T) {
	s, _ := setup(t)
	d := put(t, s, workflow.Definition{ID: "history", Name: "history", Enabled: true, Steps: []workflow.Step{{ID: "a", Type: "transform"}}})
	updated, err := s.PutWorkflow(context.Background(), d, false)
	if err != nil || updated.Version != 2 {
		t.Fatal(updated, err)
	}
	if _, err = s.PutWorkflow(context.Background(), d, false); !errors.Is(err, store.ErrConflict) {
		t.Fatal("stale definition saved", err)
	}
	enqueue(t, s, d.ID, "")
	if err = s.DeleteWorkflow(context.Background(), d.ID); !errors.Is(err, store.ErrHistory) {
		t.Fatal("history deleted", err)
	}
	put(t, s, workflow.Definition{ID: "unused", Name: "unused", Steps: []workflow.Step{{ID: "a", Type: "transform"}}})
	if err = s.DeleteWorkflow(context.Background(), "unused"); err != nil {
		t.Fatal(err)
	}
}

func TestCallbackWakeCannotBeOverwrittenByWorkerSave(t *testing.T) {
	s, c := setup(t)
	ctx := context.Background()
	put(t, s, workflow.Definition{ID: "wake", Name: "wake", Enabled: true, Steps: []workflow.Step{{ID: "external", Type: "callback", Config: map[string]any{"url": "https://example.test"}}}})
	r := enqueue(t, s, "wake", "")
	leased, err := s.Claim(ctx, "owner", c.Lease())
	if err != nil || leased == nil {
		t.Fatal(err)
	}
	state := leased.Steps["external"]
	state.Status = "waiting_callback"
	state.Attempts = 1
	state.NextAt = time.Now().Add(time.Hour)
	leased.Status = "waiting"
	if err = s.Save(ctx, leased, false); err != nil {
		t.Fatal(err)
	}
	if err = s.PrepareCallback(ctx, leased, "external", "wake-token", state.NextAt); err != nil {
		t.Fatal(err)
	}
	if err = s.CompleteCallback(ctx, "wake-token", "succeeded", map[string]any{"ok": true}, ""); err != nil {
		t.Fatal(err)
	}
	leased.NextAt = time.Now().Add(time.Hour)
	if err = s.Save(ctx, leased, true); err != nil {
		t.Fatal(err)
	}
	var next time.Time
	if err = s.DB.QueryRow("SELECT next_at FROM runs WHERE id=$1", r.ID).Scan(&next); err != nil {
		t.Fatal(err)
	}
	if next.After(time.Now().Add(time.Second)) {
		t.Fatal("callback wake was overwritten", next)
	}
	start(t, New(s, c))
	done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return r.Status == "succeeded" })
	if done.Steps["external"].Attempts != 1 {
		t.Fatal(done)
	}
}

func TestFactoryERPWithExplicitAsyncReporting(t *testing.T) {
	s, c := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	api := httptest.NewServer((&httpapi.Server{Store: s, Config: c}).Handler())
	defer api.Close()
	c.PublicURL = api.URL
	service := agents.New(ctx, api.URL)
	service.DurationScale = 0.01
	remote := httptest.NewServer(service.Handler())
	defer remote.Close()
	d, err := erp.Definition(remote.URL)
	if err != nil {
		t.Fatal(err)
	}
	d = put(t, s, d)
	start(t, New(s, c))
	for _, optionalFailure := range []bool{false, true} {
		var input map[string]any
		if err = json.Unmarshal(erp.InputJSON, &input); err != nil {
			t.Fatal(err)
		}
		input["scenario"].(map[string]any)["notification_failure"] = optionalFailure
		r, err := s.Enqueue(ctx, d.ID, input, "test", "", 0, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		done := waitRun(t, s, r.ID, func(r workflow.Run) bool { return workflow.Terminal(r.Status) })
		if done.Status != "succeeded" || done.Steps["inventory"].Attempts != 2 || done.Steps["capacity"].Output.(map[string]any)["line"] != "M-02" {
			t.Fatalf("ERP execution failed: %+v", done)
		}
		if done.Steps["erp_writeback"].Output.(map[string]any)["body"].(map[string]any)["work_order"] != "WO-SO-2026-1042" {
			t.Fatal(done.Steps["erp_writeback"])
		}
		want := "succeeded"
		if optionalFailure {
			want = "failed"
		}
		if done.Steps["notify"].Status != want {
			t.Fatal(done.Steps["notify"])
		}
		if !done.Steps["quality"].StartedAt.Equal(*done.Steps["capacity"].StartedAt) {
			t.Fatal("parallel agents did not start in the same wave")
		}
	}
}
