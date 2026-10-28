import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-medium leading-none transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-white/10 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[0_14px_34px_-16px_rgba(124,58,237,0.85),inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-110",
        secondary:
          "border border-white/10 bg-white/[0.05] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.09] hover:text-foreground",
        outline:
          "border border-white/15 bg-transparent text-foreground hover:bg-white/[0.06]",
        ghost:
          "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        destructive:
          "border border-rose-400/25 bg-rose-500/[0.12] text-rose-200 hover:bg-rose-500/20",
        link: "text-cyan-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
