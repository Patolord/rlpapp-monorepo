import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Check, CheckCheck, Pencil, Plus, Ruler, Trash2, Undo2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BASIS_LABELS, MEDICAO_STATUS } from "@/components/engenharia/medicoes/labels";
import { MedicaoFormSheet, type Medicao } from "@/components/engenharia/medicoes/medicao-form-sheet";
import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  IconButton,
  LoadingState,
  Pill,
  SectionTitle,
  StatTile,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, radius, space, type } from "@/lib/theme";

/** Medições da obra: progresso, contratos elegíveis e lista com fluxo de status. */
export default function ObraMedicoesScreen() {
  const toast = useToast();
  const { projectId: raw } = useLocalSearchParams<{ projectId: string }>();
  const projectId = raw as Id<"projects">;

  const medicoes = useQuery(api.medicoes.listMedicoes, { projectId });
  const contracts = useQuery(api.medicoes.listContracts, { projectId });
  const progress = useQuery(api.medicoes.getProgress, { projectId });
  const setStatus = useMutation(api.medicoes.setMedicaoStatus);
  const removeMedicao = useMutation(api.medicoes.removeMedicao);

  const [form, setForm] = useState<{ open: boolean; medicao: Medicao | null; contractId: Id<"contracts"> | null }>({
    open: false,
    medicao: null,
    contractId: null,
  });
  const [removing, setRemoving] = useState<Medicao | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeStatus(medicao: Medicao, status: "rascunho" | "aprovada" | "paga") {
    setBusyId(medicao._id);
    try {
      await setStatus({ medicaoId: medicao._id, status });
      toast.success(`Medição nº ${medicao.sequence}: ${MEDICAO_STATUS[status].label.toLowerCase()}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar o status"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusyId(removing._id);
    try {
      await removeMedicao({ medicaoId: removing._id });
      toast.success("Medição excluída");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível excluir"));
    } finally {
      setBusyId(null);
    }
  }

  if (medicoes === undefined || contracts === undefined) {
    return <LoadingState message="Carregando medições..." />;
  }

  const totals = medicoes.reduce(
    (acc, m) => {
      acc.medido += m.amountCents;
      if (m.status === "aprovada") acc.aprovado += m.amountCents;
      if (m.status === "paga") acc.pago += m.amountCents;
      return acc;
    },
    { medido: 0, aprovado: 0, pago: 0 }
  );
  const canCreate = contracts.length > 0;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <StatTile label="Medido" value={formatCurrency(totals.medido)} hint={`${medicoes.length} medição${medicoes.length === 1 ? "" : "ões"}`} />
          <StatTile label="Pago" value={formatCurrency(totals.pago)} tone="success" hint={`aprovado ${formatCurrency(totals.aprovado)}`} />
        </View>

        {progress ? (
          <Surface style={{ gap: space.sm }}>
            <View style={styles.rowBetween}>
              <Text style={[type.label, { color: colors.textSecondary }]}>Progresso da instalação</Text>
              <Text style={[type.heading, { color: colors.primary }]}>{progress.percent}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.min(100, Math.max(0, progress.percent))}%` }]} />
            </View>
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {progress.installedItems}/{progress.totalItems} equipamentos instalados
            </Text>
          </Surface>
        ) : null}

        <AppButton
          label="Nova medição"
          icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
          onPress={() => setForm({ open: true, medicao: null, contractId: null })}
          disabled={!canCreate}
        />
        {!canCreate ? (
          <Text style={[type.caption, { color: colors.textMuted, marginLeft: 4 }]}>
            Cadastre um contrato de venda ao cliente nesta obra para registrar medições.
          </Text>
        ) : null}

        {contracts.length > 0 ? (
          <>
            <SectionTitle title="Contratos" style={styles.section} />
            {contracts.map((contract) => {
              const pct = contract.valueCents > 0 ? Math.round((contract.medidoCents / contract.valueCents) * 100) : 0;
              return (
                <Surface
                  key={contract._id}
                  style={{ gap: space.sm }}
                  onPress={() => setForm({ open: true, medicao: null, contractId: contract._id })}
                >
                  <View style={styles.rowBetween}>
                    <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                      {contract.title}
                    </Text>
                    <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(contract.valueCents)}</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: `${Math.min(100, pct)}%` }]} />
                  </View>
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    Medido {formatCurrency(contract.medidoCents)} ({pct}%) · saldo {formatCurrency(contract.saldoCents)} · {contract.medicaoCount} medição{contract.medicaoCount === 1 ? "" : "ões"}
                  </Text>
                </Surface>
              );
            })}
          </>
        ) : null}

        <SectionTitle title="Medições" style={styles.section} />
        {medicoes.length === 0 ? (
          <EmptyState
            icon={<Ruler size={30} color={colors.primary} strokeWidth={1.8} />}
            title="Sem medições"
            description="Nenhuma medição registrada para esta obra."
          />
        ) : (
          medicoes.map((m) => {
            const status = MEDICAO_STATUS[m.status];
            const busy = busyId === m._id;
            return (
              <Surface key={m._id} style={{ gap: space.sm }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]}>Medição nº {m.sequence}</Text>
                    <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
                      {m.contractTitle}
                    </Text>
                  </View>
                  <Pill label={status.label} tone={status.tone} />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={[type.heading, { color: colors.text }]}>{formatCurrency(m.amountCents)}</Text>
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    {formatDate(m.referenceDate)}
                    {m.percent != null ? ` · ${m.percent}%` : ""} · {BASIS_LABELS[m.basis] ?? m.basis}
                  </Text>
                </View>
                {m.description ? (
                  <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={3}>
                    {m.description}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  {m.status === "rascunho" ? (
                    <>
                      <AppButton
                        label="Aprovar"
                        size="sm"
                        icon={<Check size={18} color={colors.onPrimary} strokeWidth={2.2} />}
                        trailing={null}
                        loading={busy}
                        onPress={() => void changeStatus(m, "aprovada")}
                        style={{ flex: 1 }}
                      />
                      <IconButton
                        label="Editar medição"
                        icon={<Pencil size={18} color={colors.text} strokeWidth={2} />}
                        onPress={() => setForm({ open: true, medicao: m, contractId: m.contractId })}
                      />
                      <IconButton
                        label="Excluir medição"
                        icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />}
                        onPress={() => setRemoving(m)}
                      />
                    </>
                  ) : m.status === "aprovada" ? (
                    <>
                      <AppButton
                        label="Marcar como paga"
                        size="sm"
                        icon={<CheckCheck size={18} color={colors.onPrimary} strokeWidth={2.2} />}
                        trailing={null}
                        loading={busy}
                        onPress={() => void changeStatus(m, "paga")}
                        style={{ flex: 1 }}
                      />
                      <IconButton
                        label="Voltar para rascunho"
                        icon={<Undo2 size={18} color={colors.text} strokeWidth={2} />}
                        onPress={() => void changeStatus(m, "rascunho")}
                      />
                    </>
                  ) : (
                    <AppButton
                      label="Voltar para aprovada"
                      variant="secondary"
                      size="sm"
                      icon={<Undo2 size={18} color={colors.text} strokeWidth={2} />}
                      loading={busy}
                      onPress={() => void changeStatus(m, "aprovada")}
                    />
                  )}
                </View>
                {m.paidAt ? (
                  <Text style={[type.caption, { color: colors.textMuted }]}>Paga em {formatDate(m.paidAt)}</Text>
                ) : m.approvedAt ? (
                  <Text style={[type.caption, { color: colors.textMuted }]}>Aprovada em {formatDate(m.approvedAt)}</Text>
                ) : null}
              </Surface>
            );
          })
        )}
      </ScrollView>

      <MedicaoFormSheet
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        projectId={projectId}
        contracts={contracts}
        defaultContractId={form.contractId}
        medicao={form.medicao}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Excluir medição nº ${removing?.sequence ?? ""}?`}
        description="Só medições em rascunho podem ser excluídas. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
        busy={busyId !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  stats: { flexDirection: "row", gap: space.md },
  section: { paddingHorizontal: 0, paddingTop: space.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 },
});
