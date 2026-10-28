import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 使用 <label> 包裹控件，保证点击标签即可聚焦，
 * 同时让 Playwright 的 getByLabel 继续可用。
 */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && (
        <small className="text-[11px] leading-relaxed text-muted-foreground/70">
          {hint}
        </small>
      )}
    </label>
  );
}
