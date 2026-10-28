import { Activity, ArrowUpRight, GitBranch, RefreshCw } from "lucide-react";
import type { Run } from "@/types";
import { formatTime, labels } from "@/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";

const statuses = [
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
];

export function RunList({
  runs,
  page,
  filter,
  loading,
  onFilter,
  onPage,
  onOpen,
  onRefresh,
  onBackToWorkflows,
}: {
  runs: Run[];
  page: number;
  filter: string;
  loading: boolean;
  onFilter: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onBackToWorkflows: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <PageHeader
        eyebrow="每一次执行，都有迹可循"
        title="执行记录"
        description="追踪每一次触发、重试与完成，随时掌握流程状态与步骤输出。"
        actions={
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          实例列表
          <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
            {runs.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            状态筛选
          </span>
          <Select
            aria-label="筛选执行状态"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          >
            <option value="">全部状态</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {labels[status]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                <th className="px-5 py-3 font-medium">工作流 / 实例 ID</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">触发来源</th>
                <th className="px-5 py-3 font-medium">步骤进度</th>
                <th className="px-5 py-3 font-medium">创建时间</th>
                <th className="w-10 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && !runs.length
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-white/[0.05]">
                      <td className="px-5 py-4">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="mt-2 h-2.5 w-24" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="h-5 w-12 rounded-md" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="h-2 w-24" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="h-3 w-28" />
                      </td>
                      <td />
                    </tr>
                  ))
                : runs.map((run) => (
                    <RunRow key={run.id} run={run} onOpen={onOpen} />
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && !runs.length && (
          <EmptyState
            icon={<Activity />}
            title="还没有执行记录"
            description="运行一个工作流，执行过程、步骤输出与事件时间线将在这里实时呈现。"
            action={
              <Button variant="secondary" onClick={onBackToWorkflows}>
                <GitBranch className="size-4" />
                前往工作流
              </Button>
            }
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>第 {page + 1} 页 · 每页 30 条</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={runs.length < 30}
            onClick={() => onPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

function RunRow({ run, onOpen }: { run: Run; onOpen: (id: string) => void }) {
  const done = Object.values(run.steps).filter((step) =>
    ["succeeded", "failed", "skipped", "cancelled"].includes(step.status),
  ).length;
  const total = run.definition.steps.length || 1;
  const percent = Math.round((done / total) * 100);
  const source = run.source.startsWith("replay:") ? "replay" : run.source;

  return (
    <tr
      tabIndex={0}
      onClick={() => onOpen(run.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(run.id);
        }
      }}
      className="group cursor-pointer border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.035] focus-visible:bg-white/[0.04] focus-visible:outline-none"
    >
      <td className="px-5 py-4">
        <strong className="block text-[12.5px] font-medium text-foreground">
          {run.definition.name}
        </strong>
        <small className="mt-1 block font-mono text-[10px] text-muted-foreground/60">
          {run.id.slice(0, 16)}
        </small>
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-5 py-4">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {source}
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-1 w-20 overflow-hidden rounded-full bg-white/[0.08]">
            <span
              className="block h-full rounded-full bg-[image:var(--gradient-brand)]"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {done}
            <span className="text-muted-foreground/40"> / {total}</span>
          </span>
        </div>
      </td>
      <td className="px-5 py-4 text-[11px] tabular-nums text-muted-foreground">
        {formatTime(run.created_at)}
      </td>
      <td className="px-5 py-4 text-right">
        <ArrowUpRight className="ml-auto size-4 text-muted-foreground/40 transition-colors group-hover:text-violet-300" />
      </td>
    </tr>
  );
}
