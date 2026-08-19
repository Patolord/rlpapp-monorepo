import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { CheckCircle, ClipboardList } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { PriceEventCard } from "@/components/compras/price-event-card";
import { Card } from "@/components/ui/card";

export default function FilaRevisaoScreen() {
  const [now] = useState(() => Date.now());
  const queue = useQuery(api.priceEvents.reviewQueue, { now });

  return (
    <View className="flex-1">
      <View className="px-5 pb-3 pt-5">
        <Text className="text-lg font-semibold text-foreground">
          Fila de Revisão
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Eventos de preço que precisam de revisão.
        </Text>
      </View>

      {queue === undefined ? (
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" />
        </View>
      ) : queue.length === 0 ? (
        <View className="flex-1 px-5">
          <Card className="items-center gap-3 py-10">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle size={28} color="#16a34a" />
            </View>
            <Text className="text-center text-base font-medium text-foreground">
              Tudo revisado!
            </Text>
            <Text className="px-6 text-center text-sm text-muted-foreground">
              Não há eventos de preço aguardando revisão.
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="flex-row items-center gap-2 pb-2">
              <ClipboardList size={14} color="#d97706" />
              <Text className="text-sm font-medium text-amber-600">
                {queue.length} evento{queue.length !== 1 ? "s" : ""} pendente
                {queue.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PriceEventCard
              materialName={item.materialName}
              supplierName={item.supplierName}
              unitPriceCents={item.unitPriceCents}
              unit={item.unit}
              occurredAt={item.occurredAt}
              freshness={item.freshness}
              needsReview={item.needsReview}
              reviewStatus={item.reviewStatus}
              warnings={item.warnings}
            />
          )}
        />
      )}
    </View>
  );
}
