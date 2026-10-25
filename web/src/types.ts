export type Step = {
  id: string;
  name: string;
  type: string;
  execution_mode: "sync" | "async";
  depends_on: string[];
  timeout_seconds: number;
  retry: { max_attempts: number; initial_seconds: number; max_seconds: number };
  on_error: string;
  affects_run?: boolean;
  join: string;
  condition?: { path: string; op: string; value?: unknown };
  config: Record<string, unknown>;
};
export type Workflow = {
  id: string;
  name: string;
  description: string;
  input_example?: Record<string, unknown>;
  enabled: boolean;
  version: number;
  concurrency: number;
  max_active_runs: number;
  timeout_seconds: number;
  window?: { start: string; end: string; timezone: string; days?: number[] };
  schedule?: { cron: string; timezone: string };
  steps: Step[];
};
export type StepState = {
  status: string;
  attempts: number;
  output?: unknown;
  error?: string;
  next_at?: string;
  started_at?: string;
  finished_at?: string;
};
export type Run = {
  id: string;
  workflow_id: string;
  definition: Workflow;
  input: Record<string, unknown>;
  status: string;
  source: string;
  priority: number;
  steps: Record<string, StepState>;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
};
export type Event = {
  id: number;
  step_id?: string;
  type: string;
  message: string;
  created_at: string;
};
export const labels: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  waiting: "等待中",
  pending: "待执行",
  retry_wait: "等待重试",
  waiting_callback: "等待回调",
  waiting_delay: "延时等待",
  succeeded: "已成功",
  failed: "已失败",
  skipped: "已跳过",
  cancelled: "已取消",
};
export const typeNames: Record<string, string> = {
  http: "HTTP 请求",
  transform: "数据转换",
  delay: "延时等待",
  callback: "HTTP 请求",
};
export const modeOf = (step: Step): "sync" | "async" =>
  step.execution_mode ||
  (step.type === "callback" || step.type === "delay" ? "async" : "sync");
export const terminal = (status: string) =>
  ["succeeded", "failed", "cancelled"].includes(status);
export const makeStep = (type: string, id: string): Step => ({
  id,
  name: typeNames[type],
  type,
  execution_mode: type === "callback" || type === "delay" ? "async" : "sync",
  depends_on: [],
  timeout_seconds: type === "callback" ? 3600 : 60,
  retry: { max_attempts: 1, initial_seconds: 2, max_seconds: 300 },
  on_error: "stop",
  affects_run: true,
  join: "all_success",
  config:
    type === "http" || type === "callback"
      ? {
          url: "https://example.com/api/jobs",
          method: "POST",
          body: "{{input}}",
        }
      : type === "delay"
        ? { seconds: 5 }
        : { value: "{{input}}" },
});
export const makeWorkflow = (): Workflow => ({
  id: "workflow-" + Date.now().toString(36),
  name: "未命名工作流",
  description: "",
  enabled: true,
  version: 0,
  concurrency: 4,
  max_active_runs: 16,
  timeout_seconds: 86400,
  steps: [makeStep("transform", "start")],
});
export const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
