package config

import (
	"bytes"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Listen           string   `yaml:"listen"`
	DatabaseURL      string   `yaml:"database_url"`
	APIToken         string   `yaml:"api_token"`
	PublicURL        string   `yaml:"public_url"`
	Workers          int      `yaml:"workers"`
	PollMS           int      `yaml:"poll_ms"`
	LeaseSeconds     int      `yaml:"lease_seconds"`
	DBConnections    int      `yaml:"db_connections"`
	HTTPAllowPrivate bool     `yaml:"http_allow_private"`
	HTTPAllowedHosts []string `yaml:"http_allowed_hosts"`
	RedisURL         string   `yaml:"redis_url"`
	Demo             bool     `yaml:"demo"`
	DemoAgentURL     string   `yaml:"demo_agent_url"`
	WebDir           string   `yaml:"web_dir"`
}

func Load(path string) (Config, error) {
	c := Config{Listen: ":8088", PublicURL: "http://localhost:8088", Workers: 8, PollMS: 500, LeaseSeconds: 30, DBConnections: 24, WebDir: "web/dist", DemoAgentURL: "http://erp-agents:8090"}
	if path != "" {
		b, err := os.ReadFile(path)
		if err != nil {
			return c, err
		}
		decoder := yaml.NewDecoder(bytes.NewReader(b))
		decoder.KnownFields(true)
		if err = decoder.Decode(&c); err != nil {
			return c, err
		}
	}
	for key, dst := range map[string]*string{"LISTEN": &c.Listen, "DATABASE_URL": &c.DatabaseURL, "API_TOKEN": &c.APIToken, "PUBLIC_URL": &c.PublicURL, "REDIS_URL": &c.RedisURL, "WEB_DIR": &c.WebDir, "DEMO_AGENT_URL": &c.DemoAgentURL} {
		if v, ok := os.LookupEnv("FLOWFORGE_" + key); ok {
			*dst = v
		}
	}
	for key, dst := range map[string]*int{"WORKERS": &c.Workers, "POLL_MS": &c.PollMS, "LEASE_SECONDS": &c.LeaseSeconds, "DB_CONNECTIONS": &c.DBConnections} {
		if v, ok := os.LookupEnv("FLOWFORGE_" + key); ok {
			n, err := strconv.Atoi(v)
			if err != nil {
				return c, fmt.Errorf("%s: %w", key, err)
			}
			*dst = n
		}
	}
	for key, dst := range map[string]*bool{"DEMO": &c.Demo, "HTTP_ALLOW_PRIVATE": &c.HTTPAllowPrivate} {
		if v, ok := os.LookupEnv("FLOWFORGE_" + key); ok {
			b, err := strconv.ParseBool(v)
			if err != nil {
				return c, fmt.Errorf("%s: %w", key, err)
			}
			*dst = b
		}
	}
	if v, ok := os.LookupEnv("FLOWFORGE_HTTP_ALLOWED_HOSTS"); ok {
		c.HTTPAllowedHosts = strings.FieldsFunc(v, func(r rune) bool { return r == ',' })
	}
	if c.DatabaseURL == "" || len(c.APIToken) < 24 {
		return c, fmt.Errorf("database_url is required; api_token must be at least 24 characters")
	}
	if c.Workers < 1 || c.Workers > 256 || c.PollMS < 50 || c.PollMS > 60000 || c.LeaseSeconds < 10 || c.DBConnections < 4 {
		return c, fmt.Errorf("invalid worker, poll, lease or connection limit")
	}
	u, err := url.Parse(c.PublicURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return c, fmt.Errorf("public_url must be an absolute HTTP(S) URL")
	}
	c.PublicURL = strings.TrimRight(c.PublicURL, "/")
	for i, host := range c.HTTPAllowedHosts {
		c.HTTPAllowedHosts[i] = strings.ToLower(strings.TrimSpace(host))
	}
	return c, nil
}

func (c Config) Poll() time.Duration  { return time.Duration(c.PollMS) * time.Millisecond }
func (c Config) Lease() time.Duration { return time.Duration(c.LeaseSeconds) * time.Second }
