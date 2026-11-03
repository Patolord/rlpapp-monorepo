import * as React from "react";

import { cn } from "./lib/cn";

export interface MetricStripProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * MetricStrip — "Single strip" restyle: one card shell holding 3–4
 * `MetricCard` cells laid out as a responsive grid of equal columns, separated
 * by hairline dividers. Cells are at least 240px wide and wrap on narrow
 * screens, so full currency totals (e.g. "R$ 1.234.567,89") stay readable.
 */
function MetricStrip({ children, className }: MetricStripProps) {
  return (
    <div
      data-slot="metric-strip"
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface MetricCardProps {
  title: React.ReactNode;
  value: React.ReactNode;
  /** Pre-formatted change, with sign (e.g. "+12%"). Omit to hide the change. */
  delta?: React.ReactNode;
  /** Direction of the change; drives the arrow. */
  trend?: "up" | "down";
  /** Whether the change is good or bad; drives the colour (not the direction). */
  sentiment?: "positive" | "negative";
  /** Muted text after the delta (e.g. "vs. mês passado"). */
  context?: React.ReactNode;
  /** Backward-compatible alias for `context`. */
  description?: React.ReactNode;
  /**
   * Accepted for backward compatibility but no longer rendered: the
   * "Single strip" design has no corner icon.
   */
  icon?: React.ReactNode;
  className?: string;
}

function TrendArrow({ trend }: { trend: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0"
    >
      {trend === "up" ? (
        <path d="M7 7h10v10M7 17 17 7" />
      ) : (
        <path d="m7 7 10 10M17 7v10H7" />
      )}
    </svg>
  );
}

/**
 * One metric cell: quiet label, large tabular value and an optional coloured
 * change line. Place inside a `MetricStrip`.
 */
function MetricCard({
  title,
  value,
  delta,
  trend,
  sentiment,
  context,
  description,
  icon: _icon,
  className,
}: MetricCardProps) {
  const contextText = context ?? description;
  const hasDelta = delta !== undefined && delta !== null && delta !== "";
  const hasChange = hasDelta || (contextText !== undefined && contextText !== null);

  return (
    <div
      data-slot="metric-card"
      className={cn(
        "@container min-w-0 px-[20px] py-[16px] shadow-[-1px_0_0_var(--border),0_-1px_0_var(--border)]",
        className,
      )}
    >
      <div className="text-[0.8125rem] leading-snug font-medium text-muted-foreground">
        {title}
      </div>
      {/* 22px in narrow cells, 28px once the cell has room; long values wrap instead of clipping. */}
      <div className="mt-[6px] text-[22px] leading-[28px] font-semibold tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere] @[300px]:text-[28px] @[300px]:leading-[34px]">
        {value}
      </div>
      {hasChange ? (
        <div className="mt-[6px] flex flex-wrap items-center gap-x-[6px] gap-y-0.5 text-xs text-muted-foreground">
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                sentiment === "positive" && "text-trend-positive",
                sentiment === "negative" && "text-trend-negative",
              )}
            >
              {trend ? <TrendArrow trend={trend} /> : null}
              {delta}
            </span>
          ) : null}
          {contextText !== undefined && contextText !== null ? (
            <div className="min-w-0">{contextText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { MetricCard, MetricStrip };
