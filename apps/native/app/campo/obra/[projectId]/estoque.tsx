import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Package, PackagePlus, ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { obraTitle, useFieldObra } from "@/components/campo/obra";
import { RequestMaterialSheet, type DraftLine } from "@/components/campo/request-material-sheet";
import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  Pill,
  SectionTitle,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, space, type, type Tone } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "info" },
  rejected: { label: "Recusado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  fulfilled: { label: "Enviado", tone: "success" },
};

function stockVisual(quantity: number, sentQuantity: number): { label: string; tone: Tone } {
  if (quantity <= 0) return { label: "Zerado", tone: "danger" };
  if (sentQuantity > 0 && quantity / sentQuantity <= 0.2) return { label: "Baixo", tone: "warning" };
  return { label: "Ok", tone: "success" };
}

/** Estoque da obra: saldos, "acabou", pedir material e acompanhar pedidos. */
export default function CampoObraEstoqueScreen() {
  const { projectId: identifier } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const obra = useFieldObra(identifier);
  // As queries de estoque exigem atribuição à obra (lançam "acesso negado"
  // para quem só está de passagem), então só rodam com `assigned`.
  const projectId = obra != null && obra.assigned ? obra._id : null;

  const currentUser = useQuery(api.users.getCurrentUser);
  const balances = useQuery(api.inventoryRequests.listObraBalances, projectId ? { projectId } : "skip");
  const requests = useQuery(api.inventoryRequests.listObraRequests, projectId ? { projectId } : "skip");
  const markDepleted = useMutation(api.inventoryRequests.markDepleted);
  const cancelRequest = useMutation(api.inventoryRequests.cancelRequest);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialLine, setInitialLine] = useState<DraftLine | null>(null);
  const [depleting, setDepleting] = useState<{ materialId: Id<"materials">; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function openRequest(line?: DraftLine) {
    setInitialLine(line ?? null);
    setSheetOpen(true);
  }

  async function confirmDepleted() {
    if (!depleting || !projectId) return;
    setBusy(true);
    try {
      await markDepleted({ projectId, materialId: depleting.materialId });
      toast.success("Saldo zerado");
      setDepleting(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível marcar como acabou"));
    } finally {
      setBusy(false);
    }
  }

  if (obra === undefined) {
    return online ? (
      <LoadingState message="Abrindo obra..." />
    ) : (
      <View style={styles.centered}>
        <EmptyState
          tone="warning"
          icon={<ShieldAlert size={30} color={colors.warning} strokeWidth={1.8} />}
          title="Sem conexão"
          description="O estoque da obra precisa de internet para carregar."
        />
      </View>
    );
  }

  if (obra === null) {
    return (
      <View style={styles.centered}>
        <EmptyState
          tone="neutral"
          icon={<ShieldAlert size={30} color={colors.textSecondary} strokeWidth={1.8} />}
          title="Obra não encontrada"
          description="Esta obra não existe mais ou foi arquivada."
          actionLabel="Voltar para minhas obras"
          onAction={() => router.replace("/campo" as Href)}
        />
      </View>
    );
  }

  if (!projectId) {
    return (
      <View style={styles.centered}>
        <EmptyState
          tone="warning"
          icon={<ShieldAlert size={30} color={colors.warning} strokeWidth={1.8} />}
          title="Sem acesso ao estoque"
          description="O estoque desta obra só fica disponível para técnicos atribuídos a ela. Peça à engenharia para liberar."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {balances === undefined || requests === undefined ? (
        <LoadingState message="Carregando estoque..." />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
            {obraTitle(obra)}
          </Text>
          <AppButton
            label="Pedir material"
            size="lg"
            icon={<PackagePlus size={24} color={colors.onPrimary} strokeWidth={2} />}
            onPress={() => openRequest()}
          />

          <SectionTitle title="Materiais na obra" style={styles.section} />
          {balances.length === 0 ? (
            <EmptyState
              icon={<Package size={30} color={colors.primary} strokeWidth={1.8} />}
              title="Sem materiais ainda"
              description="Esta obra ainda não recebeu materiais."
            />
          ) : (
            balances.map((item) => {
              const depleted = item.quantity <= 0;
              const stock = stockVisual(item.quantity, item.sentQuantity);
              const label = formatMaterialLabel(item.materialName, item.variantLabel);
              return (
                <Surface key={item.materialId} style={{ gap: space.md }}>
                  <View style={styles.balanceTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{label}</Text>
                      <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                        Disponível {formatQty(item.quantity, item.unit)} · enviado {formatQty(item.sentQuantity, item.unit)}
                      </Text>
                    </View>
                    <Pill label={stock.label} tone={stock.tone} />
                  </View>
                  <View style={styles.row}>
                    <AppButton
                      label="Acabou"
                      variant="secondary"
                      size="sm"
                      disabled={depleted}
                      onPress={() => setDepleting({ materialId: item.materialId, name: label })}
                      style={{ flex: 1 }}
                    />
                    <AppButton
                      label="Pedir mais"
                      size="sm"
                      onPress={() =>
                        openRequest({
                          materialId: item.materialId,
                          name: item.materialName,
                          variantLabel: item.variantLabel,
                          unit: item.unit,
                          quantity: 1,
                          reason: "replenishment",
                          markedDepleted: depleted,
                        })
                      }
                      style={{ flex: 1 }}
                    />
                  </View>
                </Surface>
              );
            })
          )}

          <SectionTitle title="Pedidos" style={styles.section} />
          {requests.length === 0 ? (
            <Text style={[type.bodySm, { color: colors.textSecondary, paddingHorizontal: 4 }]}>Nenhum pedido ainda.</Text>
          ) : (
            requests.map((request) => {
              const status = REQUEST_STATUS[request.status] ?? { label: request.status, tone: "neutral" as Tone };
              const mine = request.requestedByUserId === currentUser?._id;
              return (
                <Surface key={request._id} style={{ gap: space.sm }}>
                  <View style={styles.balanceTop}>
                    <Text style={[type.caption, { color: colors.textMuted }]}>{formatDateTime(request.createdAt)}</Text>
                    <Pill label={status.label} tone={status.tone} />
                  </View>
                  {request.items.map((item) => (
                    <Text key={item._id} style={[type.bodySm, { color: colors.text }]}>
                      {formatQty(item.quantity, item.unit)} {formatMaterialLabel(item.materialName, item.variantLabel)}
                    </Text>
                  ))}
                  {request.status === "rejected" && request.reviewNotes ? (
                    <Text style={[type.bodySm, { color: colors.danger }]}>{request.reviewNotes}</Text>
                  ) : null}
                  {request.status === "pending" && mine ? (
                    <AppButton
                      label="Cancelar pedido"
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        void cancelRequest({ requestId: request._id }).catch((error) =>
                          toast.error(getErrorMessage(error, "Não foi possível cancelar"))
                        )
                      }
                      style={{ alignSelf: "flex-start" }}
                    />
                  ) : null}
                </Surface>
              );
            })
          )}
        </ScrollView>
      )}

      <RequestMaterialSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectId={projectId}
        initialMaterial={initialLine}
      />

      <ConfirmDialog
        open={depleting !== null}
        title="Marcar como acabou?"
        description={depleting ? `O saldo de ${depleting.name} nesta obra será zerado.` : undefined}
        confirmLabel={busy ? "Salvando..." : "Confirmar"}
        busy={busy}
        onConfirm={() => void confirmDepleted()}
        onCancel={() => setDepleting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
    paddingBottom: space.xxl * 2,
    gap: space.md,
  },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.screen },
  section: { paddingHorizontal: 0, paddingTop: space.md },
  balanceTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  row: { flexDirection: "row", gap: space.md },
});
