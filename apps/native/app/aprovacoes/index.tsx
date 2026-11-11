import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { AlertTriangle, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { MOVEMENT_LABELS } from "@/components/estoque/labels";
import { AppButton, Banner, ChoiceGroup, EmptyState, Field, LoadingState, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatShortDateTime, formatQty } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

type Doc = FunctionReturnType<typeof api.inventory.listPendingApprovals>[number];
type Decision = "approve" | "reject";

/**
 * Aprovações de exceção (fichas E12 e E13): envios que quebram uma regra de
 * compatibilidade esperam o engenheiro responsável da obra. Decidir pede
 * justificativa (decisão 24).
 */
export default function AprovacoesScreen() {
  const params = useLocalSearchParams<{ documentId?: string }>();
  const pending = useQuery(api.inventory.listPendingApprovals, {});
  const [open, setOpen] = useState<Doc | null>(null);

  useEffect(() => {
    if (!params.documentId || !pending) return;
    const doc = pending.find((d) => d._id === params.documentId);
    if (doc) setOpen(doc);
  }, [params.documentId, pending]);

  if (pending === undefined) return <LoadingState />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={pending}
        keyExtractor={(d) => d._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          pending.length > 0 ? (
            <Text style={styles.intro}>Só você decide estes envios, por ser o engenheiro responsável da obra. O estoque espera a sua resposta para mandar o material.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Surface onPress={() => setOpen(item)} style={{ gap: space.sm }} accessibilityLabel={`${MOVEMENT_LABELS[item.type]} para ${item.projectName ?? "obra"}, ${item.items.length} itens`}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <AlertTriangle size={20} color={colors.warning} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.projectName ?? "Obra"}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.items.length} {item.items.length === 1 ? "item" : "itens"} · {item.createdByName} · {formatShortDateTime(item.createdAt)}
                </Text>
              </View>
              <Pill label="Esperando você" tone="warning" />
            </View>
            {item.compatibilityIssues[0] ? (
              <Text style={[type.bodySm, { color: colors.text }]} numberOfLines={2}>
                {item.compatibilityIssues[0].message}
              </Text>
            ) : null}
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            tone="success"
            icon={<ShieldCheck size={28} color={colors.success} />}
            title="Nenhum envio esperando você"
            description="Quando um envio para uma obra sua quebrar uma regra de compatibilidade, ele aparece aqui."
          />
        }
      />
      <DecideSheet doc={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Decidir exceção (E13): a regra quebrada à vista e justificativa obrigatória. */
function DecideSheet({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const toast = useToast();
  const review = useMutation(api.inventory.reviewDocument);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDecision(null);
    setReason("");
    setTried(false);
    setError(null);
  }, [doc]);

  async function submit() {
    setTried(true);
    if (!doc || !decision || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await review({ documentId: doc._id, decision, reason: reason.trim() });
      toast.success(decision === "approve" ? "Envio aprovado" : "Envio recusado");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para registrar a decisão. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={doc !== null}
      onClose={onClose}
      title={doc?.projectName ?? "Envio"}
      subtitle={doc ? `${MOVEMENT_LABELS[doc.type]} · ${doc.createdByName}` : undefined}
      footer={
        <AppButton
          label={decision === "reject" ? "Recusar envio" : decision === "approve" ? "Aprovar envio" : "Decidir"}
          variant={decision === "reject" ? "danger" : "primary"}
          block
          loading={saving}
          loadingLabel="Enviando…"
          onPress={() => void submit()}
        />
      }
    >
      {doc ? (
        <View style={{ gap: space.lg }}>
          {doc.compatibilityIssues.map((issue) => (
            <View key={issue.ruleId} style={styles.issue}>
              <AlertTriangle size={18} color={colors.warning} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{issue.message}</Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>
                  {issue.materialAName} × {issue.materialBName}
                </Text>
              </View>
            </View>
          ))}
          <Surface padded={false}>
            {doc.items.map((line, index) => (
              <View key={line._id} style={[styles.line, index > 0 && styles.border]}>
                <Text style={[type.body, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                  {line.materialName}
                </Text>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatQty(line.quantity, null)}</Text>
              </View>
            ))}
          </Surface>
          {doc.reference || doc.notes ? (
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>{[doc.reference, doc.notes].filter(Boolean).join(" · ")}</Text>
          ) : null}
          <ChoiceGroup<Decision>
            label="Sua decisão"
            value={decision}
            onChange={setDecision}
            options={[
              { value: "approve", label: "Aprovar", tone: "success" },
              { value: "reject", label: "Recusar", tone: "danger" },
            ]}
            error={tried && !decision ? "Escolha aprovar ou recusar" : undefined}
          />
          <Field
            label="Justificativa"
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder={decision === "reject" ? "Ex.: usar o adaptador que já está na obra" : "Ex.: pode seguir, a obra usa adaptador"}
            helper="Quem montou o envio recebe a sua resposta."
            error={tried && !reason.trim() ? "Escreva a justificativa" : undefined}
          />
          {error ? <Banner tone="danger" title={error} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  intro: { ...type.bodySm, color: colors.textSecondaryOnBg, marginBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center" },
  issue: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
