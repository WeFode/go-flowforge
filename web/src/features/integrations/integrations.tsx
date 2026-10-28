import { useState } from "react";
import {
  ArrowDownLeft,
  Clock3,
  Copy,
  Globe2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

const capabilities = [
  {
    icon: Globe2,
    title: "API / Webhook",
    description: "从应用、CI/CD 或第三方平台触发流程，输入即 JSON。",
    tag: "HTTP · JSON",
    tone: "text-sky-200 border-sky-400/20 bg-sky-400/[0.08]",
  },
  {
    icon: Clock3,
    title: "定时与延迟",
    description: "配置带时区的 Cron，或为单次执行指定计划时间。",
    tag: "CRON · 计划时间",
    tone: "text-amber-200 border-amber-300/20 bg-amber-300/[0.08]",
  },
  {
    icon: ArrowDownLeft,
    title: "异步任务回调",
    description: "分发长耗时任务，由外部服务在完成后上报结果。",
    tag: "异步回调",
    tone: "text-fuchsia-200 border-fuchsia-400/20 bg-fuchsia-400/[0.08]",
  },
];

const endpoints = [
  [
    "POST",
    "/api/v1/workflows/{id}/runs",
    "创建执行实例，支持 input、priority、scheduled_at",
  ],
  [
    "POST",
    "/api/v1/hooks/{id}",
    "Webhook 触发，同样使用 Bearer 鉴权与 input 包装",
  ],
  ["GET", "/api/v1/runs/{id}", "查询状态、步骤输出及错误"],
  ["GET", "/api/v1/runs/{id}/events?after=0", "按游标读取事件日志"],
  ["POST", "/api/v1/runs/{id}/cancel", "取消实例"],
  ["POST", "/api/v1/runs/{id}/replay", "按原定义快照重跑"],
  ["POST", "/api/v1/callbacks/{token}", "提交异步结果：status、output、error"],
] as const;

type Language = "curl" | "node" | "go";

export function Integrations() {
  const [language, setLanguage] = useState<Language>("curl");
  const origin =
    typeof location === "undefined" ? "http://localhost:8088" : location.origin;
  const snippet = snippets(origin)[language];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <PageHeader
        eyebrow="一次接入，处处运行"
        title="连接你的应用"
        description="让工作流成为产品、服务与 AI Agent 的执行层。统一的鉴权、幂等与重试语义，接入只需要一次请求。"
      />

      <div className="grid gap-3 md:grid-cols-3">
        {capabilities.map(({ icon: Icon, title, description, tag, tone }) => (
          <article
            key={title}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-[border-color,background-color] duration-200 hover:border-violet-400/25 hover:bg-white/[0.04]"
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-xl border",
                tone,
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <h3 className="mt-4 text-[14px] font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </p>
            <code className="mt-4 inline-block rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-muted-foreground/80">
              {tag}
            </code>
          </article>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070b14]/80">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <Terminal className="size-4 text-violet-200" />
          <span className="text-[12px] font-medium text-foreground">
            触发工作流
          </span>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {(
              [
                ["curl", "cURL"],
                ["node", "Node"],
                ["go", "Go"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={language === id}
                onClick={() => setLanguage(id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] transition-colors",
                  language === id
                    ? "bg-white/[0.09] text-foreground"
                    : "text-muted-foreground hover:text-secondary-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="复制调用示例"
            onClick={() => {
              void navigator.clipboard.writeText(snippet);
              toast.success("调用示例已复制");
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-[2] text-cyan-100/85 sm:p-5">
          {snippet}
        </pre>
      </div>

      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          核心接口
          <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
            {endpoints.length}
          </span>
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08]">
          {endpoints.map(([method, path, description]) => (
            <div
              key={path}
              className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-3.5 transition-colors last:border-0 hover:bg-white/[0.025] sm:px-5"
            >
              <code
                className={cn(
                  "w-11 shrink-0 rounded-md border px-1 py-0.5 text-center font-mono text-[9px]",
                  method === "POST"
                    ? "border-emerald-400/25 bg-emerald-400/[0.1] text-emerald-200"
                    : "border-sky-400/25 bg-sky-400/[0.1] text-sky-200",
                )}
              >
                {method}
              </code>
              <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-secondary-foreground">
                {path}
              </code>
              <span className="hidden text-[11px] text-muted-foreground lg:block">
                {description}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`复制接口 ${path}`}
                onClick={() => {
                  void navigator.clipboard.writeText(path);
                  toast.success("接口路径已复制");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300/80" />
        每次部署是一个独立工作空间。API 使用共享 Bearer
        Token；回调使用按尝试生成的限时令牌。环境密钥通过 FLOWFORGE_SECRET_
        前缀注入，不会写入工作流定义。
      </p>
    </div>
  );
}

function snippets(origin: string): Record<Language, string> {
  return {
    curl: `curl -X POST ${origin}/api/v1/workflows/hello-workflow/runs \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: unique-business-key' \\
  -d '{"input": {"topic": "AI 工作流"}}'`,
    node: `await fetch("${origin}/api/v1/workflows/hello-workflow/runs", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_TOKEN",
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ input: { topic: "AI 工作流" } }),
});`,
    go: `body := strings.NewReader(\`{"input":{"topic":"AI 工作流"}}\`)
req, _ := http.NewRequest("POST", "${origin}/api/v1/workflows/hello-workflow/runs", body)
req.Header.Set("Authorization", "Bearer YOUR_TOKEN")
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Idempotency-Key", "unique-business-key")`,
  };
}
