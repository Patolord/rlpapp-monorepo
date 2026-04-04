import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, Text } from "react-native";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
        outline: "border border-input bg-card",
        secondary: "bg-secondary",
        ghost: "",
        link: "",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

function Button({
  className,
  textClassName,
  variant,
  size,
  children,
  onPress,
  disabled,
}: ButtonProps) {
  return (
    <Pressable
      className={cn(
        buttonVariants({ variant, size }),
        disabled && "opacity-50",
        className
      )}
      onPress={onPress}
      disabled={disabled}
    >
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant }), textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

function ButtonText({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: VariantProps<typeof buttonTextVariants>["variant"];
  children: React.ReactNode;
}) {
  return (
    <Text className={cn(buttonTextVariants({ variant }), className)}>
      {children}
    </Text>
  );
}

export { Button, ButtonText, buttonVariants, buttonTextVariants };
