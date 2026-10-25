package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	erp "github.com/WeFode/go-flowforge/examples/erp"

	"github.com/WeFode/go-flowforge/internal/config"
	"github.com/WeFode/go-flowforge/internal/engine"
	"github.com/WeFode/go-flowforge/internal/httpapi"
	"github.com/WeFode/go-flowforge/internal/store"
	"github.com/WeFode/go-flowforge/pkg/workflow"
)

func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "error", err)
		os.Exit(1)
	}
}
func run() error {
	path := flag.String("config", "", "optional YAML configuration file")
	migrate := flag.Bool("migrate-only", false, "apply schema and exit")
	flag.Parse()
	c, err := config.Load(*path)
	if err != nil {
		return err
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if c.RedisURL != "" {
		slog.Warn("redis_url is reserved; this release uses the PostgreSQL durable queue")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	db, err := store.Open(startup, c.DatabaseURL, c.DBConnections)
	if err != nil {
		return err
	}
	defer db.DB.Close()
	if err = db.Migrate(startup); err != nil {
		return err
	}
	if *migrate {
		return nil
	}
	if c.Demo {
		d := workflow.Definition{ID: "hello-workflow", Name: "AI 内容处理流水线", Description: "并行准备上下文与元数据，再合并产出；无需外部服务即可体验。", InputExample: map[string]any{"topic": "AI 工作流自动化"}, Enabled: true, Steps: []workflow.Step{
			{ID: "context", Name: "准备上下文", Type: "transform", Config: map[string]any{"value": map[string]any{"topic": "{{input.topic}}", "source": "knowledge base"}}},
			{ID: "metadata", Name: "生成元数据", Type: "transform", Config: map[string]any{"value": map[string]any{"language": "zh-CN", "channel": "api"}}},
			{ID: "cooldown", Name: "等待冷却时间", Type: "delay", DependsOn: []string{"context", "metadata"}, Config: map[string]any{"seconds": 2}},
			{ID: "result", Name: "合并结果", Type: "transform", DependsOn: []string{"cooldown"}, Config: map[string]any{"value": map[string]any{"context": "{{steps.context.output}}", "metadata": "{{steps.metadata.output}}", "message": "工作流执行完成"}}},
		}}
		factory, err := erp.Definition(c.DemoAgentURL)
		if err != nil {
			return err
		}
		for _, example := range []workflow.Definition{d, factory} {
			example.Normalize()
			if _, e := db.Workflow(ctx, example.ID); errors.Is(e, store.ErrNotFound) {
				if _, err = db.PutWorkflow(ctx, example, true); err != nil {
					return err
				}
			} else if e != nil {
				return e
			}
		}
	}
	wait := engine.New(db, c).Start(ctx)
	server := &http.Server{Addr: c.Listen, Handler: (&httpapi.Server{Store: db, Config: c}).Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("FlowForge ready", "listen", c.Listen, "workers", c.Workers, "queue", "postgresql")
	err = server.ListenAndServe()
	stop()
	wait()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
