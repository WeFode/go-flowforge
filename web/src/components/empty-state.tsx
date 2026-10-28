import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-muted-foreground [&_svg]:size-6">
        {icon}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
