import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Calculator } from "lucide-react-native";
import { useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";

import { TAKEOFF_ITEM_STATUS, TAKEOFF_STATUS } from "@/components/compras/takeoff-labels";
import { Chips, EmptyState, LoadingState, MetricStrip, Pill, Sheet, Surface } from "@/components/ui";
import { formatShortDateTime, formatQty } from "@/lib/format";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, space, type } from "@/lib/theme";

type Detail = NonNullable<FunctionReturnType<typeof api.takeoffs.get>>;
type Item = Detail["items"][number];

function lineMaterial(item: Item): number {
  if (item.materialTotalCents !== null) return item.materialTotalCents;
  return item.quantity !== null && item.estimatedUnitPriceCents !== null ? Math.round(item.quantity * item.estimatedUnitPriceCents) : 0;
}
function lineLabor(item: Item): number {
  if (item.laborTotalCents !== null) return item.laborTotalCents;
  return item.quantity !== null && item.laborUnitPriceCents !== null ? Math.round(item.quantity * item.laborUnitPriceCents) : 0;
}

/** Orçamento (takeoff) só leitura (fichas O11 e K8): itens, preços, cotações e status por item. */
export default function TakeoffScreen() {
  const header = useNativeHeaderOptions();
  const { takeoffId } = useLocalSearchParams<{ takeoffId: string }>();
  const [now] = useState(() => Date.now());
  const data = useQuery(api.takeoffs.get, { takeoffId: takeoffId as Id<"takeoffs">, now });
  const [sheet, setSheet] = useState<string>("todas");
  const [selected, setSelected] = useState<Item | null>(null);

  const sheets = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.sheet).filter((s): s is string => Boolean(s)))], [data]);
  const sections = useMemo(() => {
    const items = (data?.items ?? []).filter((i) => i.externalRemovedAt === null && (sheet === "todas" || i.sheet === sheet));
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const key = item.section ?? item.sheet ?? "Itens";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].map(([title, list]) => ({ title, data: list }));
  }, [data, sheet]);

  if (data === undefined) return <LoadingState />;
  if (data === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.screen }}>
        <Stack.Screen options={{ ...header, title: "Orçamento" }} />
        <EmptyState title="Este item não está mais disponível" description="O orçamento pode ter sido removido." />
      </View>
    );
  }

  const { takeoff, items } = data;
  const active = items.filter((i) => i.externalRemovedAt === null);
  const material = active.reduce((s, i) => s + lineMaterial(i), 0);
  const labor = active.reduce((s, i) => s + lineLabor(i), 0);
  const st = takeoff.status ? TAKEOFF_STATUS[takeoff.status] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ ...header, title: takeoff.name }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i._id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.badges}>
              {st ? <Pill label={st.label} tone={st.tone} /> : null}
              {takeoff.source === "desktop" ? <Pill label="App Takeoff" dot={false} /> : null}
              {takeoff.projectName ? <Pill label={takeoff.projectName} dot={false} /> : null}
            </View>
            {takeoff.publishedAt ? (
              <Text style={[type.caption, { color: colors.textSecondaryOnBg }]}>
                Publicado {formatShortDateTime(takeoff.publishedAt)}
                {takeoff.publishedByName ? ` por ${takeoff.publishedByName}` : ""}
              </Text>
            ) : null}
            <MetricStrip
              items={[
                { label: "Itens", value: active.length },
                { label: "Material", value: formatCurrency(material) },
                { label: "Mão de obra", value: formatCurrency(labor) },
              ]}
            />
            {sheets.length > 1 ? (
              <Chips<string>
                active={sheet}
                onChange={setSheet}
                style={{ paddingHorizontal: 0 }}
                items={[{ key: "todas", label: "Todas as abas" }, ...sheets.map((s) => ({ key: s, label: s }))]}
              />
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          const ist = item.status ? TAKEOFF_ITEM_STATUS[item.status] : null;
          const total = lineMaterial(item) + lineLabor(item);
          return (
            <Surface onPress={() => setSelected(item)} style={styles.card} accessibilityLabel={item.rawDescription}>
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
                    {item.materialName ?? item.rawDescription}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {item.quantity !== null ? formatQty(item.quantity, item.unit) : "Sem quantidade"}
                    {item.estimatedUnitPriceCents !== null ? ` · ${formatCurrency(item.estimatedUnitPriceCents)} cada` : " · sem preço"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {total > 0 ? <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(total)}</Text> : null}
                  {ist ? <Pill label={ist.label} tone={ist.tone} /> : null}
                </View>
              </View>
            </Surface>
          );
        }}
        ListEmptyComponent={<EmptyState icon={<Calculator size={28} color={colors.primary} />} title="Orçamento sem itens" />}
      />

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.materialName ?? selected?.rawDescription ?? ""} subtitle={selected?.materialName ? selected.rawDescription : undefined}>
        {selected ? <ItemDetail item={selected} /> : null}
      </Sheet>
    </View>
  );
}

function ItemDetail({ item }: { item: Item }) {
  const ist = item.status ? TAKEOFF_ITEM_STATUS[item.status] : null;
  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.badges}>
        {ist ? <Pill label={ist.label} tone={ist.tone} /> : null}
        {item.warnings.map((w) => (
          <Pill key={w} label={w} tone="warning" />
        ))}
      </View>
      <Surface style={{ gap: space.xs }}>
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>
          {item.quantity !== null ? formatQty(item.quantity, item.unit) : "Sem quantidade"}
        </Text>
        <Text style={[type.body, { color: colors.text }]}>
          Material: {item.estimatedUnitPriceCents !== null ? `${formatCurrency(item.estimatedUnitPriceCents)} cada · ${formatCurrency(lineMaterial(item))}` : "sem preço"}
        </Text>
        {item.laborUnitPriceCents !== null || item.laborTotalCents !== null ? (
          <Text style={[type.body, { color: colors.text }]}>Mão de obra: {formatCurrency(lineLabor(item))}</Text>
        ) : null}
        {item.notes ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{item.notes}</Text> : null}
      </Surface>
      {item.quotes.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={[type.eyebrow, { color: colors.text }]}>Cotações</Text>
          <Surface padded={false}>
            {item.quotes.map((q, index) => (
              <View key={q._id} style={[styles.quote, index > 0 && styles.border]}>
                <Text style={[type.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {q.supplierName}
                </Text>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(q.unitPriceCents)}</Text>
              </View>
            ))}
          </Surface>
        </View>
      ) : null}
      {item.latestPrices.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={[type.eyebrow, { color: colors.text }]}>Últimos preços</Text>
          <Surface padded={false}>
            {item.latestPrices.map((p, index) => (
              <View key={`${p.supplierName}-${p.occurredAt}`} style={[styles.quote, index > 0 && styles.border]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
                    {p.supplierName}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{new Date(p.occurredAt).toLocaleDateString("pt-BR")}</Text>
                </View>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(p.unitPriceCents)}</Text>
                {p.freshness === "old" || p.freshness === "stale" ? <Pill label="Antigo" tone="warning" /> : null}
              </View>
            ))}
          </Surface>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48 },
  header: { gap: space.md, marginBottom: space.sm },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  section: { ...type.eyebrow, color: colors.textSecondaryOnBg, marginTop: space.md, marginBottom: space.sm },
  card: { marginBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  quote: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
