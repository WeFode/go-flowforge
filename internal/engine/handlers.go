package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/WeFode/go-flowforge/internal/config"
	"github.com/WeFode/go-flowforge/pkg/workflow"
)

type Request struct {
	RunID       string
	StepID      string
	Attempt     int
	CallbackURL string
	Config      map[string]any
}
type Handler interface {
	Execute(context.Context, Request) (any, error)
}
type HandlerFunc func(context.Context, Request) (any, error)

func (f HandlerFunc) Execute(ctx context.Context, r Request) (any, error) { return f(ctx, r) }

func privateIP(addr net.IP) bool {
	ip, ok := netip.AddrFromSlice(addr)
	if !ok {
		return true
	}
	ip = ip.Unmap()
	return !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}
func HTTPHandler(c config.Config) Handler {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{MaxIdleConns: 256, MaxIdleConnsPerHost: 32, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 30 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("destination DNS lookup failed")
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("destination has no addresses")
			}
			for _, ip := range ips {
				if !c.HTTPAllowPrivate && privateIP(ip.IP) {
					return nil, fmt.Errorf("destination is a private or reserved network; configure http_allow_private for trusted internal services")
				}
			}
			var last error
			for _, ip := range ips {
				conn, e := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
				if e == nil {
					return conn, nil
				}
				last = e
			}
			return nil, last
		},
	}
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return HandlerFunc(func(ctx context.Context, r Request) (any, error) {
		raw, _ := r.Config["url"].(string)
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
			return nil, fmt.Errorf("invalid destination URL")
		}
		if len(c.HTTPAllowedHosts) > 0 && !slices.Contains(c.HTTPAllowedHosts, strings.ToLower(u.Hostname())) {
			return nil, fmt.Errorf("destination hostname is not allowed")
		}
		method, _ := r.Config["method"].(string)
		if method == "" {
			method = "POST"
		}
		if !slices.Contains([]string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}, method) {
			return nil, fmt.Errorf("unsupported method")
		}
		var body []byte
		if v, ok := r.Config["body"]; ok {
			body, err = json.Marshal(v)
			if err != nil {
				return nil, err
			}
		}
		req, err := http.NewRequestWithContext(ctx, method, raw, bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("cannot construct HTTP request")
		}
		req.Header.Set("Content-Type", "application/json")
		if headers, ok := r.Config["headers"].(map[string]any); ok {
			for k, v := range headers {
				str, ok := v.(string)
				if !ok {
					return nil, fmt.Errorf("header %s must be a string", k)
				}
				req.Header.Set(k, str)
			}
		}
		req.Header.Set("Idempotency-Key", r.RunID+":"+r.StepID)
		req.Header.Set("X-FlowForge-Run-ID", r.RunID)
		req.Header.Set("X-FlowForge-Step-ID", r.StepID)
		req.Header.Set("X-FlowForge-Attempt", fmt.Sprint(r.Attempt))
		req.Header.Del("X-FlowForge-Callback-URL")
		req.Header.Set("X-FlowForge-Execution-Mode", "sync")
		if r.CallbackURL != "" {
			req.Header.Set("X-FlowForge-Execution-Mode", "async")
			req.Header.Set("X-FlowForge-Callback-URL", r.CallbackURL)
		}
		resp, err := client.Do(req)
		if err != nil { // Do not persist URLs, credentials, or callback capability tokens from wrapped errors.
			if ctx.Err() != nil {
				return nil, fmt.Errorf("HTTP request timed out or was cancelled")
			}
			return nil, fmt.Errorf("HTTP request failed (network, TLS, or destination policy)")
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024+1))
		if err != nil {
			return nil, fmt.Errorf("cannot read response")
		}
		if len(b) > 1024*1024 {
			return nil, fmt.Errorf("response exceeds 1 MiB")
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("HTTP status %d", resp.StatusCode)
		}
		var output any
		if len(b) > 0 {
			if json.Unmarshal(b, &output) != nil {
				output = string(b)
			}
		}
		return map[string]any{"status_code": resp.StatusCode, "body": output}, nil
	})
}
func builtinHandlers(c config.Config) map[string]Handler {
	h := HTTPHandler(c)
	return map[string]Handler{"http": h, "callback": h, "transform": HandlerFunc(func(_ context.Context, r Request) (any, error) { return r.Config["value"], nil })}
}
func redact(message string) string {
	// Callback payload errors are user supplied; keep event sizes bounded.
	if len(message) > 2000 {
		message = message[:2000]
	}
	return message
}
func retryAt(s workflow.Step, state *workflow.StepState, now time.Time) time.Time {
	// Persist the retry deadline so backoff survives process restarts.
	delay := s.RetryDelay(state.Attempts)
	return now.Add(delay)
}
