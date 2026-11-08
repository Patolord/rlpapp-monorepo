import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronLeft, ChevronRight, Lock, LockOpen, Plus, Wallet } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MONTH_LABELS, MONTH_NAMES, PAYMENT_METHOD } from "@/components/rh/labels";
import { PayrollLineSheet, type PayrollLine } from "@/components/rh/payroll-line-sheet";
import { AppButton, ConfirmDialog, EmptyState, IconButton, LoadingState, PickerField, Pill, SectionTitle, Sheet, StatTile, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, radius, space, type } from "@/lib/theme";

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Folha de pagamento do mês: criar, linhas, pago, fechar/reabrir. */
export default function FolhaScreen() {
  const toast = useToast();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const workspace = useQuery(api.payroll.getWorkspace, { year: period.year, paymentMonth: period.month });
  const createRun = useMutation(api.payroll.createRun);
  const addEmployee = useMutation(api.payroll.addEmployeeToRun);
  const togglePaid = useMutation(api.payroll.togglePaid);
  const closeRun = useMutation(api.payroll.closeRun);
  const reopenRun = useMutation(api.payroll.reopenRun);

  const [line, setLine] = useState<PayrollLine | null>(null);
  const [adding, setAdding] = useState(false);
  const [employeeToAdd, setEmployeeToAdd] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"close" | "reopen" | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);

  const run = workspace?.run ?? null;
  const editable = run?.status === "draft";
  const liveLine = line ? (workspace?.lines.find((l) => l._id === line._id) ?? line) : null;

  async function act(action: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      setConfirm(null);
      setAdding(false);
      setEmployeeToAdd(null);
    } catch (error) {
      toast.error(getErrorMessage(error, fail));
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePaid(l: PayrollLine) {
    setBusyLine(l._id);
    try {
      await togglePaid({ lineId: l._id, paid: !l.paid });
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar"));
    } finally {
      setBusyLine(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.periodBar}>
        <IconButton label="Mês anterior" icon={<ChevronLeft size={20} color={colors.text} strokeWidth={2} />} onPress={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[type.heading, { color: colors.text }]}>
            {MONTH_NAMES[period.month - 1]} {period.year}
          </Text>
          {run ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              Pagto dia {String(run.paymentDay).padStart(2, "0")} · ref {MONTH_LABELS[run.referenceMonth - 1]}/{String(run.referenceYear).slice(-2)}
            </Text>
          ) : null}
        </View>
        <IconButton label="Próximo mês" icon={<ChevronRight size={20} color={colors.text} strokeWidth={2} />} onPress={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} />
      </View>

      {workspace === undefined ? (
        <LoadingState />
      ) : !run ? (
        <View style={{ paddingHorizontal: space.screen }}>
          <EmptyState
            icon={<Wallet size={30} color={colors.primary} strokeWidth={1.8} />}
            title="Folha ainda não criada"
            description={`Crie a folha de ${MONTH_NAMES[period.month - 1]} para lançar os funcionários ativos. Os parâmetros vêm da folha anterior.`}
            actionLabel="Criar folha"
            onAction={() => void act(() => createRun({ year: period.year, paymentMonth: period.month }), "Folha criada", "Não foi possível criar a folha")}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.statusRow}>
            <Pill label={run.status === "draft" ? "Em aberto" : "Fechada"} tone={run.status === "draft" ? "info" : "success"} icon={run.status === "draft" ? <LockOpen size={11} color={colors.info} /> : <Lock size={11} color={colors.success} />} />
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {workspace.kpis.paidCount}/{workspace.kpis.lineCount} pagos
            </Text>
          </View>
          <View style={styles.stats}>
            <StatTile label="Total da folha" value={formatCurrency(workspace.kpis.totalPaymentCents)} hint={`${workspace.kpis.lineCount} funcionário${workspace.kpis.lineCount === 1 ? "" : "s"}`} />
            <StatTile label="Já pago" value={formatCurrency(workspace.kpis.paidTotalCents)} tone="success" hint={`PIX ${formatCurrency(workspace.kpis.pixTotalCents)} (${workspace.kpis.pixCount})`} />
          </View>
          <View style={styles.stats}>
            <StatTile label="Empréstimos no mês" value={formatCurrency(workspace.kpis.monthLoanDeductionCents)} tone="warning" hint={`${workspace.kpis.activeLoanCount} ativo${workspace.kpis.activeLoanCount === 1 ? "" : "s"} · saldo ${formatCurrency(workspace.kpis.outstandingLoanCents)}`} />
          </View>

          <View style={styles.actions}>
            {editable ? (
              <>
                <AppButton label="Adicionar funcionário" variant="secondary" size="sm" icon={<Plus size={18} color={colors.text} strokeWidth={2} />} onPress={() => setAdding(true)} style={{ flex: 1 }} disabled={workspace.availableEmployees.length === 0} />
                <AppButton label="Fechar folha" size="sm" trailing={null} icon={<Lock size={18} color={colors.onPrimary} strokeWidth={2} />} onPress={() => setConfirm("close")} />
              </>
            ) : (
              <AppButton label="Reabrir folha" variant="secondary" size="sm" icon={<LockOpen size={18} color={colors.text} strokeWidth={2} />} onPress={() => setConfirm("reopen")} />
            )}
          </View>

          <SectionTitle title="Funcionários" style={styles.section} />
          {workspace.lines.length === 0 ? (
            <EmptyState title="Folha vazia" description="Adicione funcionários para lançar os pagamentos." />
          ) : (
            <Surface padded={false}>
              {workspace.lines.map((l, index) => (
                <View key={l._id} style={[styles.line, index > 0 && styles.lineBorder]}>
                  <Pressable
                    onPress={() => void onTogglePaid(l)}
                    disabled={busyLine === l._id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: l.paid }}
                    hitSlop={8}
                    style={[styles.check, l.paid && { backgroundColor: colors.success, borderColor: colors.success }]}
                  >
                    {l.paid ? <Check size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
                  </Pressable>
                  <Pressable onPress={() => setLine(l)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {[l.jobTitle, PAYMENT_METHOD[l.paymentMethod], l.activeLoanCount > 0 ? `${l.activeLoanCount} empréstimo${l.activeLoanCount === 1 ? "" : "s"}` : null, l.awayNotes ? "afastamento" : null].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(l.totalPaymentCents)}</Text>
                      {l.totalLoanDeductionCents > 0 ? <Text style={[type.caption, { color: colors.warning }]}>−{formatCurrency(l.totalLoanDeductionCents)}</Text> : null}
                    </View>
                    <ChevronRight size={18} color={colors.icon} />
                  </Pressable>
                </View>
              ))}
              <View style={[styles.line, styles.lineBorder, { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md }]}>
                <Text style={[type.bodyStrong, { color: colors.textSecondary, flex: 1 }]}>Total</Text>
                <Text style={[type.heading, { color: colors.text }]}>{formatCurrency(workspace.totals.totalPaymentCents)}</Text>
              </View>
            </Surface>
          )}
        </ScrollView>
      )}

      <PayrollLineSheet line={liveLine} editable={editable} onClose={() => setLine(null)} />

      <Sheet open={adding} onClose={() => setAdding(false)} title="Adicionar à folha" maxHeight={0.6} footer={<AppButton label="Adicionar" disabled={!employeeToAdd} loading={busy} onPress={() => run && employeeToAdd && void act(() => addEmployee({ runId: run._id, employeeId: employeeToAdd as Id<"employees"> }), "Funcionário adicionado", "Não foi possível adicionar")} />}>
        <PickerField
          label="Funcionário"
          value={employeeToAdd}
          onChange={setEmployeeToAdd}
          options={(workspace?.availableEmployees ?? []).map((e) => ({ value: e._id as string, label: e.name, description: [e.code ? `#${e.code}` : null, e.jobTitle].filter(Boolean).join(" · ") }))}
          searchable
          emptyText="Todos os funcionários ativos já estão na folha."
        />
      </Sheet>

      <ConfirmDialog
        open={confirm === "close"}
        title="Fechar folha?"
        description="As linhas deixam de ser editáveis e as parcelas de empréstimo do mês ficam consolidadas. É possível reabrir depois."
        confirmLabel="Fechar"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run && void act(() => closeRun({ runId: run._id }), "Folha fechada", "Não foi possível fechar")}
      />
      <ConfirmDialog
        open={confirm === "reopen"}
        title="Reabrir folha?"
        description="A folha volta a ficar editável."
        confirmLabel="Reabrir"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run && void act(() => reopenRun({ runId: run._id }), "Folha reaberta", "Não foi possível reabrir")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  periodBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.screen, paddingBottom: space.md },
  content: { paddingHorizontal: space.screen, paddingBottom: space.xxl * 2, gap: space.md },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stats: { flexDirection: "row", gap: space.md },
  actions: { flexDirection: "row", gap: space.sm },
  section: { paddingHorizontal: 0, paddingTop: space.sm, paddingBottom: space.xs },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
});
