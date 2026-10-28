import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Clock3,
  Copy,
  Download,
  GitBranch,
  Globe2,
  Layers3,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Terminal,
  Upload,
  Zap,
} from "lucide-react";
import type { Workflow } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const icons: Record<string, typeof Globe2> = {
  http: Globe2,
  transform: Braces,
  delay: Clock3,
  callback: ArrowDownLeft,
};

type Filter = "all" | "enabled" | "disabled";

export function WorkflowList({
  workflows,
  stats,
  loading,
  onOpen,
  onRun,
  onCreate,
  onImport,
  onExport,
  onCopyId,
  onIntegrations,
}: {
  workflows: Workflow[];
  stats: Record<string, number>;
  loading: boolean;
  onOpen: (workflow: Workflow) => void;
  onRun: (workflow: Workflow) => void;
  onCreate: () => void;
  onImport: () => void;
  onExport: (workflow: Workflow) => void;
  onCopyId: (workflow: Workflow) => void;
  onIntegrations: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  const active =
    (stats.running || 0) + (stats.waiting || 0) + (stats.queued || 0);
  const successRate = total
    ? Math.round(((stats.succeeded || 0) / total) * 100)
    : 0;

  const visible = useMemo(
    () =>
      workflows.filter((workflow) => {
        if (filter === "enabled" && !workflow.enabled) return false;
        if (filter === "disabled" && workflow.enabled) return false;
        return (workflow.name + workflow.id)
          .toLowerCase()
          .includes(search.trim().toLowerCase());
      }),
    [workflows, filter, search],
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <PageHeader
        eyebrow="把复杂流程，拆成确定的步骤"
        title="工作流"
        description="连接服务、编排任务，让复杂流程自动运转。每一次修改都会生成新的定义快照。"
        actions={
          <>
            <Button variant="secondary" onClick={onImport}>
              <Upload className="size-4" />
              导入
            </Button>
            <Button onClick={onCreate}>
              <Plus className="size-4" />
              新建工作流
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-5 h-7 w-16" />
              <Skeleton className="mt-4 h-2.5 w-24" />
            </div>
          ))
        ) : (
          <>
            <StatTile
              label="工作流"
              value={workflows.length}
              note={`${workflows.filter((workflow) => workflow.enabled).length} 个已启用`}
              icon={<Layers3 />}
            />
            <StatTile
              label="累计执行"
              value={total}
              note="所有触发方式"
              icon={<Zap />}
            />
            <StatTile
              label="进行中"
              value={active}
              note="运行、排队及等待"
              icon={<Activity />}
            />
            <StatTile
              label="执行成功率"
              value={total ? `${successRate}%` : "—"}
              note={`${stats.succeeded || 0} 次成功完成`}
              progress={total ? successRate : undefined}
            />
          </>
        )}
      </div>

      <div className="mt-9 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="mr-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            全部工作流
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
              {workflows.length}
            </span>
          </h2>
          <div className="flex rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5">
            {(
              [
                ["all", "全部", workflows.length],
                [
                  "enabled",
                  "已启用",
                  workflows.filter((workflow) => workflow.enabled).length,
                ],
                [
                  "disabled",
                  "已停用",
                  workflows.filter((workflow) => !workflow.enabled).length,
                ],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors",
                  filter === id
                    ? "bg-white/[0.09] text-foreground"
                    : "text-muted-foreground hover:text-secondary-foreground",
                )}
              >
                {label}
                <span aria-hidden="true" className="text-[10px] opacity-60">
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full max-w-none sm:max-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索工作流"
            placeholder="搜索工作流…"
            className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-[12px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-violet-400/45 focus-visible:ring-2 focus-visible:ring-violet-500/20"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
            >
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="mt-5 h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
              <div className="mt-6 flex gap-2">
                {Array.from({ length: 4 }).map((__, chip) => (
                  <Skeleton key={chip} className="size-7 rounded-lg" />
                ))}
              </div>
              <Skeleton className="mt-6 h-3 w-28" />
            </div>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
          <EmptyState
            icon={<GitBranch />}
            title="从第一个工作流开始"
            description="创建一个可视化流程，或导入已有的 JSON 定义；保存后即可通过 API、Webhook 或 Cron 触发。"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={onImport}>
                  <Upload className="size-4" />
                  导入 JSON
                </Button>
                <Button onClick={onCreate}>
                  <Plus className="size-4" />
                  创建第一个工作流
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onOpen={onOpen}
              onRun={onRun}
              onExport={onExport}
              onCopyId={onCopyId}
            />
          ))}
          {visible.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-white/10 py-14 text-center text-[12px] text-muted-foreground">
              没有符合条件的流程，试试调整筛选或搜索关键词。
            </div>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="group flex min-h-[248px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] text-muted-foreground transition-[border-color,background-color] duration-200 hover:border-violet-400/35 hover:bg-violet-500/[0.04] hover:text-secondary-foreground"
          >
            <span className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] transition-transform duration-200 group-hover:scale-105 group-hover:border-violet-400/30 group-hover:text-violet-200">
              <Plus className="size-5" />
            </span>
            <strong className="text-[12px] font-medium">从一个想法开始</strong>
            <small className="text-[10px] text-muted-foreground/60">
              创建你的下一个工作流
            </small>
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-r from-violet-500/[0.06] via-white/[0.02] to-cyan-400/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-cyan-200">
            <Terminal className="size-[18px]" />
          </span>
          <div>
            <h3 className="text-[13px] font-medium text-foreground">
              为开发者与 AI 应用而生
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              通过 API、Webhook 或 Cron 触发，使用同一套可靠的执行机制。
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onIntegrations}
          className="self-start sm:self-auto"
        >
          查看接入方式
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onOpen,
  onRun,
  onExport,
  onCopyId,
}: {
  workflow: Workflow;
  onOpen: (workflow: Workflow) => void;
  onRun: (workflow: Workflow) => void;
  onExport: (workflow: Workflow) => void;
  onCopyId: (workflow: Workflow) => void;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-violet-400/25 hover:bg-white/[0.04] hover:shadow-[0_28px_60px_-40px_rgba(124,58,237,0.6)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/[0.08] text-violet-200">
          <GitBranch className="size-[18px]" />
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex items-center gap-1.5 text-[10px]",
              workflow.enabled
                ? "text-emerald-300/90"
                : "text-muted-foreground/60",
            )}
          >
            <i
              className={cn(
                "size-1.5 rounded-full",
                workflow.enabled ? "bg-emerald-400" : "bg-slate-500",
              )}
            />
            {workflow.enabled ? "已启用" : "已停用"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="工作流快捷操作"
                className="-mr-1.5 size-7 text-muted-foreground/60"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!workflow.enabled}
                onSelect={() => onRun(workflow)}
              >
                <Play className="size-4" />
                运行
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport(workflow)}>
                <Download className="size-4" />
                导出 JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onCopyId(workflow)}>
                <Copy className="size-4" />
                复制工作流 ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpen(workflow)}
        className="mt-4 flex items-start justify-between gap-2 text-left"
      >
        <span className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {workflow.name}
        </span>
        <ArrowUpRight className="mt-0.5 size-4 text-muted-foreground/40 transition-colors group-hover:text-violet-300" />
      </button>
      <p className="mt-2 line-clamp-2 min-h-[36px] text-[12px] leading-relaxed text-muted-foreground">
        {workflow.description || "添加描述，记录这个工作流的用途。"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {workflow.steps.slice(0, 5).map((step, index) => {
          const Icon = icons[step.type] || Braces;
          return (
            <span key={step.id} className="contents">
              {index > 0 && <span className="h-px w-3 bg-white/10" />}
              <span
                data-type={step.type}
                title={step.name}
                className="mini-node grid size-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground"
              >
                <Icon className="size-3.5" />
              </span>
            </span>
          );
        })}
        {workflow.steps.length > 5 && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">
            +{workflow.steps.length - 5}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">
        <span>
          {workflow.steps.length} 个步骤
          <span className="px-1.5 text-white/15">·</span>v{workflow.version}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!workflow.enabled}
          onClick={() => onRun(workflow)}
          className="-mr-2 h-7 gap-1 px-2 text-[11px] text-emerald-200/90 hover:bg-emerald-400/[0.08] hover:text-emerald-100"
        >
          <Play className="size-3" />
          运行
        </Button>
      </div>
    </article>
  );
}
