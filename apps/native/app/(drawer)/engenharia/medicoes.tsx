import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Ruler } from "lucide-react-native";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { EmptyState, LoadingState, Pill, ScreenHeader, StatTile, Surface, screenStyles } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

/** Visão global das medições por obra; toque abre as medições da obra. */
export default function MedicoesOverviewScreen() {
  const router = useRouter();
  const overview = useQuery(api.medicoes.getOverview);

  const totals = (overview ?? []).reduce(
    (acc, p) => {
      acc.contratos += p.contractTotalCents;
      acc.medido += p.medidoCents;
      acc.pago += p.pagoCents;
      acc.pendentes += p.medidoCents > p.aprovadoCents ? 1 : 0;
      return acc;
    },
    { contratos: 0, medido: 0, pago: 0, pendentes: 0 }
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Medições" subtitle="Faturamento por obra" onBack={() => router.back()} />
      {overview === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={overview}
          keyExtractor={(item) => item.projectId}
          contentContainerStyle={screenStyles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.stats}>
              <StatTile label="Medido" value={formatCurrency(totals.medido)} hint={`de ${formatCurrency(totals.contratos)} contratados`} />
              <StatTile label="Pago" value={formatCurrency(totals.pago)} tone="success" hint={`${totals.pendentes} obra${totals.pendentes === 1 ? "" : "s"} com pendência`} />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Ruler size={30} color={colors.primary} strokeWidth={1.8} />}
              title="Nenhuma medição"
              description="As medições aparecerão aqui quando forem criadas nas obras."
            />
          }
          renderItem={({ item }) => {
            const pct = item.contractTotalCents > 0 ? Math.round((item.medidoCents / item.contractTotalCents) * 100) : 0;
            const pending = item.medidoCents > item.aprovadoCents;
            return (
              <Surface onPress={() => router.push(`/obra/${item.projectId}/medicoes` as Href)} style={{ gap: space.sm }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                      {item.legacyNumber ? `#${item.legacyNumber} · ` : ""}
                      {item.projectName}
                    </Text>
                    {item.client ? (
                      <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.client}
                      </Text>
                    ) : null}
                  </View>
                  <Pill label={pending ? "Pendente" : item.pagoCents >= item.medidoCents && item.medidoCents > 0 ? "Pago" : "Em dia"} tone={pending ? "warning" : item.medidoCents > 0 ? "success" : "neutral"} />
                </View>
                <View style={styles.track}>
                  <View style={[styles.bar, { width: `${Math.min(100, pct)}%` }]} />
                </View>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  Medido {formatCurrency(item.medidoCents)} ({pct}%) · pago {formatCurrency(item.pagoCents)} · {item.contractCount} contrato{item.contractCount === 1 ? "" : "s"}
                </Text>
              </Surface>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space.md, marginBottom: space.sm },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
