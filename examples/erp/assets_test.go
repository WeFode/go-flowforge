package erp

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestExampleDefinitionAndInput(t *testing.T) {
	d, err := Definition("http://localhost:8090")
	if err != nil {
		t.Fatal(err)
	}
	var input map[string]any
	if err = json.Unmarshal(InputJSON, &input); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(input, d.InputExample) {
		t.Fatal("workflow input_example must match input.json")
	}
	async := 0
	for _, s := range d.Steps {
		if s.AwaitsReport() {
			async++
		}
		if s.Type == "callback" {
			t.Fatal("new examples must use explicit execution_mode")
		}
	}
	if len(d.Steps) != 8 || async != 3 {
		t.Fatal(len(d.Steps), async)
	}
}
