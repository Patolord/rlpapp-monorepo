import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { Archive, ArchiveRestore, HandCoins, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, ConfirmDialog, EmptyState, IconButton, KeyValueList, LoadingState, Pill, SectionTitle, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatTaxId } from "@rlpapp/shared/formatters";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, radius, space, type } from "@/lib/theme";

import { formatMonthLabel } from "@rlpapp/shared/rh/payrollLabels";
import { EMPLOYEE_STATUS, PAYMENT_METHOD } from "./labels";
import { EmployeeFormSheet } from "./employee-form-sheet";
import { LoanFormSheet, type Loan } from "./loan-form-sheet";

/**
 * Funcionário (ficha R2) em tela cheia (decisão 18): dados, pagamento,
 * empréstimos, arquivar e restaurar.
 */
export function EmployeeDetailScreen({ employeeId }: { employeeId: Id<"employees"> }) {
  const router = useRouter();
  const header = useNativeHeaderOptions();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const now = new Date();
  const employee = useQuery(api.employees.get, { employeeId });
  const loans = useQuery(api.payroll.listLoans, { employeeId, year: now.getFullYear(), paymentMonth: now.getMonth() + 1 });
  const archive = useMutation(api.employees.archive);
  const restore = useMutation(api.employees.restore);
  const archiveLoan = useMutation(api.payroll.archiveLoan);

  const [editing, setEditing] = useState(false);
  const [loanForm, setLoanForm] = useState<{ open: boolean; loan: Loan | null }>({ open: false, loan: null });
  const [confirm, setConfirm] = useState<{ kind: "archive" } | { kind: "loan"; loan: Loan } | null>(null);
  const [busy, setBusy] = useState(false);
  const onClose = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/rh"));

  async function run(action: () => Promise<unknown>, ok: string, fail: string, close = false) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      setConfirm(null);
      if (close) onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, fail));
    } finally {
      setBusy(false);
    }
  }

  const activeLoans = (loans ?? []).filter((l) => !l.archivedAt);
  const subtitle = employee ? [employee.code ? `#${employee.code}` : null, employee.jobTitle].filter(Boolean).join(" · ") : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ ...header, title: employee?.name ?? "Funcionário" }} />
      <ScrollView contentContainerStyle={styles.content}>
        {subtitle ? <Text style={[type.bodySm, { color: colors.textSecondaryOnBg }]}>{subtitle}</Text> : null}
        {employee === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : employee === null ? (
          <EmptyState title="Funcionário não encontrado" />
        ) : (
          <>
            <View style={styles.pills}>
              <Pill label={EMPLOYEE_STATUS[employee.status].label} tone={EMPLOYEE_STATUS[employee.status].tone} />
              {employee.archivedAt ? <Pill label="Arquivado" tone="neutral" /> : null}
              {employee.receivesFoodBasket ? <Pill label="Cesta básica" tone="info" /> : null}
            </View>
            <KeyValueList
              items={[
                { label: "CPF", value: formatTaxId(employee.cpf) },
                { label: "Telefone", value: employee.phone },
                { label: "E-mail", value: employee.email },
                { label: "Admissão", value: employee.hiredAt ? formatDate(employee.hiredAt) : null },
                { label: "Salário base", value: formatCurrency(employee.baseSalaryCents) },
                { label: "Pagamento", value: `${PAYMENT_METHOD[employee.paymentMethod]}${employee.pixKey ? ` · ${employee.pixKey}` : ""}` },
                { label: "Vale-transporte", value: employee.dailyTransitCents > 0 ? `${formatCurrency(employee.dailyTransitCents)}/dia · ${employee.defaultTransportFoodDays} dias` : null },
                { label: "Observações", value: employee.notes },
              ]}
            />

            <View>
              <SectionTitle title="Empréstimos" style={styles.section} action={employee.archivedAt ? undefined : "Novo"} onAction={() => setLoanForm({ open: true, loan: null })} />
              {loans === undefined ? (
                <LoadingState style={{ flex: 0, paddingVertical: space.lg }} />
              ) : activeLoans.length === 0 ? (
                <Surface style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}>
                  <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum empréstimo ativo.</Text>
                  {!employee.archivedAt ? <AppButton label="Registrar empréstimo" variant="ghost" size="sm" icon={<Plus size={18} color={colors.primary} strokeWidth={2} />} onPress={() => setLoanForm({ open: true, loan: null })} /> : null}
                </Surface>
              ) : (
                <View style={{ gap: space.sm }}>
                  {activeLoans.map((loan) => (
                    <Surface key={loan._id} style={{ gap: space.sm }}>
                      <View style={styles.loanTop}>
                        <View style={styles.loanIcon}>
                          <HandCoins size={20} color={colors.primary} strokeWidth={1.8} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                            {formatCurrency(loan.totalCents)} em {loan.installmentCount}× de {formatCurrency(loan.installmentCents)}
                          </Text>
                          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                            {formatMonthLabel(loan.startYear, loan.startMonth)} → {formatMonthLabel(loan.endYear, loan.endMonth)}
                            {loan.description ? ` · ${loan.description}` : ""}
                          </Text>
                        </View>
                        {loan.settled ? <Pill label="Quitado" tone="success" /> : <Pill label={`${loan.paidCount}/${loan.installmentCount}`} tone="info" />}
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.bar, { width: `${Math.min(100, loan.progressPercent)}%` }]} />
                      </View>
                      <View style={styles.loanBottom}>
                        <Text style={[type.caption, { color: colors.textMuted }]}>Saldo {formatCurrency(loan.outstandingCents)}</Text>
                        {!employee.archivedAt ? (
                          <View style={{ flexDirection: "row" }}>
                            <IconButton label="Editar empréstimo" tone="ghost" size={32} icon={<Pencil size={16} color={colors.text} strokeWidth={2} />} onPress={() => setLoanForm({ open: true, loan })} />
                            <IconButton label="Arquivar empréstimo" tone="ghost" size={32} icon={<Trash2 size={16} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirm({ kind: "loan", loan })} />
                          </View>
                        ) : null}
                      </View>
                    </Surface>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      {employee ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.footer}>
              {employee.archivedAt ? (
                <AppButton label="Restaurar" icon={<ArchiveRestore size={20} color={colors.onPrimary} strokeWidth={2} />} trailing={null} loading={busy} onPress={() => void run(() => restore({ employeeId: employee._id }), "Funcionário restaurado", "Não foi possível restaurar")} style={{ flex: 1 }} />
              ) : (
                <>
                  <AppButton label="Editar" variant="secondary" icon={<Pencil size={20} color={colors.text} strokeWidth={2} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
                  <AppButton label="Arquivar" variant="secondary" icon={<Archive size={20} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirm({ kind: "archive" })} style={{ flex: 1 }} />
                </>
              )}
            </View>
        </View>
      ) : null}

      {employee ? (
        <>
          <EmployeeFormSheet open={editing} onClose={() => setEditing(false)} employee={employee} />
          <LoanFormSheet open={loanForm.open} onClose={() => setLoanForm((f) => ({ ...f, open: false }))} employeeId={employee._id} employeeName={employee.name} loan={loanForm.loan} />
        </>
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === "archive"}
        title="Arquivar funcionário?"
        description="Sai das listas e da folha; o histórico é mantido e pode ser restaurado."
        confirmLabel="Arquivar"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => employee && void run(() => archive({ employeeId: employee._id }), "Funcionário arquivado", "Não foi possível arquivar", true)}
      />
      <ConfirmDialog
        open={confirm?.kind === "loan"}
        title="Arquivar empréstimo?"
        description="Deixa de ser descontado nas próximas folhas."
        confirmLabel="Arquivar"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "loan" && void run(() => archiveLoan({ loanId: confirm.loan._id }), "Empréstimo arquivado", "Não foi possível arquivar")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 120, gap: space.lg },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.screen, paddingTop: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  footer: { flexDirection: "row", gap: space.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  section: { paddingHorizontal: 4, paddingTop: 0 },
  loanTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  loanIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  loanBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
