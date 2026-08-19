import { formatCurrency } from "@rlpapp/shared";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MedicaoStatus = "draft" | "submitted" | "approved" | "paid";

const STATUS_CONFIG: Record<
  MedicaoStatus,
  { label: string; className: string; textClassName: string }
> = {
  draft: {
    label: "Rascunho",
    className: "border border-input bg-card",
    textClassName: "text-foreground",
  },
  submitted: {
    label: "Enviada",
    className: "bg-blue-100 border-blue-300",
    textClassName: "text-blue-800",
  },
  approved: {
    label: "Aprovada",
    className: "bg-green-100 border-green-300",
    textClassName: "text-green-800",
  },
  paid: {
    label: "Paga",
    className: "bg-emerald-100 border-emerald-300",
    textClassName: "text-emerald-800",
  },
};

interface MedicaoCardProps {
  projectName: string;
  period: string;
  valueCents: number;
  status: MedicaoStatus;
  onPress?: () => void;
}

export function MedicaoCard({
  projectName,
  period,
  valueCents,
  status,
  onPress,
}: MedicaoCardProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;

  return (
    <Pressable onPress={onPress}>
      <Card className="gap-2 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 gap-1">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {projectName}
            </Text>
            <Text className="text-sm text-muted-foreground">{period}</Text>
          </View>
          <ChevronRight size={20} color="#9ca3af" />
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold text-foreground">
            {formatCurrency(valueCents)}
          </Text>
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
