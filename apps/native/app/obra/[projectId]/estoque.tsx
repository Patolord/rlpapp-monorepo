import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { usePaginatedQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { MapPin, Warehouse } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function EstoqueScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.listBalances,
    { projectId: projectId as Id<"projects"> },
    { initialNumItems: 30 }
  );

  if (status === "LoadingFirstPage") {
    return <LoadingState label="Carregando estoque…" />;
  }

  if (!results || results.length === 0) {
    return (
      <EmptyState
        icon={<Warehouse size={24} color="#f59e0b" />}
        title="Estoque vazio"
        description="Nenhum saldo de material registrado para esta obra."
        variant="plain"
        className="flex-1"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-lg font-bold text-foreground">
        Saldos de Estoque
      </Text>

      {results.map((balance) => (
        <Card key={balance._id} className="gap-2 p-3">
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 text-sm font-medium text-foreground"
              numberOfLines={1}
            >
              {balance.materialName}
            </Text>
            <Text className="text-sm font-semibold text-foreground">
              {balance.quantity} {balance.unit ?? "un"}
            </Text>
          </View>
          {balance.variantLabel && (
            <Text className="text-xs text-muted-foreground">
              {balance.variantLabel}
            </Text>
          )}
          <View className="flex-row items-center gap-2">
            {balance.physicalAddress && (
              <View className="flex-row items-center gap-1">
                <MapPin size={12} color="#6b7280" />
                <Badge variant="outline">{balance.physicalAddress}</Badge>
              </View>
            )}
            {balance.replenishmentState !== "ok" && (
              <Badge
                variant={
                  balance.replenishmentState === "critical"
                    ? "destructive"
                    : "secondary"
                }
              >
                {balance.replenishmentState === "critical"
                  ? "Crítico"
                  : balance.replenishmentState === "low"
                    ? "Baixo"
                    : balance.replenishmentState}
              </Badge>
            )}
          </View>
        </Card>
      ))}

      {status === "CanLoadMore" && (
        <Pressable
          onPress={() => loadMore(30)}
          className="items-center py-3"
        >
          <Text className="text-sm font-medium text-primary">
            Carregar mais
          </Text>
        </Pressable>
      )}

      {status === "LoadingMore" && (
        <LoadingState size="small" className="py-3" />
      )}
    </ScrollView>
  );
}
