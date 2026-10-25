// Package erp contains an executable factory-order workflow example.
package erp

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/WeFode/go-flowforge/pkg/workflow"
)

//go:embed workflow.json
var definitionJSON string

//go:embed input.json
var InputJSON []byte

func Definition(agentURL string) (workflow.Definition, error) {
	var d workflow.Definition
	err := json.Unmarshal([]byte(strings.ReplaceAll(definitionJSON, "http://erp-agents:8090", strings.TrimRight(agentURL, "/"))), &d)
	if err != nil {
		return d, err
	}
	d.Normalize()
	return d, d.Validate()
}
