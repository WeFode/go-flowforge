import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-relaxed",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/[0.06] text-secondary-foreground",
        success: "border-emerald-400/25 bg-emerald-400/[0.12] text-emerald-200",
        warning: "border-amber-300/25 bg-amber-300/[0.12] text-amber-200",
        danger: "border-rose-400/25 bg-rose-400/[0.12] text-rose-200",
        info: "border-sky-400/25 bg-sky-400/[0.12] text-sky-200",
        violet: "border-violet-400/25 bg-violet-400/[0.12] text-violet-200",
        outline: "border-white/15 bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
