import { Text, View } from "react-native";

import { Badge } from "@rlpapp/ui/native";
import { formatDateTime } from "@rlpapp/shared";

const typeLabels: Record<string, string> = {
  RegisteredIn: "Entrada",
  RegisteredOut: "Saída",
  Reversal: "Reversão",
  InventoryAdjust: "Ajuste",
};

const typeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RegisteredIn: "default",
  RegisteredOut: "secondary",
  Reversal: "outline",
  InventoryAdjust: "destructive",
};

const refTypeLabels: Record<string, string> = {
  receipt: "Recibo",
  shipment: "Remessa",
  adjustment: "Ajuste",
};

interface MovementCardProps {
  type: string;
  productName: string;
  qtyDelta: number;
  unit?: string;
  createdAt: number;
  refType?: string;
  refId?: string;
}

export function MovementCard({
  type,
  productName,
  qtyDelta,
  unit,
  createdAt,
  refType,
  refId,
}: MovementCardProps) {
  return (
    <View className="rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between mb-1">
        <Badge variant={typeVariants[type] ?? "outline"}>
          {typeLabels[type] ?? type}
        </Badge>
        <Text className="text-muted-foreground text-xs">
          {formatDateTime(createdAt)}
        </Text>
      </View>
      <Text className="text-foreground font-medium text-sm">{productName}</Text>
      <View className="flex-row items-center justify-between mt-1">
        <Text
          className="font-medium text-sm"
          style={{ color: qtyDelta > 0 ? "#16a34a" : "#dc2626" }}
        >
          {qtyDelta > 0 ? "+" : ""}
          {qtyDelta} {unit}
        </Text>
        {refType && (
          <Text className="text-muted-foreground text-xs">
            {refTypeLabels[refType] ?? refType}
            {refId ? ` • ${refId.substring(0, 10)}...` : ""}
          </Text>
        )}
      </View>
    </View>
  );
}
