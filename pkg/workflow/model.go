// Package workflow contains the portable workflow contract and pure scheduling rules.
package workflow

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"time"

	"github.com/robfig/cron/v3"
)

type Definition struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	InputExample   map[string]any `json:"input_example,omitempty"`
	Enabled        bool           `json:"enabled"`
	Version        int            `json:"version"`
	Concurrency    int            `json:"concurrency"`
	MaxActiveRuns  int            `json:"max_active_runs"`
	TimeoutSeconds int            `json:"timeout_seconds"`
	Window         *Window        `json:"window,omitempty"`
	Schedule       *Schedule      `json:"schedule,omitempty"`
	Steps          []Step         `json:"steps"`
}
type Schedule struct {
	Cron     string `json:"cron"`
	Timezone string `json:"timezone"`
}
type Window struct {
	Start    string `json:"start"`
	End      string `json:"end"`
	Timezone string `json:"timezone"`
	Days     []int  `json:"days,omitempty"`
}
type Retry struct {
	MaxAttempts    int `json:"max_attempts"`
	InitialSeconds int `json:"initial_seconds"`
	MaxSeconds     int `json:"max_seconds"`
}
type Condition struct {
	Path  string `json:"path"`
	Op    string `json:"op"`
	Value any    `json:"value,omitempty"`
}
type Step struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Type           string         `json:"type"`
	ExecutionMode  string         `json:"execution_mode"`
	DependsOn      []string       `json:"depends_on"`
	TimeoutSeconds int            `json:"timeout_seconds"`
	Retry          Retry          `json:"retry"`
	OnError        string         `json:"on_error"`
	AffectsRun     *bool          `json:"affects_run,omitempty"`
	Join           string         `json:"join"`
	Condition      *Condition     `json:"condition,omitempty"`
	Config         map[string]any `json:"config"`
}
type StepState struct {
	Status     string     `json:"status"`
	Attempts   int        `json:"attempts"`
	Output     any        `json:"output,omitempty"`
	Error      string     `json:"error,omitempty"`
	NextAt     time.Time  `json:"next_at,omitempty"`
	StartedAt  *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}
