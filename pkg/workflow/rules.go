package workflow

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"time"
)

func (w Window) Validate() error {
	if _, err := time.LoadLocation(w.Timezone); err != nil {
		return fmt.Errorf("window timezone: %w", err)
	}
	for _, v := range []string{w.Start, w.End} {
		if _, err := time.Parse("15:04", v); err != nil {
			return fmt.Errorf("window requires HH:MM start/end")
		}
	}
	for _, day := range w.Days {
		if day < 0 || day > 6 {
			return fmt.Errorf("window days must be 0 (Sunday)..6")
		}
	}
	return nil
}

// Days describe the day the window opens; an overnight window includes the following morning.
func (w Window) Next(now time.Time) time.Time {
	loc, _ := time.LoadLocation(w.Timezone)
	local := now.In(loc)
	start, _ := time.Parse("15:04", w.Start)
	end, _ := time.Parse("15:04", w.End)
	for offset := -1; offset <= 8; offset++ {
		day := local.AddDate(0, 0, offset)
		if len(w.Days) > 0 && !slices.Contains(w.Days, int(day.Weekday())) {
			continue
		}
		a := time.Date(day.Year(), day.Month(), day.Day(), start.Hour(), start.Minute(), 0, 0, loc)
		b := time.Date(day.Year(), day.Month(), day.Day(), end.Hour(), end.Minute(), 0, 0, loc)
		if !b.After(a) {
			b = b.AddDate(0, 0, 1)
		}
		if !local.Before(a) && local.Before(b) {
			return now
		}
		if a.After(local) {
			return a
		}
	}
	return now.Add(24 * time.Hour)
}
func Scope(r *Run, secrets bool) map[string]any {
	steps := map[string]any{}
	for id, state := range r.Steps {
		steps[id] = map[string]any{"output": state.Output, "status": state.Status, "attempts": state.Attempts}
	}
	root := map[string]any{"input": r.Input, "steps": steps, "run": map[string]any{"id": r.ID, "workflow_id": r.WorkflowID}}
	if secrets {
		env := map[string]any{}
		for _, pair := range os.Environ() {
			k, v, _ := strings.Cut(pair, "=")
			if strings.HasPrefix(k, "FLOWFORGE_SECRET_") {
				env[strings.TrimPrefix(k, "FLOWFORGE_SECRET_")] = v
			}
		}
		root["secrets"] = env
	}
	return root
}
func Lookup(root any, path string) (any, bool) {
	v := root
	for _, part := range strings.Split(path, ".") {
		obj, ok := v.(map[string]any)
		if !ok {
			return nil, false
		}
		v, ok = obj[part]
		if !ok {
			return nil, false
		}
	}
	return v, true
}

var template = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}`)

// Resolve preserves JSON types for a full expression and JSON-encodes objects embedded in strings.
func Resolve(v any, scope map[string]any) (any, error) {
	switch x := v.(type) {
	case string:
		matches := template.FindAllStringSubmatchIndex(x, -1)
		if len(matches) == 0 {
			return x, nil
		}
		if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(x) {
			path := x[matches[0][2]:matches[0][3]]
			v, ok := Lookup(scope, path)
			if !ok {
				return nil, fmt.Errorf("missing template value %s", path)
			}
			return v, nil
		}
		var result strings.Builder
		pos := 0
		for _, m := range matches {
			result.WriteString(x[pos:m[0]])
			path := x[m[2]:m[3]]
			v, ok := Lookup(scope, path)
			if !ok {
				return nil, fmt.Errorf("missing template value %s", path)
			}
			if str, ok := v.(string); ok {
				result.WriteString(str)
			} else {
				b, e := json.Marshal(v)
				if e != nil {
					return nil, e
				}
				result.Write(b)
			}
			pos = m[1]
		}
		result.WriteString(x[pos:])
		return result.String(), nil
	case map[string]any:
		out := map[string]any{}
		for k, v := range x {
			value, err := Resolve(v, scope)
			if err != nil {
				return nil, err
			}
			out[k] = value
		}
		return out, nil
	case []any:
		out := make([]any, len(x))
		for i, v := range x {
			value, err := Resolve(v, scope)
			if err != nil {
				return nil, err
			}
			out[i] = value
		}
		return out, nil
	default:
		return v, nil
	}
}
func ConditionMatches(c *Condition, r *Run) bool {
	if c == nil {
		return true
	}
	v, ok := Lookup(Scope(r, false), c.Path)
	switch c.Op {
	case "exists":
		return ok && v != nil
	case "eq":
		return ok && reflect.DeepEqual(v, c.Value)
	case "ne":
		return !ok || !reflect.DeepEqual(v, c.Value)
	}
	return false
}

// Readiness returns ready, blocked. A blocked dependency propagates through its branch.
func Readiness(s Step, r *Run) (bool, bool) {
	allGood, anyGood := true, false
	for _, dep := range s.DependsOn {
		state := r.Steps[dep]
		if !Terminal(state.Status) {
			return false, false
		}
		good := state.Status == "succeeded"
		if state.Status == "failed" {
			for _, d := range r.Definition.Steps {
				if d.ID == dep && d.OnError == "continue" {
					good = true
				}
			}
		}
		allGood = allGood && good
		anyGood = anyGood || good
	}
	if len(s.DependsOn) == 0 {
		return true, false
	}
	switch s.Join {
	case "all_done":
		return true, false
	case "any_success":
		return anyGood, !anyGood
	default:
		return allGood, !allGood
	}
}
