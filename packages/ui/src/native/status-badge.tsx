import * as React from "react";

import { Badge } from "./badge";
import type { StatusVariant } from "../tokens/status";

export interface StatusBadgeProps {
  /** Semantic status variant (neutral, info, success, warning, danger, muted). */
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
}

/**
 * Semantic status badge for native. Domain code should map statuses to a
 * `StatusVariant` (see `@rlpapp/ui/tokens`) and pass the variant here.
 */
function StatusBadge({
  variant,
  children,
  className,
  textClassName,
}: StatusBadgeProps) {
  return (
    <Badge variant={variant} className={className} textClassName={textClassName}>
      {children}
    </Badge>
  );
}

export { StatusBadge };
