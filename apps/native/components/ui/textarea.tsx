import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextInputProps {
  className?: string;
}

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor="#9ca3af"
      className={cn(
        "min-h-[90px] rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
