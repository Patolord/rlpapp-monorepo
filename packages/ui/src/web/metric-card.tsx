import * as React from "react";

import { cn } from "./lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Compact metric/stat card: title + optional icon header, large value, and
 * supporting description. Replaces ad-hoc `StatCard` patterns in feature code.
 */
function MetricCard({
  title,
  value,
  description,
  icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description ? (
          <p className={cn("text-xs text-muted-foreground")}>{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { MetricCard };
