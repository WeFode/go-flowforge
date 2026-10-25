package workflow

import (
	"testing"
	"time"
)

func definition() Definition {
	d := Definition{ID: "test", Name: "test", Enabled: true, Steps: []Step{{ID: "a", Type: "transform"}, {ID: "b", Type: "transform", DependsOn: []string{"a"}}}}
	d.Normalize()
	return d
}
func TestValidationRejectsInvalidGraphs(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Definition)
	}{
		{"cycle", func(d *Definition) { d.Steps[0].DependsOn = []string{"b"} }},
		{"unknown", func(d *Definition) { d.Steps[0].DependsOn = []string{"missing"} }},
		{"duplicate", func(d *Definition) { d.Steps[1].ID = "a" }},
		{"invalid_retry", func(d *Definition) { d.Steps[0].Retry.MaxAttempts = 21 }},
		{"invalid_window", func(d *Definition) { d.Window = &Window{Start: "25:00", End: "08:00", Timezone: "Asia/Shanghai"} }},
		{"invalid_cron", func(d *Definition) { d.Schedule = &Schedule{Cron: "not cron", Timezone: "UTC"} }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := definition()
			tc.mutate(&d)
			if d.Validate() == nil {
				t.Fatal("expected validation error")
			}
		})
	}
	if err := definition().Validate(); err != nil {
		t.Fatal(err)
	}
}
func TestOvernightWindowAndOpeningDay(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	w := Window{Start: "20:00", End: "08:00", Timezone: "Asia/Shanghai", Days: []int{1}}
	for _, tc := range []struct{ now, want string }{
		{"2026-10-26 20:00", "2026-10-26 20:00"},
		{"2026-10-27 07:59", "2026-10-27 07:59"},
		{"2026-10-27 08:00", "2026-11-02 20:00"},
		{"2026-10-26 19:00", "2026-10-26 20:00"},
		{"2026-10-26 01:00", "2026-10-26 20:00"},
	} {
		now, _ := time.ParseInLocation("2006-01-02 15:04", tc.now, loc)
		if got := w.Next(now).Format("2006-01-02 15:04"); got != tc.want {
			t.Fatalf("%s: got %s want %s", tc.now, got, tc.want)
		}
	}
}
func TestTemplatePreservesTypesAndSecretIsolation(t *testing.T) {
	t.Setenv("FLOWFORGE_SECRET_KEY", "private-key")
	r := &Run{Input: map[string]any{"items": []any{float64(1), true}, "name": "Ada"}, Steps: map[string]*StepState{"a": {Status: "succeeded", Output: map[string]any{"score": float64(4)}}}}
	value, err := Resolve(map[string]any{"items": "{{input.items}}", "message": "hello {{input.name}}", "score": "{{steps.a.output.score}}"}, Scope(r, false))
	if err != nil {
		t.Fatal(err)
	}
	out := value.(map[string]any)
	if out["message"] != "hello Ada" || out["score"] != float64(4) || len(out["items"].([]any)) != 2 {
		t.Fatal(out)
	}
	if _, err = Resolve("{{secrets.KEY}}", Scope(r, false)); err == nil {
		t.Fatal("transform must not access environment secrets")
	}
	if v, err := Resolve("{{secrets.KEY}}", Scope(r, true)); err != nil || v != "private-key" {
		t.Fatal(v, err)
	}
}
func TestFailurePolicies(t *testing.T) {
	d := definition()
	r := &Run{Definition: d, Steps: map[string]*StepState{"a": {Status: "failed"}, "b": {Status: "pending"}}}
	if ready, blocked := Readiness(d.Steps[1], r); ready || !blocked {
		t.Fatal("stop should block dependent")
	}
	r.Definition.Steps[0].OnError = "continue"
	if ready, blocked := Readiness(d.Steps[1], r); !ready || blocked {
		t.Fatal("continue should release dependent")
	}
	r.Definition.Steps[0].OnError = "skip_dependents"
	s := d.Steps[1]
	s.Join = "all_done"
	if ready, blocked := Readiness(s, r); !ready || blocked {
		t.Fatal("all_done cleanup must run")
	}
	r.Steps["a"].Status = "pending"
	if ready, blocked := Readiness(s, r); ready || blocked {
		t.Fatal("nonterminal dependency must wait")
	}
}
func TestCronUsesConfiguredTimezone(t *testing.T) {
	start := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	next, err := (Schedule{Cron: "0 9 * * *", Timezone: "Asia/Shanghai"}).Next(start)
	if err != nil {
		t.Fatal(err)
	}
	if !next.Equal(start.Add(time.Hour)) {
		t.Fatal(next)
	}
}

func TestExecutionModes(t *testing.T) {
	for _, tc := range []struct {
		kind, mode string
		report     bool
	}{{"http", "sync", false}, {"http", "async", true}, {"callback", "", true}, {"delay", "", false}, {"transform", "sync", false}} {
		s := Step{Type: tc.kind, ExecutionMode: tc.mode}
		if s.AwaitsReport() != tc.report {
			t.Fatal(tc, s.Mode())
		}
	}
	d := definition()
	d.Steps[0].ExecutionMode = "async"
	if d.Validate() == nil {
		t.Fatal("async transform accepted")
	}
}
