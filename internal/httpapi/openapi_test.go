package httpapi

import (
	"gopkg.in/yaml.v3"
	"testing"
)

func TestEmbeddedOpenAPIIsParseable(t *testing.T) {
	var doc struct {
		OpenAPI string                    `yaml:"openapi"`
		Paths   map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal([]byte(openAPI), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.OpenAPI != "3.1.0" || doc.Paths["/workflows/{id}/runs"]["post"] == nil || doc.Paths["/callbacks/{token}"]["post"] == nil {
		t.Fatal("incomplete API contract")
	}
}
