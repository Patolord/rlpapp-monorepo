import { cva, type VariantProps } from "class-variance-authority";
import { View, Text } from "react-native";

import { cn } from "./lib/cn";

const badgeVariants = cva("flex-row items-center rounded-full px-2.5 py-0.5", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      destructive: "bg-destructive",
      outline: "border border-border bg-transparent",
      // Semantic status variants, aligned with web.
      neutral: "bg-zinc-100 dark:bg-zinc-800",
      info: "bg-blue-100 dark:bg-blue-950",
      success: "bg-green-100 dark:bg-green-950",
      warning: "bg-yellow-100 dark:bg-yellow-950",
      danger: "bg-red-100 dark:bg-red-950",
      muted: "bg-zinc-50 dark:bg-zinc-900",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      neutral: "text-zinc-700 dark:text-zinc-300",
      info: "text-blue-800 dark:text-blue-300",
      success: "text-green-800 dark:text-green-300",
      warning: "text-yellow-800 dark:text-yellow-300",
      danger: "text-red-800 dark:text-red-300",
      muted: "text-zinc-500 dark:text-zinc-400",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

function Badge({ className, textClassName, variant, children }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)}>
      {typeof children === "string" ? (
        <Text className={cn(badgeTextVariants({ variant }), textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
