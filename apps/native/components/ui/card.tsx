import { View, Text } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { cn } from "@/lib/utils";

function Card({
  className,
  children,
  ...props
}: {
  className?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View className={cn("rounded-2xl bg-white p-4", className)} style={[{ backgroundColor: "#ffffff" }, props.style]}>
      {children}
    </View>
  );
}

function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("mb-3", className)}>
      {children}
    </View>
  );
}

function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text className={cn("text-lg font-semibold text-card-foreground", className)}>
      {children}
    </Text>
  );
}

function CardDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("", className)}>
      {children}
    </View>
  );
}

function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("flex-row items-center mt-3", className)}>
      {children}
    </View>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
