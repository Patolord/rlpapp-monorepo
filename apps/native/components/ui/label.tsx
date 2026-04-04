import { Text } from "react-native";
import { cn } from "@/lib/utils";

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text className={cn("text-sm font-medium text-foreground", className)}>
      {children}
    </Text>
  );
}

export { Label };
