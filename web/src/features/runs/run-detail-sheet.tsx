import { useState } from "react";
import { Copy, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import type { Event, Run } from "@/types";
import { formatTime, terminal } from "@/types";
import { pretty } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { FlowGraph } from "@/features/designer/flow-graph";

export function RunDetailSheet({
  detail,
  events,
  selectedStep,
  busy,
  onSelectStep,
  onClose,
  onReplay,
  onCancel,
}: {
  detail: Run | null;
  events: Event[];
  selectedStep: string;
  busy: boolean;
  onSelectStep: (id: string) => void;
  onClose: () => void;
  onReplay: () => void;
  onCancel: () => void;
}) {
  const [onlyErrors, setOnlyErrors] = useState(false);

  const stepState =
    detail && selectedStep ? detail.steps[selectedStep] : undefined;
  const stepName = detail?.definition.steps.find(
    (step) => step.id === selectedStep,
  )?.name;
  const visibleEvents = onlyErrors
    ? events.filter((event) => event.type.includes("failed"))
    : events;
  const isTerminal = detail ? terminal(detail.status) : false;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        aria-label="执行详情"
        className="run-drawer w-[min(1180px,94vw)] max-w-none p-0"
      >
        <SheetTitle className="sr-only">执行详情</SheetTitle>
        <SheetDescription className="sr-only">
          执行实例的步骤状态、输出与事件时间线
        </SheetDescription>

        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <span className="text-[9px] font-semibold tracking-[0.14em] text-violet-300/80">
                执行详情
              </span>
              <h2 className="mt-2 truncate text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                {detail?.definition.name || "加载执行实例…"}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭执行详情"
              onClick={onClose}
              className="shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="run-summary flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
            {detail && (
              <>
                <StatusBadge status={detail.status} />
                <code className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {detail.id.slice(0, 16)}
                </code>
                <span className="text-[10px] text-muted-foreground">
                  v{detail.definition.version}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="复制实例 ID"
                  onClick={() => {
                    void navigator.clipboard.writeText(detail.id);
                    toast.success("实例 ID 已复制");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </>
            )}
            <div className="ml-auto flex gap-2">
              {isTerminal ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail || busy}
                  onClick={onReplay}
                >
                  <RefreshCw className="size-3.5" />
                  重跑
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail || busy}
                  onClick={onCancel}
                >
                  <X className="size-3.5" />
                  取消执行
                </Button>
              )}
            </div>
          </div>

          {!detail ? (
            <div className="grid flex-1 place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <div
              data-slot="drawer-scroll"
              className="scroll-thin min-h-0 flex-1 overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-white/[0.07] px-5 py-4 sm:grid-cols-4 sm:px-6">
                <Metric
                  label="创建时间"
                  value={formatTime(detail.created_at)}
                />
                <Metric
                  label="开始时间"
                  value={formatTime(detail.started_at)}
                />
                <Metric
                  label="完成时间"
                  value={formatTime(detail.finished_at)}
                />
                <Metric label="总耗时" value={durationOf(detail)} />
              </div>

              {detail.error && (
                <div className="border-b border-rose-400/15 bg-rose-500/[0.06] px-5 py-3 text-[11px] leading-relaxed text-rose-200 sm:px-6">
                  {detail.error}
                </div>
              )}

              <div className="flex h-[380px] shrink-0 flex-col border-b border-white/[0.07]">
                <FlowGraph
                  key={detail.id}
                  workflow={detail.definition}
                  selected={selectedStep}
                  onSelect={onSelectStep}
                  states={detail.steps}
                />
              </div>

              <div className="drawer-content px-5 py-6 sm:px-6">
                {stepState && (
                  <div className="output-panel mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-[14px] font-semibold text-foreground">
                        {stepName || selectedStep}
                      </h3>
                      <StatusBadge status={stepState.status} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="复制步骤输出"
                        className="ml-auto"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            pretty(stepState.output ?? null),
                          );
                          toast.success("步骤输出已复制");
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    <small className="mt-1.5 block text-[10px] text-muted-foreground/70">
                      尝试次数：{stepState.attempts}
                    </small>
                    {stepState.error && (
                      <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-rose-200">
                        {stepState.error}
                      </p>
                    )}
                    <pre className="mt-3 max-h-[340px] overflow-auto rounded-xl border border-white/[0.07] bg-[#070b14]/70 p-3.5 font-mono text-[11px] leading-[1.85] text-cyan-100/85">
                      {pretty(stepState.output ?? null)}
                    </pre>
                  </div>
                )}

                <details className="group rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[11px] text-muted-foreground transition-colors hover:text-secondary-foreground [&::-webkit-details-marker]:hidden">
                    输入数据
                    <span className="text-[9px] text-muted-foreground/50">
                      原始输入
                    </span>
                  </summary>
                  <pre className="max-h-[260px] overflow-auto border-t border-white/[0.06] p-4 font-mono text-[11px] leading-[1.85] text-muted-foreground">
                    {pretty(detail.input)}
                  </pre>
                </details>

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="events-title flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    执行时间线
                    <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px text-[9px] font-normal tabular-nums text-muted-foreground">
                      {events.length}
                    </span>
                  </h3>
                  <button
                    type="button"
                    aria-pressed={onlyErrors}
                    onClick={() => setOnlyErrors((value) => !value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[10px] transition-colors",
                      onlyErrors
                        ? "border-rose-400/30 bg-rose-500/[0.12] text-rose-200"
                        : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-secondary-foreground",
                    )}
                  >
                    仅看异常
                  </button>
                </div>

                <div className="timeline mt-4 border-l border-white/[0.08] pl-4">
                  {visibleEvents.map((event) => (
                    <div
                      key={event.id}
                      className="relative flex items-start gap-3 pb-5 last:pb-0"
                    >
                      <i
                        className={cn(
                          "absolute -left-[21px] top-1.5 size-1.5 rounded-full",
                          event.type.includes("failed")
                            ? "bg-rose-400"
                            : event.type.includes("succeeded") ||
                                event.type.includes("completed")
                              ? "bg-emerald-400"
                              : "bg-violet-300/70",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <strong className="text-[11.5px] font-medium text-secondary-foreground">
                            {event.step_id || "流程"}
                          </strong>
                          <span className="font-mono text-[9px] text-muted-foreground/60">
                            {event.type}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                          {event.message || "完成"}
                        </p>
                      </div>
                      <time className="shrink-0 font-mono text-[9.5px] text-muted-foreground/60">
                        {new Date(event.created_at).toLocaleTimeString(
                          "zh-CN",
                          {
                            hour12: false,
                          },
                        )}
                      </time>
                    </div>
                  ))}
                  {visibleEvents.length === 0 && (
                    <p className="pb-2 text-[11px] text-muted-foreground/60">
                      没有匹配的事件。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
        {label}
      </span>
      <strong className="mt-1.5 block text-[11.5px] font-normal tabular-nums text-secondary-foreground">
        {value}
      </strong>
    </div>
  );
}

function durationOf(run: Run) {
  if (!run.finished_at) return "进行中";
  const start = new Date(run.started_at || run.created_at).getTime();
  const end = new Date(run.finished_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${rest} 秒`;
}
