import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Receipt } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { PriceEventCard } from "@/components/compras/price-event-card";
import { Card } from "@/components/ui/card";

export default function EventosPrecoScreen() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.priceEvents.list, { now, limit: 50 });

  return (
    <View className="flex-1">
      <View className="px-5 pb-3 pt-5">
        <Text className="text-lg font-semibold text-foreground">
          Eventos de Preço
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Histórico de cotações e preços registrados.
        </Text>
      </View>

      {events === undefined ? (
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" />
        </View>
      ) : events.length === 0 ? (
        <View className="flex-1 px-5">
          <Card className="items-center gap-3 py-10">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10">
              <Receipt size={28} color="#6366f1" />
            </View>
            <Text className="text-center text-base font-medium text-foreground">
              Nenhum evento de preço
            </Text>
            <Text className="px-6 text-center text-sm text-muted-foreground">
              Os eventos de preço aparecerão aqui conforme forem registrados.
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text className="pb-2 text-sm text-muted-foreground">
              {events.length} evento{events.length !== 1 ? "s" : ""} recente
              {events.length !== 1 ? "s" : ""}
            </Text>
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
