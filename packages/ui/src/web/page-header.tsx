import * as React from "react";

import { cn } from "./lib/cn";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action(s) aligned to the end of the header (e.g. a button). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Standardized page/section header: title + optional description on the left,
 * optional action on the right. Replaces the repeated header block pattern.
 */
function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        {typeof title === "string" ? (
          <h1 className="text-2xl font-bold">{title}</h1>
        ) : (
          title
        )}
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export { PageHeader };
