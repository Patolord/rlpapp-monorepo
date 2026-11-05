import * as React from "react";

import { Badge } from "./badge";
import type { StatusVariant } from "../tokens/status";

export interface StatusBadgeProps {
  /** Semantic status variant (neutral, info, success, warning, danger, muted). */
  variant: StatusVariant;
  /** The status label. Required: a status is never shown as a dot alone. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Semantic status badge, styled "Outline + dot": a white pill with a neutral
 * border where the only colour is a 6px `status-<variant>` dot before the
 * label. Domain code should map its statuses to a
 * `StatusVariant` (see `@rlpapp/ui/tokens`) instead of embedding raw color
 * classes, then pass the variant here.
 */
function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <Badge variant={variant} className={className}>
      {children}
    </Badge>
  );
}

export { StatusBadge };
