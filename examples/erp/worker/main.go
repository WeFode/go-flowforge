package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/WeFode/go-flowforge/examples/erp/agents"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	origin := os.Getenv("FLOWFORGE_REPORT_ORIGIN")
	if origin == "" {
		origin = "http://app:8088"
	}
	service := agents.New(ctx, origin)
	server := &http.Server{Addr: ":8090", Handler: service.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("ERP demo agents ready", "listen", ":8090")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("demo agent server failed", "error", err)
		os.Exit(1)
	}
}
