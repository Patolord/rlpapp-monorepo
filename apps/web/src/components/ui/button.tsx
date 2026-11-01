import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-[6px] rounded-sm border border-transparent bg-clip-padding text-sm font-medium tracking-[-0.006em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] duration-150 ease-snappy outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring/45 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:border-transparent disabled:bg-control-disabled disabled:text-control-disabled-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[16px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover aria-expanded:bg-primary-hover",
        outline:
          "border-control-border bg-card text-foreground shadow-xs hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-control-border bg-card text-destructive shadow-xs hover:bg-muted aria-expanded:bg-muted",
        link: "bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[36px] px-[14px] has-data-[icon=inline-end]:pr-[10px] has-data-[icon=inline-start]:pl-[10px]",
        xs: "h-[28px] gap-[4px] px-[10px] text-xs has-data-[icon=inline-end]:pr-[6px] has-data-[icon=inline-start]:pl-[6px] [&_svg:not([class*='size-'])]:size-[12px]",
        sm: "h-[32px] px-[12px] has-data-[icon=inline-end]:pr-[8px] has-data-[icon=inline-start]:pl-[8px] [&_svg:not([class*='size-'])]:size-[14px]",
        lg: "h-[40px] gap-[8px] px-[16px] has-data-[icon=inline-end]:pr-[12px] has-data-[icon=inline-start]:pl-[12px]",
        /** Tall touch target for field/mobile screens (48px). */
        xl: "h-[48px] gap-[8px] px-[18px] text-base has-data-[icon=inline-end]:pr-[14px] has-data-[icon=inline-start]:pl-[14px] [&_svg:not([class*='size-'])]:size-[18px]",
        icon: "size-[36px]",
        "icon-xs": "size-[28px] [&_svg:not([class*='size-'])]:size-[12px]",
        "icon-sm": "size-[32px] [&_svg:not([class*='size-'])]:size-[14px]",
        "icon-lg": "size-[40px]",
        "icon-xl": "size-[48px] [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        size: ["default", "xs", "sm", "lg", "xl"],
        className: "px-[4px]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
