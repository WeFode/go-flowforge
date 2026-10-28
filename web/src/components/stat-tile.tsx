import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  note,
  icon,
  progress,
}: {
  label: string;
  value: number | string;
  note: string;
  icon?: ReactNode;
  progress?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-violet-400/25 hover:bg-white/[0.04]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {typeof progress === "number" ? (
          <ProgressRing value={progress} />
        ) : (
          <span className="text-muted-foreground/70 [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <strong className="mt-4 block text-[30px] font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">
        {value}
      </strong>
      <small className="mt-3 block text-[11px] text-muted-foreground/80">
        {note}
      </small>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 15;
  return (
    <span
      className={cn("relative grid size-9 place-items-center")}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="url(#stat-ring)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
        <defs>
          <linearGradient id="stat-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[9px] font-semibold text-foreground/80 tabular-nums">
        {clamped}%
      </span>
    </span>
  );
}
