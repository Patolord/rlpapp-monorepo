import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Plus, Receipt } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { PriceEventFormSheet } from "@/components/compras/price-event-form-sheet";
import { PriceEventRow } from "@/components/compras/price-event-row";
import { EmptyState, IconButton, LoadingState, ScreenHeader, screenStyles } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function EventosPrecoScreen() {
  const [now] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const events = useQuery(api.priceEvents.list, { now, limit: 100 });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Preços"
        subtitle="Histórico de cotações e compras"
        right={<IconButton label="Novo preço" tone="primary" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setCreating(true)} />}
      />
      {events === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          contentContainerStyle={screenStyles.content}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon={<Receipt size={30} color={colors.primary} strokeWidth={1.8} />} title="Nenhum preço registrado" description="Registre cotações e compras para acompanhar os preços." actionLabel="Novo preço" onAction={() => setCreating(true)} />
          }
          renderItem={({ item }) => <PriceEventRow event={item} />}
        />
      )}
      <PriceEventFormSheet open={creating} onClose={() => setCreating(false)} />
    </View>
  );
}
