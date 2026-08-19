import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Package, ShoppingCart } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ITEM_STATUS: Record<string, { label: string; cls: string; textCls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted border-border", textCls: "text-foreground" },
  matched: { label: "Vinculado", cls: "bg-green-100 border-green-300", textCls: "text-green-800" },
  ordered: { label: "Pedido", cls: "bg-blue-100 border-blue-300", textCls: "text-blue-800" },
  received: { label: "Recebido", cls: "bg-emerald-100 border-emerald-300", textCls: "text-emerald-800" },
};

export default function ComprasScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const takeoffs = useQuery(api.takeoffs.list, {
    projectId: projectId as Id<"projects">,
  });

  if (takeoffs === undefined) {
    return <LoadingState label="Carregando compras…" />;
  }

  if (!takeoffs || takeoffs.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart size={24} color="#f59e0b" />}
        title="Sem itens de compra"
        description="Nenhum levantamento de compras cadastrado para esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  const totalItems = takeoffs.reduce((sum, t) => sum + t.itemCount, 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Card className="gap-2 p-4">
        <Text className="text-sm font-semibold text-foreground">
          Resumo de Compras
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {takeoffs.length} levantamento{takeoffs.length === 1 ? "" : "s"}
          </Text>
          <Text className="text-lg font-bold text-foreground">
            {totalItems} {totalItems === 1 ? "item" : "itens"}
          </Text>
        </View>
      </Card>

      <Text className="text-lg font-bold text-foreground">
        Levantamentos
      </Text>

      {takeoffs.map((takeoff) => {
        const statusCfg = ITEM_STATUS[takeoff.status ?? "draft"] ?? ITEM_STATUS.draft;
        return (
          <Card key={takeoff._id} className="gap-3 p-4">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Package size={20} color="#f97316" />
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
      })}
    </ScrollView>
  );
}
