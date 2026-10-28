import { labels } from "@/types";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  succeeded: "border-emerald-400/25 bg-emerald-400/[0.12] text-emerald-200",
  failed: "border-rose-400/25 bg-rose-400/[0.12] text-rose-200",
  cancelled: "border-slate-400/20 bg-slate-400/[0.08] text-slate-300",
  skipped: "border-slate-400/20 bg-slate-400/[0.08] text-slate-400",
  queued: "border-sky-400/25 bg-sky-400/[0.12] text-sky-200",
  pending: "border-violet-400/25 bg-violet-400/[0.12] text-violet-200",
  running: "border-amber-300/25 bg-amber-300/[0.12] text-amber-200",
  waiting: "border-amber-300/25 bg-amber-300/[0.12] text-amber-200",
  retry_wait: "border-amber-300/25 bg-amber-300/[0.12] text-amber-200",
  waiting_callback:
    "border-fuchsia-400/25 bg-fuchsia-400/[0.12] text-fuchsia-200",
  waiting_delay: "border-amber-300/25 bg-amber-300/[0.12] text-amber-200",
};

const live = new Set([
  "queued",
  "running",
  "waiting",
  "retry_wait",
  "waiting_callback",
  "waiting_delay",
]);

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      data-status={status}
      className={cn(
        "badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-relaxed",
        tones[status] ||
          "border-white/10 bg-white/[0.06] text-secondary-foreground",
        status,
        className,
      )}
    >
      <i
        className={cn(
          "size-1.5 rounded-full bg-current",
          live.has(status) && "animate-pulse",
        )}
      />
      {labels[status] || status}
    </span>
  );
}
