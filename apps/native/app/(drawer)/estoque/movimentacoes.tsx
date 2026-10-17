import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowDownToLine, ArrowUpFromLine, History, Plus, RotateCcw, Undo2 } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { DOCUMENT_STATUS, MOVEMENT_LABELS } from "@/components/estoque/labels";
import { MovementFormSheet } from "@/components/estoque/movement-form-sheet";
import { AppButton, Chips, EmptyState, Field, IconButton, LoadingState, Pill, ScreenHeader, Sheet, Surface, screenStyles, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatQty } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Filter = "all" | "posted" | "pending_approval" | "reversed";
type DocumentRow = ReturnType<typeof usePaginatedQuery<typeof api.inventory.listDocuments>>["results"][number];

/** Histórico de movimentações (documentos) com estorno e nova movimentação. */
export default function MovimentacoesScreen() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<DocumentRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const access = useQuery(api.inventory.getAccess, {});
  const reverse = useMutation(api.inventory.reverseDocument);

  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.listDocuments,
    { status: filter === "all" ? undefined : filter },
    { initialNumItems: 30 }
  );

  async function doReverse() {
    if (!reversing || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await reverse({ documentId: reversing._id, reason: reason.trim() });
      toast.success("Movimentação estornada");
      setReversing(null);
      setReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível estornar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Movimentações"
        subtitle="Entradas, envios, consumos e ajustes"
        right={<IconButton label="Nova movimentação" tone="primary" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setCreating(true)} />}
      />
      <Chips<Filter>
        active={filter}
        onChange={setFilter}
        items={[
          { key: "all", label: "Todas" },
          { key: "posted", label: "Concluídas" },
          { key: "pending_approval", label: "Aguardando" },
          { key: "reversed", label: "Estornadas" },
        ]}
      />
      {status === "LoadingFirstPage" ? (
        <LoadingState />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={() => status === "CanLoadMore" && loadMore(30)}
          ListEmptyComponent={<EmptyState icon={<History size={30} color={colors.primary} strokeWidth={1.8} />} title="Nenhuma movimentação" description="As movimentações de estoque aparecerão aqui." actionLabel="Nova movimentação" onAction={() => setCreating(true)} />}
          ListFooterComponent={status === "LoadingMore" ? <LoadingState style={{ flex: 0, paddingVertical: space.lg }} /> : null}
          renderItem={({ item }) => {
            const st = DOCUMENT_STATUS[item.status] ?? { label: item.status, tone: "neutral" as const };
            const inbound = item.type === "entry" || item.type === "return";
            const Icon = item.type === "reversal" ? Undo2 : inbound ? ArrowDownToLine : ArrowUpFromLine;
            const total = item.items.reduce((s, i) => s + (i.unitCostCents ?? 0) * i.quantity, 0);
            return (
              <Surface style={{ gap: space.sm }}>
                <View style={styles.top}>
                  <View style={[styles.icon, { backgroundColor: inbound ? colors.successSoft : colors.primarySoft }]}>
                    <Icon size={20} color={inbound ? colors.success : colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {MOVEMENT_LABELS[item.type] ?? item.type}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                      {[item.projectName, item.reference, item.createdByName].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Pill label={st.label} tone={st.tone} />
                </View>
                <View style={{ gap: 2 }}>
                  {item.items.slice(0, 4).map((line) => (
                    <Text key={line._id} style={[type.bodySm, { color: colors.text }]} numberOfLines={1}>
                      {formatQty(line.quantity, null)} × {line.materialName}
                    </Text>
                  ))}
                  {item.items.length > 4 ? <Text style={[type.caption, { color: colors.textMuted }]}>e mais {item.items.length - 4}…</Text> : null}
                </View>
                <View style={styles.bottom}>
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    {formatDateTime(item.postedAt ?? item.createdAt)}
                    {total > 0 ? ` · ${formatCurrency(total)}` : ""}
                  </Text>
                  {item.status === "posted" && item.type !== "reversal" && access?.canWriteCentral ? (
                    <AppButton label="Estornar" variant="ghost" size="sm" icon={<RotateCcw size={16} color={colors.primary} strokeWidth={2} />} onPress={() => setReversing(item)} />
                  ) : null}
                </View>
                {item.approvalReason ? <Text style={[type.caption, { color: colors.warning }]}>{item.approvalReason}</Text> : null}
              </Surface>
            );
          }}
        />
      )}

      <MovementFormSheet open={creating} onClose={() => setCreating(false)} />

      <Sheet
        open={reversing !== null}
        onClose={() => { setReversing(null); setReason(""); }}
        title="Estornar movimentação"
        subtitle={reversing ? MOVEMENT_LABELS[reversing.type] : undefined}
        maxHeight={0.6}
        footer={<AppButton label="Confirmar estorno" variant="danger" trailing={null} disabled={reason.trim().length < 3} loading={busy} onPress={() => void doReverse()} />}
      >
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>Um documento de estorno será criado desfazendo os saldos desta movimentação.</Text>
        <Field label="Motivo *" value={reason} onChangeText={setReason} multiline autoFocus placeholder="Ex: lançamento duplicado" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
});
