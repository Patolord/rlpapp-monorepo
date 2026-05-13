import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { Pressable, Text, type PressableProps, type View } from "react-native";
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

interface ButtonProps extends VariantProps<typeof buttonVariants>, Omit<PressableProps, "children"> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const Button = React.forwardRef<View, ButtonProps>(
  ({ className, textClassName, variant, size, children, disabled, ...rest }, ref) => {
    return (
      <Pressable
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          disabled && "opacity-50",
          className
        )}
        disabled={disabled}
        {...rest}
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
);

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
