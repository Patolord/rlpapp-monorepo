import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

function Checkbox({ checked, onCheckedChange, className, disabled }: CheckboxProps) {
  return (
    <Pressable
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={8}
      className={cn(
        "h-6 w-6 items-center justify-center rounded border",
        checked ? "border-primary bg-primary" : "border-input bg-card",
        disabled && "opacity-50",
        className
      )}
    >
      {checked && <Check size={16} color="#fafafa" />}
    </Pressable>
  );
}

export { Checkbox };
