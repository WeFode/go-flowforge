import { useEffect, useId, useState } from "react";
import { Braces, Loader2, Play } from "lucide-react";
import type { Workflow } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/field";

export function RunDialog({
  workflow,
  inputText,
  runAt,
  busy,
  onInputChange,
  onRunAtChange,
  onClose,
  onStart,
}: {
  workflow: Workflow;
  inputText: string;
  runAt: string;
  busy: boolean;
  onInputChange: (value: string) => void;
  onRunAtChange: (value: string) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const [error, setError] = useState("");
  const inputID = useId();

  useEffect(() => {
    setError(validate(inputText));
  }, [inputText]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <span className="text-[9px] font-semibold tracking-[0.14em] text-violet-300/80">
            新建执行实例
          </span>
          <DialogTitle>运行工作流</DialogTitle>
          <DialogDescription>
            {workflow.name}
            <span className="px-1.5 text-white/20">·</span>v{workflow.version}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={inputID}
                className="text-xs font-medium text-muted-foreground"
              >
                输入数据（JSON）
              </label>
              <button
                type="button"
                onClick={() => {
                  try {
                    onInputChange(
                      JSON.stringify(JSON.parse(inputText), null, 2),
                    );
                  } catch {
                    setError("输入必须是 JSON 对象");
                  }
                }}
                className="flex items-center gap-1 text-[10px] text-violet-300/80 transition-colors hover:text-violet-200"
              >
                <Braces className="size-3" />
                格式化
              </button>
            </div>
            <textarea
              id={inputID}
              spellCheck={false}
              rows={8}
              value={inputText}
              onChange={(event) => onInputChange(event.target.value)}
              className={cn(
                "min-h-[170px] w-full resize-y rounded-[10px] border border-white/10 bg-[#070b14]/70 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-500/25",
                error && "border-rose-400/50",
              )}
            />
            {error ? (
              <p className="text-[11px] text-rose-300">{error}</p>
            ) : (
              <small className="text-[11px] leading-relaxed text-muted-foreground/70">
                步骤通过 {"{{input.字段名}}"} 引用这些数据。
              </small>
            )}
          </div>

          <Field
            label="计划执行时间（可选）"
            hint="留空立即入队；时间使用当前浏览器时区。"
          >
            <input
              type="datetime-local"
              value={runAt}
              onChange={(event) => onRunAtChange(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-white/10 bg-white/[0.035] px-3 text-[12px] text-foreground outline-none transition focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-500/25"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !!error} onClick={onStart}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            开始执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function validate(text: string) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return "输入必须是 JSON 对象";
    return "";
  } catch {
    return "输入必须是 JSON 对象";
  }
}
