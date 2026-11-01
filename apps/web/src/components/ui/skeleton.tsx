import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-[4px] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--muted-foreground)_16%,var(--card))_0%,color-mix(in_oklab,var(--muted-foreground)_7%,var(--card))_50%,color-mix(in_oklab,var(--muted-foreground)_16%,var(--card))_100%)] bg-[length:200%_100%] motion-reduce:[animation-duration:3s]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
