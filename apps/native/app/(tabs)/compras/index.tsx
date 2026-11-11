import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Calculator, ClipboardCheck, Package, Tag } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { TAKEOFF_STATUS } from "@/components/compras/takeoff-labels";
import { NeedList, NeedRow } from "@/components/inicio/parts";
import { EmptyState, LoadingState, MetricStrip, Pill, SectionTitle, Surface } from "@/components/ui";
import { formatShortDateTime } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { colors, radius, space, status, type } from "@/lib/theme";

/** Painel de Compras (ficha K1) com os orçamentos de todas as obras (K8). */
export default function ComprasPainelScreen() {
  const router = useRouter();
  const me = useProfile();
  const consult = me?.profile === "engenharia";
  const [now] = useState(() => Date.now());
  const stats = useQuery(api.priceEvents.dashboardStats, { now });
  const takeoffs = useQuery(api.takeoffs.list, {});
  const icon = (Icon: typeof Tag, color: string = colors.primary) => <Icon size={20} color={color} strokeWidth={2} />;

  return (
    <FlatList
      data={(takeoffs ?? []).slice(0, 40)}
      keyExtractor={(t) => t._id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          {stats === undefined ? (
            <LoadingState />
          ) : (
            <>
              <MetricStrip
                items={[
                  { label: "Materiais", value: stats.activeMaterials },
                  { label: "Fornecedores", value: stats.activeSuppliers },
                  { label: "Preços (30 dias)", value: stats.recentEvents },
                ]}
              />
              {!consult ? (
                <NeedList>
                  <NeedRow first icon={icon(ClipboardCheck)} title="Fila de revisão" subtitle="Preços esperando revisão" count={stats.unreviewedPrices} onPress={() => router.push("/(tabs)/compras/fila-revisao" as Href)} />
                  <NeedRow icon={icon(Calculator)} title="Orçamentos para precificar" subtitle="Itens sem preço nos takeoffs" count={stats.takeoffsNeedingPricing} />
                  <NeedRow icon={icon(Package, status.warning)} title="Preços desatualizados" subtitle="Materiais com último preço antigo" count={stats.stalePrices} onPress={() => router.push("/(tabs)/compras/eventos-preco" as Href)} />
                </NeedList>
              ) : null}
            </>
          )}
          <SectionTitle title="Orçamentos das obras" />
        </View>
      }
      renderItem={({ item }) => {
        const st = item.status ? TAKEOFF_STATUS[item.status] : null;
        return (
          <Surface onPress={() => router.push(`/takeoff/${item._id}` as Href)} accessibilityLabel={item.name}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <Calculator size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.projectName, `${item.itemCount} itens`, formatShortDateTime(item.publishedAt ?? item.updatedAt ?? item.createdAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {st ? <Pill label={st.label} tone={st.tone} /> : null}
            </View>
          </Surface>
        );
      }}
      ListEmptyComponent={takeoffs === undefined ? <LoadingState /> : <EmptyState icon={<Calculator size={28} color={colors.primary} />} title="Nenhum orçamento ainda" description="Os orçamentos publicados pelo app Takeoff aparecem aqui." />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
