import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Layers3,
  LogOut,
  Workflow as WorkflowIcon,
} from "lucide-react";
import type { Section } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const items = [
  { id: "workflows", label: "工作流", icon: Layers3 },
  { id: "runs", label: "执行记录", icon: Activity },
  { id: "integrations", label: "开发者接入", icon: Code2 },
] as const;

export function AppSidebar({
  section,
  onSection,
  collapsed,
  onToggleCollapse,
  workflowCount,
  activeRuns,
  workers,
  onHome,
  onDisconnect,
  mobile = false,
  onNavigate,
}: {
  section: Section;
  onSection: (section: Section) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  workflowCount: number;
  activeRuns: number;
  workers: number;
  onHome: () => void;
  onDisconnect: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const compact = collapsed && !mobile;

  return (
    <aside
      className={cn(
        "flex h-full flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#070b14]/75 p-3 backdrop-blur-2xl",
        mobile && "rounded-none border-0 bg-transparent p-4",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-1.5 pt-1",
          compact && "justify-center",
        )}
      >
        <button
          type="button"
          onClick={onHome}
          aria-label="FlowForge 首页"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-white shadow-[0_10px_26px_-12px_rgba(124,58,237,0.9)] transition-transform duration-150 hover:scale-[1.03]"
        >
          <WorkflowIcon className="size-[18px]" />
        </button>
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                FlowForge
              </span>
              <span className="rounded border border-white/15 px-1 py-px text-[9px] tracking-[0.12em] text-muted-foreground">
                内测
              </span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground/70">
              工作流编排控制台
            </p>
          </div>
        )}
        {!mobile && !compact && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        )}
      </div>

      {compact && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="展开侧栏"
              onClick={onToggleCollapse}
              className="mx-auto"
            >
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">展开侧栏</TooltipContent>
        </Tooltip>
      )}

      {!compact && (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-[12px] font-semibold text-violet-200">
            F
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-secondary-foreground">
              默认工作空间
            </span>
            <span className="block truncate text-[10px] text-muted-foreground/70">
              独立部署 · v0.1
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground/60" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {!compact && (
          <p className="px-2 pb-2 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground/60">
            工作空间
          </p>
        )}
        <nav className="grid gap-1">
          {items.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            const button = (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onSection(id);
                  onNavigate?.();
                }}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-[background-color,color] duration-150",
                  active
                    ? "bg-white/[0.06] text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-secondary-foreground",
                  compact && "justify-center px-0",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[image:var(--gradient-brand)]" />
                )}
                <Icon
                  className={cn(
                    "size-[17px] shrink-0",
                    active ? "text-violet-300" : "text-muted-foreground/80",
                  )}
                />
                {!compact && <span className="flex-1">{label}</span>}
                {!compact && id === "workflows" && (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                    {workflowCount}
                  </span>
                )}
                {id === "runs" && activeRuns > 0 && (
                  <i className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_1px_rgba(52,211,153,0.7)]" />
                )}
              </button>
            );
            return compact ? (
              <Tooltip key={id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              button
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 pt-4">
          {compact ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mx-auto grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                引擎已连接 · {workers} 个 Worker
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
                <span className="text-[11px] font-medium text-secondary-foreground">
                  引擎已连接
                </span>
                <Activity className="ml-auto size-3.5 text-muted-foreground/60" />
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
                PostgreSQL 持久化队列 · {workers} 个 Worker
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            aria-label="断开连接"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-rose-500/[0.08] hover:text-rose-200",
              compact && "justify-center px-0",
            )}
          >
            <LogOut className="size-4" />
            {!compact && <span>断开连接</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
