// Package agents implements deterministic services for the factory ERP example.
package agents

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/WeFode/go-flowforge/pkg/worker"
)

type Scenario struct {
	InventoryRetry      bool `json:"inventory_retry"`
	QualityReject       bool `json:"quality_reject"`
	NotificationFailure bool `json:"notification_failure"`
}
type Order struct {
	ID        string   `json:"order_id"`
	Customer  string   `json:"customer"`
	SKU       string   `json:"sku"`
	Quantity  int      `json:"quantity"`
	Warehouse string   `json:"warehouse"`
	DueDate   string   `json:"due_date"`
	Scenario  Scenario `json:"scenario"`
}
type Payload struct {
	Order       Order          `json:"order"`
	Inventory   map[string]any `json:"inventory,omitempty"`
	Quality     map[string]any `json:"quality,omitempty"`
	Capacity    map[string]any `json:"capacity,omitempty"`
	Procurement map[string]any `json:"procurement,omitempty"`
	Plan        map[string]any `json:"plan,omitempty"`
	ERP         map[string]any `json:"erp,omitempty"`
}
type job struct {
	done   chan struct{}
	output any
	err    error
}
type Service struct {
	Context       context.Context
	ReportOrigin  string
	DurationScale float64
	mu            sync.Mutex
	jobs          map[string]*job
}

func New(ctx context.Context, origin string) *Service {
	return &Service{Context: ctx, ReportOrigin: origin, DurationScale: 1, jobs: map[string]*job{}}
}
func respond(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}
func (s *Service) wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(time.Duration(float64(d) * s.DurationScale))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("POST /agents/{name}", s.handle)
	return mux
}
func (s *Service) handle(w http.ResponseWriter, r *http.Request) {
	var p Payload
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil || p.Order.ID == "" || p.Order.Quantity < 1 || p.Order.Quantity > 1000000 {
		respond(w, 422, map[string]string{"error": "order_id and quantity (1..1000000) are required"})
		return
	}
	name := r.PathValue("name")
	if name == "capacity" || name == "procurement" || name == "notify" {
		task, err := worker.FromRequest(r, worker.WithAllowedOrigin(s.ReportOrigin))
		if err != nil {
			respond(w, 422, map[string]string{"error": err.Error()})
			return
		}
		s.accept(name, p, task)
		respond(w, 202, map[string]any{"accepted": true, "order_id": p.Order.ID, "step_id": task.StepID})
		return
	}
	if name == "inventory" && p.Order.Scenario.InventoryRetry && r.Header.Get("X-FlowForge-Attempt") == "1" {
		respond(w, 503, map[string]string{"error": "inventory snapshot temporarily unavailable"})
		return
	}
	if name == "quality" && p.Order.Scenario.QualityReject {
		respond(w, 422, map[string]string{"error": "order does not meet the configured quality rule"})
		return
	}
	if err := s.wait(r.Context(), 350*time.Millisecond); err != nil {
		return
	}
	var output any
	switch name {
	case "inventory":
		output = map[string]any{"sku": p.Order.SKU, "available_units": p.Order.Quantity * 65 / 100, "shortage_units": p.Order.Quantity - p.Order.Quantity*65/100, "warehouse": p.Order.Warehouse}
	case "quality":
		output = map[string]any{"passed": true, "inspection_plan": "QCP-SERVO-02", "checks": []string{"尺寸抽检", "绝缘测试", "出厂老化"}}
	case "plan":
		if p.Capacity == nil || p.Procurement == nil || p.Quality == nil || p.Inventory == nil {
			respond(w, 422, map[string]string{"error": "all four agent results are required"})
			return
		}
		output = map[string]any{"plan_id": "PLAN-" + p.Order.ID, "order_id": p.Order.ID, "quantity": p.Order.Quantity, "line": "M-02", "production_days": (p.Order.Quantity + 599) / 600, "due_date": p.Order.DueDate, "procurement": p.Procurement, "quality": p.Quality}
	case "erp":
		if p.Plan == nil {
			respond(w, 422, map[string]string{"error": "production plan is required"})
			return
		}
		output = map[string]any{"work_order": "WO-" + p.Order.ID, "status": "released", "order_id": p.Order.ID, "plan_id": p.Plan["plan_id"], "line": p.Plan["line"], "quantity": p.Order.Quantity, "demo": true}
	default:
		respond(w, 404, map[string]string{"error": "unknown demo agent"})
		return
	}
	respond(w, 200, output)
}
func (s *Service) accept(name string, p Payload, task worker.Task) {
	// Deduplicate business execution. Each delivery still reports to its own attempt's callback.
	s.mu.Lock()
	existing, ok := s.jobs[task.IdempotencyKey]
	if !ok {
		existing = &job{done: make(chan struct{})}
		s.jobs[task.IdempotencyKey] = existing
	}
	s.mu.Unlock()
	if !ok {
		go func() { defer close(existing.done); existing.output, existing.err = s.execute(s.Context, name, p) }()
	}
	go func() {
		select {
		case <-s.Context.Done():
			return
		case <-existing.done:
		}
		ctx, cancel := context.WithTimeout(s.Context, 15*time.Second)
		defer cancel()
		var err error
		if existing.err != nil {
			err = task.Reporter.Fail(ctx, existing.err)
		} else {
			err = task.Reporter.Succeed(ctx, existing.output)
		}
		if err != nil {
			slog.Warn("demo result report rejected", "run_id", task.RunID, "step_id", task.StepID, "error", err)
		} else {
			slog.Info("demo result reported", "run_id", task.RunID, "step_id", task.StepID)
		}
	}()
}

// execute may call multiple internal services. Completion is reported only after the whole operation finishes.
func (s *Service) execute(ctx context.Context, name string, p Payload) (any, error) {
	duration := 3 * time.Second
	if name == "capacity" {
		duration = 9 * time.Second
	}
	if name == "notify" {
		duration = 2 * time.Second
	}
	if err := s.wait(ctx, duration); err != nil {
		return nil, err
	}
	switch name {
	case "capacity":
		return map[string]any{"line": "M-02", "daily_capacity": 600, "production_days": (p.Order.Quantity + 599) / 600, "available": true}, nil
	case "procurement":
		if p.Inventory == nil {
			return nil, errors.New("inventory analysis is required")
		}
		return map[string]any{"request_id": "PR-" + p.Order.ID, "supplier": "示例机电供应商", "shortage_units": p.Inventory["shortage_units"], "lead_days": 2, "status": "ready"}, nil
	case "notify":
		if p.Order.Scenario.NotificationFailure {
			return nil, errors.New("notification gateway is unavailable")
		}
		return map[string]any{"recipient": "生产主管", "channel": "enterprise-message", "delivered": true, "order_id": p.Order.ID}, nil
	default:
		return nil, fmt.Errorf("unknown asynchronous agent")
	}
}
