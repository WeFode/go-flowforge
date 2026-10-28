import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full resize-y rounded-[10px] border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[13px] leading-relaxed text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow] duration-150",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-500/25 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
