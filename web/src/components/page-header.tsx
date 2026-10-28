import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80">
          <i className="h-px w-6 bg-gradient-to-r from-violet-400 to-cyan-300" />
          {eyebrow}
        </span>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[32px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
