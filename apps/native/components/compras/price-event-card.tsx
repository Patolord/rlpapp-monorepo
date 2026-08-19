import { AlertTriangle, CheckCircle, Clock } from "lucide-react-native";
import { Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@rlpapp/shared";

type Freshness = "fresh" | "usable" | "old" | "stale";

interface PriceEventCardProps {
  materialName: string | null;
  supplierName: string;
  unitPriceCents: number;
  unit: string | null;
  occurredAt: number;
  freshness: Freshness;
  needsReview: boolean;
  reviewStatus: string | null;
  warnings: string[];
}

const freshnessConfig: Record<
  Freshness,
  { label: string; variant: "success" | "secondary" | "warning" | "destructive" }
> = {
  fresh: { label: "Atualizado", variant: "success" },
  usable: { label: "Utilizável", variant: "secondary" },
  old: { label: "Antigo", variant: "warning" },
  stale: { label: "Obsoleto", variant: "destructive" },
};

export function PriceEventCard({
  materialName,
  supplierName,
  unitPriceCents,
  unit,
  occurredAt,
  freshness,
  needsReview,
  reviewStatus,
  warnings,
}: PriceEventCardProps) {
  const config = freshnessConfig[freshness];
  const price = formatCurrency(unitPriceCents);

  return (
    <Card className="gap-2 p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {materialName ?? "Material não vinculado"}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {supplierName}
          </Text>
        </View>

        <Text className="text-lg font-bold text-foreground">
          {price}
          {unit ? `/${unit}` : ""}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center gap-1.5">
        <Badge variant={config.variant} className="px-1.5 py-0">
          {config.label}
        </Badge>

        {needsReview && (
          <Badge variant="warning" className="flex-row items-center gap-1 px-1.5 py-0">
            <Clock size={10} color="#92400e" />
            <Text className="text-xs font-medium text-yellow-700">
              Pendente
            </Text>
          </Badge>
        )}

        {reviewStatus === "reviewed" && !needsReview && (
          <Badge variant="success" className="flex-row items-center gap-1 px-1.5 py-0">
            <CheckCircle size={10} color="#15803d" />
            <Text className="text-xs font-medium text-green-700">
              Revisado
            </Text>
          </Badge>
        )}

        <Text className="text-xs text-muted-foreground">
          {formatDate(occurredAt)}
        </Text>
      </View>

      {warnings.length > 0 && (
        <View className="flex-row flex-wrap items-center gap-1.5">
          <AlertTriangle size={12} color="#d97706" />
          <Text className="text-xs text-amber-600" numberOfLines={2}>
            {warnings.join(" · ")}
          </Text>
        </View>
      )}
    </Card>
  );
}
