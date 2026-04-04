import { cva, type VariantProps } from "class-variance-authority";
import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "flex-row items-center rounded-full px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        outline: "border border-border bg-transparent",
        success: "bg-green-100 dark:bg-green-900",
        warning: "bg-yellow-100 dark:bg-yellow-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      success: "text-green-700 dark:text-green-300",
      warning: "text-yellow-700 dark:text-yellow-300",
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
