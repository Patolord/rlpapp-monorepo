import { cn } from "./lib/cn";

export interface LoadingStateProps {
  /**
   * "spinner" (default): short actions or a small area.
   * "skeleton": first load; renders a few skeleton lines (prefer composing
   *   `Skeleton` to mirror the real layout).
   * "progress": reload with data on screen; a thin indeterminate top bar.
   */
  variant?: "spinner" | "skeleton" | "progress";
  /** Optional label, e.g. a gerund ("Salvando…"). Rendered beside the spinner. */
  label?: string;
  /** Spinner size in px. Defaults to 18 (use 14 inside buttons). */
  size?: number;
  className?: string;
  /** When true, fills a min-height area and centers vertically. */
  fullHeight?: boolean;
}

/** Shared skeleton block colour + shine (muted-foreground 16% into card). */
const skeletonClasses =
  "block bg-[linear-gradient(90deg,color-mix(in_oklab,var(--muted-foreground)_16%,var(--card))_0%,color-mix(in_oklab,var(--muted-foreground)_7%,var(--card))_50%,color-mix(in_oklab,var(--muted-foreground)_16%,var(--card))_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:[animation-duration:3s]";

function Spinner({ size }: { size: number }) {
  return (
    <svg
      className="shrink-0 animate-spin text-primary [animation-duration:0.8s] motion-reduce:[animation-duration:3s] [.text-current>&]:text-current"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Loading tools:
 * - spinner (default): a small `primary` spinner with an optional label beside it.
 *   Inside a button use `<LoadingState size={14} className="text-current" />`
 *   so it takes the button's text colour (and disable the button while it spins).
 * - skeleton: first load (see `Skeleton`); mark the container `aria-busy`.
 * - progress: reload with data on screen (see `ProgressBar`).
 * Never show a big centred spinner on an empty screen.
 */
function LoadingState({
  variant = "spinner",
  label,
  size = 18,
  className,
  fullHeight = false,
}: LoadingStateProps) {
  if (variant === "progress") {
    return <ProgressBar className={className} label={label} />;
  }

  if (variant === "skeleton") {
    return (
      <div
        aria-busy="true"
        aria-label={label}
        className={cn(
          "flex flex-col gap-[12px] px-[18px] py-[14px]",
          fullHeight && "min-h-[50vh]",
          className,
        )}
      >
        <Skeleton width="85%" />
        <Skeleton width="70%" />
        <Skeleton width="60%" />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-[8px] text-sm text-muted-foreground",
        fullHeight && "min-h-[50vh]",
        className,
      )}
    >
      <Spinner size={size} />
      {label ? <span>{label}</span> : <span className="sr-only">Carregando…</span>}
    </div>
  );
}

export interface SkeletonProps {
  /** "line" (12px text bar), "pill" (20px badge), "value" (26px metric value). */
  shape?: "line" | "pill" | "value";
  /** CSS width, e.g. "70%" or 120. Vary widths (60–85%) across rows. */
  width?: number | string;
  className?: string;
}

/** Skeleton block for first loads. Mirror the real layout. */
function Skeleton({ shape = "line", width, className }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        skeletonClasses,
        shape === "line" && "h-[12px] rounded-[4px]",
        shape === "pill" && "h-[20px] rounded-full",
        shape === "value" && "h-[26px] rounded-[4px]",
        className,
      )}
      style={width !== undefined ? { width } : undefined}
    />
  );
}

export interface ProgressBarProps {
  className?: string;
  /** Accessible label. Defaults to "Carregando". */
  label?: string;
}

/**
 * Thin (2px) indeterminate progress bar for reloads; place it on the top edge
 * of the card while the old content stays visible at 50% opacity.
 */
function ProgressBar({ className, label = "Carregando" }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-busy="true"
      className={cn("relative h-[2px] overflow-hidden bg-border", className)}
    >
      <div className="absolute inset-y-0 left-0 w-[40%] rounded-[2px] bg-primary animate-progress motion-reduce:[animation-duration:3s]" />
    </div>
  );
}

export { LoadingState, ProgressBar, Skeleton };
