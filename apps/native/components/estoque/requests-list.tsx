import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Check, Inbox, Send, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { REQUEST_STATUS } from "@/components/estoque/labels";
import { MovementFormSheet, type PrefillLine } from "@/components/estoque/movement-form-sheet";
import { AppButton, Chips, EmptyState, Field, LoadingState, Pill, ScreenHeader, Sheet, Surface, screenStyles, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Request = FunctionReturnType<typeof api.inventoryRequests.listOfficeRequests>[number];
type Filter = "pending" | "approved" | "fulfilled" | "rejected" | "all";

/**
 * Pedidos de material das obras (fichas E9–E11): a engenharia aprova ou
 * recusa com justificativa, o Estoque atende. Cada perfil vê só os botões
 * que pode usar. Com `projectId`, só os pedidos daquela obra (O14).
 */
export function RequestsList({ projectId, showHeader = false }: { projectId?: Id<"projects">; showHeader?: boolean }) {
  const toast = useToast();
  const access = useQuery(api.inventory.getAccess, {});
  const [filter, setFilter] = useState<Filter | null>(null);
  // Quem só atende (Estoque) abre nos aprovados; quem decide, nos pendentes.
  const active: Filter = filter ?? (access && access.canFulfillMaterialRequests && !access.canReviewMaterialRequests ? "approved" : "pending");
  const requests = useQuery(api.inventoryRequests.listOfficeRequests, { projectId, status: active === "all" ? undefined : active });
  const review = useMutation(api.inventoryRequests.reviewRequest);

  const [decision, setDecision] = useState<{ request: Request; kind: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [fulfilling, setFulfilling] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitDecision() {
    if (!decision || !reason.trim()) return;
    setBusy(true);
    try {
      await review({ requestId: decision.request._id, decision: decision.kind, reason: reason.trim() });
      toast.success(decision.kind === "approve" ? "Pedido aprovado" : "Pedido recusado");
      setDecision(null);
      setReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível registrar a decisão"));
    } finally {
      setBusy(false);
    }
  }

  const prefill: PrefillLine[] | undefined = fulfilling?.items.map((i) => ({ materialId: i.materialId, name: i.materialName, variantLabel: i.variantLabel, unit: i.unit, quantity: i.quantity }));

  return (
    <View style={{ flex: 1 }}>
      {showHeader ? (
        <ScreenHeader title="Pedidos das obras" subtitle={requests === undefined ? "Pedidos de material" : `${requests.length} pedido${requests.length === 1 ? "" : "s"}`} />
      ) : null}
      <Chips<Filter>
        active={active}
        onChange={setFilter}
        items={[
          { key: "pending", label: "Pendentes" },
          { key: "approved", label: "Aprovados" },
          { key: "fulfilled", label: "Enviados" },
          { key: "rejected", label: "Recusados" },
          { key: "all", label: "Todos" },
        ]}
      />
      {requests === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon={<Inbox size={30} color={colors.primary} strokeWidth={1.8} />} title="Nenhum pedido aqui" description={active === "pending" ? "Quando um técnico pedir material, o pedido aparece aqui para a engenharia decidir." : active === "approved" ? "Pedidos aprovados pela engenharia aparecem aqui para o Estoque enviar." : "Nada com este filtro."} />}
          renderItem={({ item }) => {
            const st = REQUEST_STATUS[item.status] ?? { label: item.status, tone: "neutral" as const };
            return (
              <Surface style={{ gap: space.sm }}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {projectId ? `Pedido de ${item.requestedByName}` : item.projectName}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]}>
                      {item.requestedByName} · {formatDateTime(item.createdAt)}
                    </Text>
                  </View>
                  <Pill label={st.label} tone={st.tone} />
                </View>
                <View style={{ gap: 2 }}>
                  {item.items.map((line) => (
                    <Text key={line._id} style={[type.bodySm, { color: colors.text }]}>
                      {formatQty(line.quantity, line.unit)} {formatMaterialLabel(line.materialName, line.variantLabel)}
                      {line.markedDepleted ? <Text style={{ color: colors.danger }}> · acabou</Text> : line.reason === "new" ? <Text style={{ color: colors.textMuted }}> · novo</Text> : null}
                    </Text>
                  ))}
                </View>
                {item.notes ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{item.notes}</Text> : null}
                {item.reviewNotes ? (
                  <Text style={[type.caption, { color: item.status === "rejected" ? colors.danger : colors.textMuted }]}>
                    {item.reviewedByName ? `${item.reviewedByName}: ` : ""}{item.reviewNotes}
                  </Text>
                ) : null}
                {item.status === "pending" && access?.canReviewMaterialRequests ? (
                  <View style={styles.actions}>
                    <AppButton label="Aprovar" size="sm" trailing={null} icon={<Check size={18} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setDecision({ request: item, kind: "approve" })} style={{ flex: 1 }} />
                    <AppButton label="Recusar" variant="secondary" size="sm" icon={<X size={18} color={colors.danger} strokeWidth={2.2} />} onPress={() => setDecision({ request: item, kind: "reject" })} style={{ flex: 1 }} />
                  </View>
                ) : null}
                {item.status === "approved" && access?.canFulfillMaterialRequests ? (
                  <AppButton label="Enviar para a obra" size="sm" icon={<Send size={18} color={colors.onPrimary} strokeWidth={2} />} onPress={() => setFulfilling(item)} />
                ) : null}
              </Surface>
            );
          }}
        />
      )}

      <Sheet
        open={decision !== null}
        onClose={() => { setDecision(null); setReason(""); }}
        title={decision?.kind === "approve" ? "Aprovar pedido" : "Recusar pedido"}
        subtitle={decision?.request.projectName}
        maxHeight={0.6}
        footer={<AppButton label={decision?.kind === "approve" ? "Aprovar" : "Recusar"} variant={decision?.kind === "approve" ? "primary" : "danger"} trailing={null} disabled={!reason.trim()} loading={busy} onPress={() => void submitDecision()} />}
      >
        <Field
          label={decision?.kind === "approve" ? "Justificativa" : "Motivo da recusa"}
          helper="Quem pediu recebe a sua resposta."
          value={reason}
          onChangeText={setReason}
          multiline
          autoFocus
          placeholder={decision?.kind === "approve" ? "Ex.: liberar do estoque central" : "Ex.: material já está na obra, no depósito do térreo"}
        />
      </Sheet>

      <MovementFormSheet
        open={fulfilling !== null}
        onClose={() => setFulfilling(null)}
        lockType="transfer"
        fixedProjectId={fulfilling?.projectId ?? null}
        requestId={fulfilling?._id ?? null}
        prefillLines={prefill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  actions: { flexDirection: "row", gap: space.sm, marginTop: 4 },
});
