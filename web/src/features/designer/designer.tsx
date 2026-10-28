import {
  Braces,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Download,
  Globe2,
  Play,
  Plus,
  Save,
  Settings2,
  Workflow as WorkflowIcon,
} from "lucide-react";
import type { Step, Workflow } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlowGraph } from "@/features/designer/flow-graph";
import { Inspector } from "@/features/designer/inspector";

const addableTypes = [
  {
    type: "http",
    icon: Globe2,
    name: "HTTP 请求",
    description: "调用任意 HTTP 服务，支持同步或异步",
  },
  {
    type: "transform",
    icon: Braces,
    name: "数据转换",
    description: "映射输入与前置步骤的输出",
  },
  {
    type: "delay",
    icon: Clock3,
    name: "延时等待",
    description: "释放 Worker，由引擎持久化等待",
  },
] as const;

export function Designer({
  draft,
  step,
  tab,
  jsonText,
  dirty,
  busy,
  onBack,
  onSave,
  onRun,
  onExport,
  onSelectStep,
  onTabChange,
  onJsonChange,
  onChange,
  onUpdateStep,
  onAddStep,
  onDeleteStep,
  onDeleteWorkflow,
}: {
  draft: Workflow;
  step?: Step;
  tab: "canvas" | "json";
  jsonText: string;
  dirty: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
  onRun: () => void;
  onExport: () => void;
  onSelectStep: (id: string) => void;
  onTabChange: (tab: "canvas" | "json") => void;
  onJsonChange: (value: string) => void;
  onChange: (update: Partial<Workflow>) => void;
  onUpdateStep: (update: Partial<Step>) => void;
  onAddStep: (type: string) => void;
  onDeleteStep: () => void;
  onDeleteWorkflow: () => void;
}) {
  return (
    <div className="designer flex flex-col lg:h-[calc(100dvh-60px)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c16]/70 px-3 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="返回工作流列表"
            onClick={onBack}
          >
            <ChevronLeft className="size-[18px]" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="max-w-[160px] truncate text-[13px] font-semibold text-foreground sm:max-w-[320px]">
                {draft.name}
              </strong>
              {dirty && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/[0.1] px-1.5 py-px text-[9px] text-amber-200">
                  <i className="size-1 rounded-full bg-amber-300" />
                  未保存
                </span>
              )}
            </div>
            <small className="mt-0.5 block max-w-[190px] truncate text-[10px] text-muted-foreground/70 sm:max-w-none">
              {draft.id}
              <span className="px-1.5 text-white/15">·</span>
              {dirty ? "有未保存的修改" : "v" + draft.version}
            </small>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            aria-label="导出"
            onClick={onExport}
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">导出</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || dirty || !draft.version || !draft.enabled}
            onClick={onRun}
          >
            <Play className="size-3.5" />
            运行
          </Button>
          <Button size="sm" disabled={busy} onClick={onSave}>
            <Save className="size-3.5" />
            保存
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <div className="flex min-h-[520px] min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
              <button
                type="button"
                aria-pressed={tab === "canvas"}
                onClick={() => onTabChange("canvas")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] transition-[background-color,color,box-shadow]",
                  tab === "canvas"
                    ? "bg-white/[0.09] text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                    : "text-muted-foreground hover:text-secondary-foreground",
                )}
              >
                <WorkflowIcon className="size-3.5" />
                可视化
              </button>
              <button
                type="button"
                aria-pressed={tab === "json"}
                onClick={() => onTabChange("json")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] transition-[background-color,color,box-shadow]",
                  tab === "json"
                    ? "bg-white/[0.09] text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                    : "text-muted-foreground hover:text-secondary-foreground",
                )}
              >
                <Braces className="size-3.5" />
                JSON
              </button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Plus className="size-3.5" />
                  添加步骤
                  <ChevronDown className="size-3 text-muted-foreground/70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>选择步骤类型</DropdownMenuLabel>
                {addableTypes.map(({ type, icon: Icon, name, description }) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() => onAddStep(type)}
                    className="items-start gap-3 py-2.5"
                  >
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-violet-200">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] text-foreground">
                        {name}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground/70">
                        {description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground/60">
                  异步回调可在 HTTP 步骤中切换执行模式。
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {tab === "canvas" ? (
            <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-4">
              <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07]">
                <FlowGraph
                  key={draft.id}
                  workflow={draft}
                  selected={step?.id}
                  onSelect={onSelectStep}
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.07]">
                <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-4 py-2">
                  <span className="text-[11px] text-muted-foreground">
                    直接编辑定义，切换回可视化时会自动校验
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        onJsonChange(
                          JSON.stringify(JSON.parse(jsonText), null, 2),
                        );
                      } catch {
                        /* 保留原文本，等待用户修正 */
                      }
                    }}
                    className="text-[10px] text-violet-300/80 transition-colors hover:text-violet-200"
                  >
                    格式化
                  </button>
                </div>
                <textarea
                  aria-label="工作流 JSON"
                  spellCheck={false}
                  value={jsonText}
                  onChange={(event) => onJsonChange(event.target.value)}
                  className="dot-grid min-h-[430px] flex-1 resize-none bg-[#070b14]/70 p-5 font-mono text-[12px] leading-[1.9] text-secondary-foreground outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2.5 text-[10px] text-muted-foreground">
            <span className="hidden items-center gap-1.5 sm:flex">
              <i className="size-1.5 rounded-full bg-emerald-400" />
              DAG 依赖编排
            </span>
            <span>
              {draft.steps.length} 个步骤 · 最大并行 {draft.concurrency}
            </span>
            <button
              type="button"
              onClick={() => onSelectStep("")}
              className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-violet-200"
            >
              流程设置
              <Settings2 className="size-3" />
            </button>
          </div>
        </div>

        <Inspector
          draft={draft}
          step={step}
          busy={busy}
          onChange={onChange}
          onUpdateStep={onUpdateStep}
          onSelectStep={onSelectStep}
          onDeleteStep={onDeleteStep}
          onDeleteWorkflow={onDeleteWorkflow}
        />
      </div>
    </div>
  );
}
