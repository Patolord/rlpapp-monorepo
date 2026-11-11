import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, ArrowUpFromLine, History, Undo2, Warehouse } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { DOCUMENT_STATUS, MOVEMENT_LABELS, REPLENISHMENT, type ReplenishmentState } from "@/components/estoque/labels";
import { RequestsList } from "@/components/estoque/requests-list";
import { Chips, EmptyState, LoadingState, MetricStrip, Pill, Surface } from "@/components/ui";
import { formatShortDateTime, formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

type Tab = "saldos" | "movimentacoes" | "pedidos";

/** Estoque da obra no escritório (ficha O14): saldos, movimentações e pedidos. */
export default function ObraEstoqueScreen() {
  const { projectId, aba } = useLocalSearchParams<{ projectId: string; aba?: string }>();
  const id = projectId as Id<"projects">;
  const [tab, setTab] = useState<Tab>(aba === "pedidos" ? "pedidos" : "saldos");
  const summaries = useQuery(api.inventory.listProjectSummaries, {});
  const summary = summaries?.find((s) => s.projectId === id);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.top}>
        {summary ? (
          <MetricStrip
            items={[
              { label: "Materiais", value: summary.materialCount },
              { label: "Envios", value: summary.transferCount },
              { label: "Consumos", value: summary.consumptionCount },
              { label: "Devoluções", value: summary.returnCount },
            ]}
          />
        ) : null}
        <Chips<Tab>
          active={tab}
          onChange={setTab}
          style={{ paddingHorizontal: 0 }}
          items={[
            { key: "saldos", label: "Saldos" },
            { key: "movimentacoes", label: "Movimentações" },
            { key: "pedidos", label: "Pedidos" },
          ]}
        />
      </View>
      {tab === "saldos" ? <Balances projectId={id} /> : tab === "movimentacoes" ? <Movements projectId={id} /> : <RequestsList projectId={id} />}
    </View>
  );
}

function Balances({ projectId }: { projectId: Id<"projects"> }) {
  const { results, status, loadMore } = usePaginatedQuery(api.inventory.listBalances, { projectId }, { initialNumItems: 50 });
  if (status === "LoadingFirstPage") return <LoadingState message="Carregando estoque…" />;
  return (
    <FlatList
      data={results}
      keyExtractor={(b) => b._id}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.4}
      onEndReached={() => status === "CanLoadMore" && loadMore(50)}
      renderItem={({ item }) => {
        const state = REPLENISHMENT[item.replenishmentState as ReplenishmentState] ?? REPLENISHMENT.unconfigured;
        return (
          <Surface>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {formatMaterialLabel(item.materialName, item.variantLabel)}
                </Text>
                {item.physicalAddress ? <Text style={[type.caption, { color: colors.textSecondary }]}>End. {item.physicalAddress}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[type.heading, { color: item.quantity <= 0 ? colors.destructive : colors.text }]}>{formatQty(item.quantity, item.unit)}</Text>
                {item.quantity <= 0 ? <Pill label="Zerado" tone="danger" /> : item.replenishmentState !== "unconfigured" ? <Pill label={state.label} tone={state.tone} /> : null}
              </View>
            </View>
          </Surface>
        );
      }}
      ListEmptyComponent={<EmptyState icon={<Warehouse size={28} color={colors.primary} />} title="Nenhum material na obra" description="Os envios do estoque central para esta obra aparecem aqui." />}
      ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
    />
  );
}

function Movements({ projectId }: { projectId: Id<"projects"> }) {
  const { results, status, loadMore } = usePaginatedQuery(api.inventory.listDocuments, { projectId }, { initialNumItems: 30 });
  if (status === "LoadingFirstPage") return <LoadingState />;
  return (
    <FlatList
      data={results}
      keyExtractor={(d) => d._id}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.4}
      onEndReached={() => status === "CanLoadMore" && loadMore(30)}
      renderItem={({ item }) => {
        const st = DOCUMENT_STATUS[item.status] ?? { label: item.status, tone: "neutral" as const };
        const inbound = item.type === "transfer";
        const Icon = item.type === "reversal" ? Undo2 : inbound ? ArrowDownToLine : ArrowUpFromLine;
        return (
          <Surface style={{ gap: space.sm }}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: inbound ? colors.successSoft : colors.primarySoft }]}>
                <Icon size={18} color={inbound ? colors.success : colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{MOVEMENT_LABELS[item.type] ?? item.type}</Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.createdByName, formatShortDateTime(item.postedAt ?? item.createdAt)].join(" · ")}
                </Text>
              </View>
              <Pill label={st.label} tone={st.tone} />
            </View>
            <Text style={[type.bodySm, { color: colors.text }]} numberOfLines={3}>
              {item.items.map((l) => `${formatQty(l.quantity, null)} × ${l.materialName}`).join("\n")}
            </Text>
          </Surface>
        );
      }}
      ListEmptyComponent={<EmptyState icon={<History size={28} color={colors.primary} />} title="Nenhuma movimentação" description="Envios, consumos e devoluções desta obra aparecem aqui." />}
      ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  top: { gap: space.md, paddingHorizontal: space.screen, paddingTop: space.lg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
