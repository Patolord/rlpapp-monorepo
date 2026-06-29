import { cn } from "./lib/cn";

export interface LoadingStateProps {
  /** Optional label rendered next to/below the spinner. */
  label?: string;
  /** Spinner size in px. Defaults to 32. */
  size?: number;
  className?: string;
  /** When true, fills a min-height area and centers vertically. */
  fullHeight?: boolean;
}

/**
 * Standardized loading state: a centered spinner with an optional label.
 * Replaces ad-hoc `Loader2 animate-spin` blocks scattered across screens.
 */
function LoadingState({
  label,
  size = 32,
  className,
  fullHeight = false,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        fullHeight && "min-h-[50vh]",
        className,
      )}
    >
      <svg
        className="animate-spin text-muted-foreground"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : null}
    </div>
  );
}

export { LoadingState };
