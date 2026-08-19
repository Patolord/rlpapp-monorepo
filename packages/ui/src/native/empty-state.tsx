import * as React from "react";
import { Text, View } from "./rn";

import { cn } from "./lib/cn";
import { Card } from "./card";

export interface EmptyStateProps {
  /** Icon node rendered inside a soft circle. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call-to-action (e.g. a Button). */
  action?: React.ReactNode;
  className?: string;
  /** "card" wraps content in a Card (default); "plain" omits the wrapper. */
  variant?: "card" | "plain";
}

function EmptyContent({
  icon,
  title,
  description,
  action,
}: Pick<EmptyStateProps, "icon" | "title" | "description" | "action">) {
  return (
    <View className="items-center gap-4 py-8">
      {icon ? (
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          {icon}
        </View>
      ) : null}
      <View className="items-center gap-1">
        <Text className="text-lg font-semibold text-foreground">{title}</Text>
        {description ? (
          <Text className="text-center text-sm text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/**
 * Standardized native empty state with icon, title, description and optional
 * action.
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
        <EmptyContent
          icon={icon}
          title={title}
          description={description}
          action={action}
        />
      </Card>
    );
  }

  return (
    <View className={cn("", className)}>
      <EmptyContent
        icon={icon}
        title={title}
        description={description}
        action={action}
      />
    </View>
  );
}

export { EmptyState };
