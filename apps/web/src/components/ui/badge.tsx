import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

// 6px status dot rendered before the label (padding-left tightens to 8px).
const dot =
  "pl-[8px] before:size-[6px] before:shrink-0 before:rounded-full before:content-['']";

const badgeVariants = cva(
  // Shell: "Outline + dot" pill (2px x 9px, 12px/500, 6px gap). The status
  // variants add a 6px dot before the label; colour lives only on the dot.
  "inline-flex items-center gap-[6px] whitespace-nowrap rounded-full border border-control-border bg-card px-[9px] py-[2px] text-xs font-medium text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: cn(dot, "before:bg-status-danger"),
        outline: "",
        // Semantic status variants: outline pill + coloured dot.
        neutral: cn(dot, "before:bg-status-neutral"),
        info: cn(dot, "before:bg-status-info"),
        success: cn(dot, "before:bg-status-success"),
        warning: cn(dot, "before:bg-status-warning"),
        danger: cn(dot, "before:bg-status-danger"),
        muted: cn(dot, "text-muted-foreground before:bg-status-muted"),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