type Run struct {
	ID         string                `json:"id"`
	WorkflowID string                `json:"workflow_id"`
	Definition Definition            `json:"definition"`
	Input      map[string]any        `json:"input"`
	Status     string                `json:"status"`
	Source     string                `json:"source"`
	Priority   int                   `json:"priority"`
	Steps      map[string]*StepState `json:"steps"`
	Error      string                `json:"error,omitempty"`
	CreatedAt  time.Time             `json:"created_at"`
	StartedAt  *time.Time            `json:"started_at,omitempty"`
	FinishedAt *time.Time            `json:"finished_at,omitempty"`
	NextAt     time.Time             `json:"next_at"`
	Owner      string                `json:"-"`
	Fence      int64                 `json:"-"`
}
type Event struct {
	ID        int64     `json:"id"`
	RunID     string    `json:"run_id"`
	StepID    string    `json:"step_id,omitempty"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}

var identifier = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func (d *Definition) Normalize() {
	if d.Concurrency == 0 {
		d.Concurrency = 4
	}
	if d.MaxActiveRuns == 0 {
		d.MaxActiveRuns = 16
	}
	if d.TimeoutSeconds == 0 {
		d.TimeoutSeconds = 86400
	}
	for i := range d.Steps {
		s := &d.Steps[i]
		if s.ExecutionMode == "" {
			s.ExecutionMode = s.Mode()
		}
		if s.Name == "" {
			s.Name = s.ID
		}
		if s.TimeoutSeconds == 0 {
			s.TimeoutSeconds = 60
		}
		if s.Retry.MaxAttempts == 0 {
			s.Retry.MaxAttempts = 1
		}
		if s.Retry.InitialSeconds == 0 {
			s.Retry.InitialSeconds = 2
		}
		if s.Retry.MaxSeconds == 0 {
			s.Retry.MaxSeconds = 300
		}
		if s.OnError == "" {
			s.OnError = "stop"
		}
		if s.Join == "" {
			s.Join = "all_success"
		}
		if s.DependsOn == nil {
			s.DependsOn = []string{}
		}
		if s.Config == nil {
			s.Config = map[string]any{}
		}
	}
}
func (d Definition) Validate() error {
	if !identifier.MatchString(d.ID) || d.Name == "" || len(d.Name) > 200 {
		return fmt.Errorf("workflow requires an id (letters, numbers, _ or -, max 64) and a name (max 200)")
	}
	if d.Concurrency < 1 || d.Concurrency > 64 || d.MaxActiveRuns < 1 || d.MaxActiveRuns > 10000 || d.TimeoutSeconds < 1 || d.TimeoutSeconds > 2592000 {
		return fmt.Errorf("invalid workflow concurrency or timeout")
	}
	if len(d.Steps) == 0 || len(d.Steps) > 128 {
		return fmt.Errorf("workflow must contain 1..128 steps")
	}
	byID := map[string]Step{}
	for _, s := range d.Steps {
		if !identifier.MatchString(s.ID) {
			return fmt.Errorf("invalid step id %q", s.ID)
		}
		if _, ok := byID[s.ID]; ok {
			return fmt.Errorf("duplicate step %s", s.ID)
		}
		byID[s.ID] = s
		if !slices.Contains([]string{"http", "transform", "delay", "callback"}, s.Type) {
			return fmt.Errorf("step %s: unsupported type %s", s.ID, s.Type)
		}
		if !slices.Contains([]string{"sync", "async"}, s.ExecutionMode) {
			return fmt.Errorf("step %s: execution_mode must be sync or async", s.ID)
		}
		if (s.Type == "transform" && s.ExecutionMode != "sync") || ((s.Type == "delay" || s.Type == "callback") && s.ExecutionMode != "async") {
			return fmt.Errorf("step %s: execution_mode is incompatible with %s", s.ID, s.Type)
		}
		if !slices.Contains([]string{"stop", "continue", "skip_dependents"}, s.OnError) || !slices.Contains([]string{"all_success", "all_done", "any_success"}, s.Join) {
			return fmt.Errorf("step %s: invalid failure or join policy", s.ID)
		}
		if s.TimeoutSeconds < 1 || s.TimeoutSeconds > 604800 || s.Retry.MaxAttempts < 1 || s.Retry.MaxAttempts > 20 || s.Retry.InitialSeconds < 1 || s.Retry.MaxSeconds < s.Retry.InitialSeconds || s.Retry.MaxSeconds > 86400 {
			return fmt.Errorf("step %s: invalid timeout or retry policy", s.ID)
		}
		if s.Condition != nil && (s.Condition.Path == "" || !slices.Contains([]string{"eq", "ne", "exists"}, s.Condition.Op)) {
			return fmt.Errorf("step %s: invalid condition", s.ID)
		}
		if s.Type == "http" || s.Type == "callback" {
			raw, _ := s.Config["url"].(string)
			u, err := url.Parse(raw)
			if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
				return fmt.Errorf("step %s: url must be absolute HTTP(S), without credentials", s.ID)
			}
			if method, ok := s.Config["method"].(string); ok && !slices.Contains([]string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}, method) {
				return fmt.Errorf("step %s: unsupported method", s.ID)
			}
		}
		if s.Type == "delay" {
			n, ok := Number(s.Config["seconds"])
			if !ok || n < 0 || n > 2592000 {
				return fmt.Errorf("step %s: delay seconds must be 0..2592000", s.ID)
			}
		}
	}
	visiting, done := map[string]bool{}, map[string]bool{}
	var visit func(string) error
	visit = func(id string) error {
		if visiting[id] {
			return fmt.Errorf("dependency cycle at %s", id)
		}
		if done[id] {
			return nil
		}
		visiting[id] = true
		seen := map[string]bool{}
		for _, dep := range byID[id].DependsOn {
			if _, ok := byID[dep]; !ok {
				return fmt.Errorf("step %s: unknown dependency %s", id, dep)
			}
			if seen[dep] {
				return fmt.Errorf("step %s: duplicate dependency", id)
			}
			seen[dep] = true
			if err := visit(dep); err != nil {
				return err
			}
		}
		visiting[id] = false
		done[id] = true
		return nil
	}
	for id := range byID {
		if err := visit(id); err != nil {
			return err
		}
	}
	if d.Schedule != nil {
		if _, err := d.Schedule.Next(time.Now()); err != nil {
			return err
		}
	}
	if d.Window != nil {
		if err := d.Window.Validate(); err != nil {
			return err
		}
	}
	return nil
}
func Number(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case json.Number:
		n, e := x.Float64()
		return n, e == nil
	}
	return 0, false
}
func (s Schedule) Next(t time.Time) (time.Time, error) {
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		return time.Time{}, fmt.Errorf("schedule timezone: %w", err)
	}
	parsed, err := cron.ParseStandard(s.Cron)
	if err != nil {
		return time.Time{}, fmt.Errorf("schedule cron: %w", err)
	}
	next := parsed.Next(t.In(loc))
	if next.IsZero() {
		return next, fmt.Errorf("schedule has no next occurrence")
	}
	return next, nil
}
func Terminal(s string) bool {
	return slices.Contains([]string{"succeeded", "failed", "skipped", "cancelled"}, s)
}
func (s Step) ImpactsRun() bool { return s.AffectsRun == nil || *s.AffectsRun }

// Mode resolves legacy definitions that predate an explicit execution_mode.
func (s Step) Mode() string {
	if s.ExecutionMode != "" {
		return s.ExecutionMode
	}
	if s.Type == "callback" || s.Type == "delay" {
		return "async"
	}
	return "sync"
}
func (s Step) AwaitsReport() bool {
	return (s.Type == "http" || s.Type == "callback") && s.Mode() == "async"
}
func (s Step) RetryDelay(attempt int) time.Duration {
	seconds := s.Retry.InitialSeconds
	for i := 1; i < attempt && seconds < s.Retry.MaxSeconds; i++ {
		seconds = min(seconds*2, s.Retry.MaxSeconds)
	}
	return time.Duration(seconds) * time.Second
}
