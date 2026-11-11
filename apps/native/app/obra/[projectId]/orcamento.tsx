import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Calculator } from "lucide-react-native";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { TAKEOFF_STATUS } from "@/components/compras/takeoff-labels";
import { EmptyState, LoadingState, Pill, Surface } from "@/components/ui";
import { formatShortDateTime } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

/** Orçamento da obra (ficha O11): takeoffs só leitura. */
export default function OrcamentoScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const takeoffs = useQuery(api.takeoffs.list, { projectId: projectId as Id<"projects"> });

  if (takeoffs === undefined) return <LoadingState message="Carregando orçamento…" />;

  return (
    <FlatList
      data={takeoffs}
      keyExtractor={(t) => t._id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const st = item.status ? TAKEOFF_STATUS[item.status] : null;
        return (
          <Surface onPress={() => router.push(`/takeoff/${item._id}` as Href)} accessibilityLabel={item.name}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <Calculator size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {item.itemCount} {item.itemCount === 1 ? "item" : "itens"} · {formatShortDateTime(item.publishedAt ?? item.updatedAt ?? item.createdAt)}
                  {item.source === "desktop" ? " · App Takeoff" : ""}
                </Text>
              </View>
              {st ? <Pill label={st.label} tone={st.tone} /> : null}
            </View>
          </Surface>
        );
      }}
      ListEmptyComponent={<EmptyState icon={<Calculator size={28} color={colors.primary} />} title="Nenhum orçamento nesta obra" description="Os orçamentos publicados pelo app Takeoff aparecem aqui." />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
