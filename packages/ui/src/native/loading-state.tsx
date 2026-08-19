import { ActivityIndicator } from "react-native";

import { Text, View } from "./rn";

import { cn } from "./lib/cn";

export interface LoadingStateProps {
  label?: string;
  size?: "small" | "large";
  className?: string;
  /** Spinner color (defaults to a muted gray). */
  color?: string;
}

/**
 * Standardized native loading state: a centered ActivityIndicator with an
 * optional label. Replaces ad-hoc spinner blocks across screens.
 */
function LoadingState({
  label,
  size = "large",
  className,
  color = "#737373",
}: LoadingStateProps) {
  return (
    <View className={cn("flex-1 items-center justify-center gap-3", className)}>
      <ActivityIndicator size={size} color={color} />
      {label ? (
        <Text className="text-sm text-muted-foreground">{label}</Text>
      ) : null}
    </View>
  );
}

export { LoadingState };
