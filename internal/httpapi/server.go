package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/WeFode/go-flowforge/internal/config"
	"github.com/WeFode/go-flowforge/internal/store"
	"github.com/WeFode/go-flowforge/pkg/workflow"
)

type Server struct {
	Store  *store.Store
	Config config.Config
}

//go:embed openapi.yaml
var openAPI string

func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func failure(w http.ResponseWriter, err error) {
	code, message := 500, "internal server error"
	switch {
	case errors.Is(err, store.ErrHistory):
		code, message = 409, store.ErrHistory.Error()
	case errors.Is(err, store.ErrNotFound):
		code, message = 404, "not found"
	case errors.Is(err, store.ErrConflict):
		code, message = 409, "version or state conflict; refresh and retry"
	default:
		slog.Error("API request failed", "error", err)
	}
	write(w, code, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		write(w, 400, map[string]string{"error": "invalid JSON: " + err.Error()})
		return false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		write(w, 400, map[string]string{"error": "request must contain a single JSON value"})
		return false
	}
	return true
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		_, _ = io.WriteString(w, openAPI)
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if s.Store.DB.PingContext(ctx) != nil {
			write(w, 503, map[string]string{"status": "unavailable"})
			return
		}
		write(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/v1/system", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, map[string]any{"name": "FlowForge", "version": "0.1.0", "workers": s.Config.Workers, "queue": "postgresql", "redis": "reserved", "handlers": []string{"http", "transform", "delay", "callback"}})
	})
	mux.HandleFunc("GET /api/v1/stats", func(w http.ResponseWriter, r *http.Request) {
		v, err := s.Store.Stats(r.Context())
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("GET /api/v1/workflows", func(w http.ResponseWriter, r *http.Request) {
		v, err := s.Store.Workflows(r.Context())
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("GET /api/v1/workflows/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := s.Store.Workflow(r.Context(), r.PathValue("id"))
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("POST /api/v1/workflows", func(w http.ResponseWriter, r *http.Request) { s.putWorkflow(w, r, true) })
	mux.HandleFunc("PUT /api/v1/workflows/{id}", func(w http.ResponseWriter, r *http.Request) { s.putWorkflow(w, r, false) })
	mux.HandleFunc("DELETE /api/v1/workflows/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Store.DeleteWorkflow(r.Context(), r.PathValue("id")); err != nil {
			failure(w, err)
			return
		}
		write(w, 200, map[string]bool{"deleted": true})
	})
	mux.HandleFunc("POST /api/v1/workflows/{id}/runs", func(w http.ResponseWriter, r *http.Request) { s.enqueue(w, r, "api") })
	mux.HandleFunc("POST /api/v1/hooks/{id}", func(w http.ResponseWriter, r *http.Request) { s.enqueue(w, r, "webhook") })
	mux.HandleFunc("GET /api/v1/runs", func(w http.ResponseWriter, r *http.Request) {
		limit := bounded(r.URL.Query().Get("limit"), 50, 1, 200)
		offset := bounded(r.URL.Query().Get("offset"), 0, 0, 1000000)
		v, err := s.Store.Runs(r.Context(), r.URL.Query().Get("workflow_id"), r.URL.Query().Get("status"), limit, offset)
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("GET /api/v1/runs/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := s.Store.Run(r.Context(), r.PathValue("id"))
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("GET /api/v1/runs/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
		v, err := s.Store.Events(r.Context(), r.PathValue("id"), after)
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 200, v)
	})
	mux.HandleFunc("POST /api/v1/runs/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Store.Cancel(r.Context(), r.PathValue("id")); err != nil {
			failure(w, err)
			return
		}
		write(w, 200, map[string]string{"status": "cancelled"})
	})
	mux.HandleFunc("POST /api/v1/runs/{id}/replay", func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("Idempotency-Key")
		if len(key) > 200 {
			write(w, 400, map[string]string{"error": "idempotency key exceeds 200 characters"})
			return
		}
		v, err := s.Store.Replay(r.Context(), r.PathValue("id"), key)
		if err != nil {
			failure(w, err)
			return
		}
		write(w, 202, v)
	})
	mux.HandleFunc("POST /api/v1/callbacks/{token}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Status string `json:"status"`
			Output any    `json:"output"`
			Error  string `json:"error"`
		}
		if !decode(w, r, &body) {
			return
		}
		if (body.Status != "succeeded" && body.Status != "failed") || len(body.Error) > 2000 {
			write(w, 400, map[string]string{"error": "status must be succeeded or failed; error max 2000 characters"})
			return
		}
		if err := s.Store.CompleteCallback(r.Context(), r.PathValue("token"), body.Status, body.Output, body.Error); err != nil {
			failure(w, err)
			return
		}
		write(w, 200, map[string]bool{"accepted": true})
	})
	files := http.FileServer(http.Dir(s.Config.WebDir))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			write(w, 404, map[string]string{"error": "not found"})
			return
		}
		clean := strings.TrimPrefix(r.URL.Path, "/")
		if clean == "" {
			clean = "index.html"
		}
		if !fs.ValidPath(clean) {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(s.Config.WebDir + "/" + clean); err != nil {
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			callback := r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/api/v1/callbacks/")
			if !callback {
				expected := sha256.Sum256([]byte(s.Config.APIToken))
				supplied := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
				if subtle.ConstantTimeCompare(expected[:], supplied[:]) != 1 {
					write(w, 401, map[string]string{"error": "valid Bearer token required"})
					return
				}
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func bounded(raw string, fallback, low, high int) int {
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return max(low, min(high, n))
}
func (s *Server) putWorkflow(w http.ResponseWriter, r *http.Request, create bool) {
	var d workflow.Definition
	if !decode(w, r, &d) {
		return
	}
	if !create && d.ID != r.PathValue("id") {
		write(w, 400, map[string]string{"error": "workflow id does not match path"})
		return
	}
	d.Normalize()
	if err := d.Validate(); err != nil {
		write(w, 422, map[string]string{"error": err.Error()})
		return
	}
	v, err := s.Store.PutWorkflow(r.Context(), d, create)
	if err != nil {
		failure(w, err)
		return
	}
	status := 200
	if create {
		status = 201
	}
	write(w, status, v)
}
func (s *Server) enqueue(w http.ResponseWriter, r *http.Request, source string) {
	var body struct {
		Input       map[string]any `json:"input"`
		Priority    int            `json:"priority"`
		ScheduledAt *time.Time     `json:"scheduled_at"`
	}
	if !decode(w, r, &body) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) > 200 || body.Priority < -100 || body.Priority > 100 {
		write(w, 400, map[string]string{"error": "priority must be -100..100; idempotency key max 200 characters"})
		return
	}
	at := time.Now()
	if body.ScheduledAt != nil {
		at = *body.ScheduledAt
	}
	v, err := s.Store.Enqueue(r.Context(), r.PathValue("id"), body.Input, source, key, body.Priority, at)
	if err != nil {
		failure(w, err)
		return
	}
	write(w, 202, v)
}
