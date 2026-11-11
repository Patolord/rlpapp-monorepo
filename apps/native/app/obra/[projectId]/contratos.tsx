import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { FileText, Plus } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ContractDetailSheet } from "@/components/engenharia/contracts/contract-detail-sheet";
import { ContractFormSheet } from "@/components/engenharia/contracts/contract-form-sheet";
import { DIRECTION_SHORT, DIRECTION_TONE, KIND_LABELS } from "@/components/engenharia/contracts/labels";
import { AppButton, EmptyState, LoadingState, MetricStrip, Pill, Surface } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

/** Contratos da obra (ficha O12): o medido de cada um, detalhe, novo e editar com a obra travada. */
export default function ObraContratosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const id = projectId as Id<"projects">;
  const contracts = useQuery(api.contracts.list, { projectId: id });
  const measured = useQuery(api.medicoes.listContracts, { projectId: id });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"contracts"> | null>(null);

  if (contracts === undefined) return <LoadingState message="Carregando contratos…" />;
  const total = contracts.reduce((s, c) => s + c.valueCents, 0);
  const medido = (measured ?? []).reduce((s, c) => s + c.medidoCents, 0);
  const byId = new Map((measured ?? []).map((m) => [m._id, m]));

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={contracts}
        keyExtractor={(c) => c._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {contracts.length > 0 ? (
              <MetricStrip
                items={[
                  { label: "Contratos", value: contracts.length },
                  { label: "Valor", value: formatCurrency(total) },
                  { label: "Medido", value: formatCurrency(medido) },
                ]}
              />
            ) : null}
            <AppButton label="Novo contrato" variant="secondary" size="sm" icon={<Plus size={16} color={colors.text} />} onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item }) => {
          const m = byId.get(item._id);
          const counterparty = item.customerName ?? item.contractorName;
          return (
            <Surface onPress={() => setSelectedId(item._id)} style={{ gap: space.sm }} accessibilityLabel={item.title}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {counterparty ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{counterparty}</Text> : null}
                </View>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(item.valueCents)}</Text>
              </View>
              <View style={styles.meta}>
                <Pill label={DIRECTION_SHORT[item.direction]} tone={DIRECTION_TONE[item.direction]} />
                {item.kind === "addendum" ? <Pill label={KIND_LABELS.addendum} dot={false} /> : null}
                {m ? (
                  <Text style={[type.caption, { color: colors.textSecondary, flex: 1, textAlign: "right" }]}>
                    Medido {formatCurrency(m.medidoCents)} · saldo {formatCurrency(m.saldoCents)}
                  </Text>
                ) : null}
              </View>
            </Surface>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<FileText size={28} color={colors.primary} />}
            title="Nenhum contrato nesta obra"
            description="Contratos com o cliente e com empreiteiros aparecem aqui e alimentam as medições."
            actionLabel="Novo contrato"
            onAction={() => setCreating(true)}
          />
        }
      />
      <ContractFormSheet open={creating} onClose={() => setCreating(false)} defaultProjectId={id} onSaved={(cid) => setSelectedId(cid)} />
      <ContractDetailSheet contractId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
