import * as React from "react";

import { cn } from "./lib/cn";
import { Card, CardContent } from "./card";

export interface EmptyStateProps {
  /** Icon node rendered inside a soft circle (e.g. a lucide icon). */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Optional call-to-action (button, link, etc.). */
  action?: React.ReactNode;
  className?: string;
  /**
   * Visual treatment:
   * - "card": wrapped in a Card (default, richest)
   * - "dashed": dashed-border block
   * - "plain": just centered content
   */
  variant?: "card" | "dashed" | "plain";
}

function EmptyContent({
  icon,
  title,
  description,
  action,
}: Pick<EmptyStateProps, "icon" | "title" | "description" | "action">) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      {icon ? (
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Standardized empty state with icon, title, description and optional action.
 * Replaces inconsistent inline empty blocks across screens.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "card",
}: EmptyStateProps) {
  if (variant === "card") {
    return (
      <Card className={className}>
        <CardContent>
          <EmptyContent
            icon={icon}
            title={title}
            description={description}
            action={action}
          />
        </CardContent>
      </Card>
    );
  }

  if (variant === "dashed") {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed text-muted-foreground",
          className,
        )}
      >
        <EmptyContent
          icon={icon}
          title={title}
          description={description}
          action={action}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <EmptyContent
        icon={icon}
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}

export { EmptyState };
