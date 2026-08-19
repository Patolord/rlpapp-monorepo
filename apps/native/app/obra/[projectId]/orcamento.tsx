import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Calculator, Package } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; cls: string; textCls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted border-border", textCls: "text-foreground" },
  matched: { label: "Vinculado", cls: "bg-green-100 border-green-300", textCls: "text-green-800" },
  ordered: { label: "Pedido", cls: "bg-blue-100 border-blue-300", textCls: "text-blue-800" },
  received: { label: "Recebido", cls: "bg-emerald-100 border-emerald-300", textCls: "text-emerald-800" },
};

export default function OrcamentoScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const takeoffs = useQuery(api.takeoffs.list, {
    projectId: projectId as Id<"projects">,
  });

  if (takeoffs === undefined) {
    return <LoadingState label="Carregando orçamento…" />;
  }

  if (!takeoffs || takeoffs.length === 0) {
    return (
      <EmptyState
        icon={<Calculator size={24} color="#f59e0b" />}
        title="Sem levantamentos"
        description="Nenhum takeoff/levantamento cadastrado para esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-lg font-bold text-foreground">
        Levantamentos de Quantitativos
      </Text>

      {takeoffs.map((takeoff) => (
        <TakeoffCard key={takeoff._id} takeoff={takeoff} />
      ))}
    </ScrollView>
  );
}

function TakeoffCard({
  takeoff,
}: {
  takeoff: {
    _id: string;
    name: string;
    status: string | null;
    itemCount: number;
    createdAt: number;
  };
}) {
  const statusCfg = STATUS_LABELS[takeoff.status ?? "draft"] ?? STATUS_LABELS.draft;

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package size={20} color="#8b5cf6" />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {takeoff.name}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {takeoff.itemCount} {takeoff.itemCount === 1 ? "item" : "itens"}
            </Text>
          </View>
        </View>
        <View
          className={cn(
            "rounded-full border px-2.5 py-0.5",
            statusCfg.cls
          )}
        >
          <Text className={cn("text-xs font-medium", statusCfg.textCls)}>
            {statusCfg.label}
          </Text>
        </View>
      </View>
    </Card>
  );
}
