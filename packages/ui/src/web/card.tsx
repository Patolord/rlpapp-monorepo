import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./lib/cn";

/**
 * Card — "Structured" restyle. The shell carries no vertical padding or gap:
 * each section (header / content / footer) owns its own padding, the header is
 * ruled off from the content, and the footer is a muted strip with actions on
 * the right.
 */
const cardVariants = cva(
  "bg-card text-card-foreground overflow-hidden rounded-xl text-sm/relaxed has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-lg *:[img:last-child]:rounded-lg group/card flex flex-col",
  {
    variants: {
      variant: {
        default: "border border-border shadow-xs",
        elevated: "border border-border shadow-md",
        interactive:
          "border border-border shadow-xs transition-all hover:shadow-md hover:border-primary/40 cursor-pointer",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Card({
  className,
  size = "default",
  variant,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-center gap-x-3 gap-y-0.5 border-b border-border px-[18px] py-[14px] last:border-b-0 has-data-[slot=card-action]:grid-cols-[1fr_auto] group-data-[size=sm]/card:px-[12px] group-data-[size=sm]/card:py-[10px]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "col-start-1 text-[0.9375rem] leading-snug font-semibold tracking-tight group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("col-start-1 text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-center justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-[18px] py-[16px] group-data-[size=sm]/card:p-[12px]",
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "bg-muted border-t border-border flex items-center justify-end gap-2 px-[18px] py-[10px] group-data-[size=sm]/card:px-[12px] group-data-[size=sm]/card:py-[8px]",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
