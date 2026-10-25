package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnvironmentOverridesAndValidation(t *testing.T) {
	t.Setenv("FLOWFORGE_DATABASE_URL", "postgres://example/test")
	t.Setenv("FLOWFORGE_API_TOKEN", strings.Repeat("x", 32))
	t.Setenv("FLOWFORGE_WORKERS", "12")
	t.Setenv("FLOWFORGE_HTTP_ALLOWED_HOSTS", " API.EXAMPLE.COM , internal.example.com")
	c, err := Load("")
	if err != nil || c.Workers != 12 || c.HTTPAllowedHosts[0] != "api.example.com" {
		t.Fatal(c.Workers, err)
	}
	t.Setenv("FLOWFORGE_WORKERS", "0")
	if _, err = Load(""); err == nil {
		t.Fatal("invalid concurrency accepted")
	}
}
func TestYAMLRejectsUnknownConfiguration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("workres: 100\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "workres") {
		t.Fatal("typo silently ignored", err)
	}
}
