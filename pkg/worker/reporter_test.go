package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestReporterRetriesAndReportsFromBusinessCode(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) == 1 {
			w.WriteHeader(503)
			return
		}
		var result Result
		if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
			t.Error(err)
		}
		if result.Status != Succeeded || result.Output.(map[string]any)["order_id"] != "SO-1042" {
			t.Error(result)
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()
	req := httptest.NewRequest("POST", "http://agent/jobs", nil)
	req.Header.Set("X-FlowForge-Callback-URL", srv.URL+"/api/v1/callbacks/token")
	req.Header.Set("X-FlowForge-Execution-Mode", "async")
	req.Header.Set("X-FlowForge-Run-ID", "run")
	req.Header.Set("X-FlowForge-Step-ID", "plan")
	req.Header.Set("X-FlowForge-Attempt", "1")
	req.Header.Set("Idempotency-Key", "run:plan")
	task, err := FromRequest(req, WithAllowedOrigin(srv.URL))
	if err != nil {
		t.Fatal(err)
	}
	if err = task.Reporter.Succeed(context.Background(), map[string]any{"order_id": "SO-1042"}); err != nil || attempts.Load() != 2 {
		t.Fatal(err, attempts.Load())
	}
}
func TestReporterValidationCancellationAndRedaction(t *testing.T) {
	if _, err := NewReporter("https://flows.example.com/platform/api/v1/callbacks/token", WithAllowedOrigin("https://flows.example.com")); err != nil {
		t.Fatal("reverse-proxy subpath rejected", err)
	}
	if _, err := NewReporter("http://other/api/v1/callbacks/token", WithAllowedOrigin("http://platform")); err == nil {
		t.Fatal("origin mismatch accepted")
	}
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(409) }))
	defer srv.Close()
	r, err := NewReporter(srv.URL + "/api/v1/callbacks/private-capability")
	if err != nil {
		t.Fatal(err)
	}
	if err = r.Fail(context.Background(), fmt.Errorf("failed")); err == nil || calls.Load() != 1 || strings.Contains(err.Error(), "private-capability") {
		t.Fatal(err, calls.Load())
	}
	if err = r.Succeed(context.Background(), strings.Repeat("x", MaxReportBytes)); err == nil || calls.Load() != 1 {
		t.Fatal("oversize result was sent")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel()
	time.Sleep(time.Millisecond)
	if err = r.Succeed(ctx, nil); err == nil {
		t.Fatal("cancelled report accepted")
	}
}
