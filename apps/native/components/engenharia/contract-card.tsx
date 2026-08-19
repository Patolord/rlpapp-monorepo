import { formatCurrency } from "@rlpapp/shared";
import { ChevronRight, FileText } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ContractStatus = "active" | "completed" | "cancelled";

const STATUS_CONFIG: Record<
  ContractStatus,
  { label: string; className: string; textClassName: string }
> = {
  active: {
    label: "Ativo",
    className: "bg-green-100 border-green-300",
    textClassName: "text-green-800",
  },
  completed: {
    label: "Concluído",
    className: "bg-blue-100 border-blue-300",
    textClassName: "text-blue-800",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-red-100 border-red-300",
    textClassName: "text-red-800",
  },
};

interface ContractCardProps {
  title: string;
  contractorName: string | null;
  valueCents: number;
  status: ContractStatus;
  projectName: string | null;
  onPress?: () => void;
}

export function ContractCard({
  title,
  contractorName,
  valueCents,
  status,
  projectName,
  onPress,
}: ContractCardProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;

  return (
    <Pressable onPress={onPress}>
      <Card className="gap-2 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText size={20} color="#f59e0b" />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text
                className="text-base font-semibold text-foreground"
                numberOfLines={1}
              >
                {title}
              </Text>
              {contractorName && (
                <Text
                  className="text-sm text-muted-foreground"
                  numberOfLines={1}
                >
                  {contractorName}
                </Text>
              )}
            </View>
          </View>
          <ChevronRight size={20} color="#9ca3af" />
        </View>
        <View className="flex-row items-center justify-between">
          <View className="gap-0.5">
            <Text className="text-base font-bold text-foreground">
              {formatCurrency(valueCents)}
            </Text>
            {projectName && (
              <Text
                className="text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {projectName}
              </Text>
            )}
          </View>
          <View
            className={cn(
              "rounded-full border px-2.5 py-0.5",
              config.className
            )}
          >
            <Text className={cn("text-xs font-medium", config.textClassName)}>
              {config.label}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
