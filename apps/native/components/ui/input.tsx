import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

interface InputProps extends TextInputProps {
  className?: string;
}

function Input({ className, ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        "h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground",
        className
      )}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
}

export { Input };
