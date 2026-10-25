// Package worker provides a completion reporting client for asynchronous workflow steps.
package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Status string

const (
	Succeeded Status = "succeeded"
	Failed    Status = "failed"
)
const MaxReportBytes = 1024 * 1024

// Result is a terminal step result. HTTP 202 acceptance alone does not complete a step.
type Result struct {
	Status Status `json:"status"`
	Output any    `json:"output,omitempty"`
	Error  string `json:"error,omitempty"`
}
type Option func(*options)
type options struct {
	client *http.Client
	origin string
}

func WithHTTPClient(client *http.Client) Option { return func(o *options) { o.client = client } }

// WithAllowedOrigin rejects callback URLs outside the configured platform origin.
func WithAllowedOrigin(origin string) Option {
	return func(o *options) { o.origin = strings.TrimRight(origin, "/") }
}

type Reporter struct {
	endpoint string
	client   *http.Client
}
type Task struct {
	RunID          string
	StepID         string
	Attempt        int
	IdempotencyKey string
	Reporter       *Reporter
}

// FromRequest captures execution metadata before the incoming HTTP request ends.
// The returned reporter can be passed to any internal business function or persisted as a callback URL.
func FromRequest(r *http.Request, opts ...Option) (Task, error) {
	attempt, err := strconv.Atoi(r.Header.Get("X-FlowForge-Attempt"))
	if err != nil || attempt < 1 {
		return Task{}, errors.New("missing or invalid execution attempt")
	}
	if mode := r.Header.Get("X-FlowForge-Execution-Mode"); mode != "" && mode != "async" {
		return Task{}, errors.New("completion reporting requires an asynchronous step")
	}
	reporter, err := NewReporter(r.Header.Get("X-FlowForge-Callback-URL"), opts...)
	if err != nil {
		return Task{}, err
	}
	task := Task{RunID: r.Header.Get("X-FlowForge-Run-ID"), StepID: r.Header.Get("X-FlowForge-Step-ID"), Attempt: attempt, IdempotencyKey: r.Header.Get("Idempotency-Key"), Reporter: reporter}
	if task.RunID == "" || task.StepID == "" || task.IdempotencyKey == "" {
		return Task{}, errors.New("missing execution metadata")
	}
	return task, nil
}
func NewReporter(endpoint string, opts ...Option) (*Reporter, error) {
	o := options{client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	for _, apply := range opts {
		apply(&o)
	}
	u, err := url.Parse(endpoint)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid completion endpoint")
	}
	marker := "/api/v1/callbacks/"
	index := strings.LastIndex(u.Path, marker)
	if index < 0 || u.Path[index+len(marker):] == "" || strings.Contains(u.Path[index+len(marker):], "/") {
		return nil, errors.New("invalid completion endpoint path")
	}
	if o.origin != "" && u.Scheme+"://"+u.Host != o.origin {
		return nil, errors.New("completion endpoint origin is not allowed")
	}
	if o.client == nil {
		return nil, errors.New("HTTP client is required")
	}
	return &Reporter{endpoint, o.client}, nil
}
func (r *Reporter) Succeed(ctx context.Context, output any) error {
	return r.Report(ctx, Result{Status: Succeeded, Output: output})
}
func (r *Reporter) Fail(ctx context.Context, cause error) error {
	if cause == nil {
		return errors.New("failure cause is required")
	}
	return r.Report(ctx, Result{Status: Failed, Error: cause.Error()})
}

// Report retries network failures and 429/5xx responses up to three times.
// A repeated report of the same terminal status is idempotent at the platform.
func (r *Reporter) Report(ctx context.Context, result Result) error {
	if result.Status != Succeeded && result.Status != Failed {
		return errors.New("report status must be succeeded or failed")
	}
	if len(result.Error) > 2000 {
		return errors.New("report error exceeds 2000 bytes")
	}
	b, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("encode step result: %w", err)
	}
	if len(b) > MaxReportBytes {
		return errors.New("step result exceeds 1 MiB; store large data externally and report a reference")
	}
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			timer := time.NewTimer(time.Duration(100*(1<<uint(attempt-1))) * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(b))
		if err != nil {
			return errors.New("cannot construct completion request")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "FlowForge-Worker/0.1")
		resp, err := r.client.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			last = errors.New("completion request failed")
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		last = fmt.Errorf("completion endpoint returned HTTP %d", resp.StatusCode)
		if resp.StatusCode != 429 && resp.StatusCode < 500 {
			return last
		}
	}
	return last
}
