import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Calendar, Hash, StickyNote, Wallet } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Field, PickerField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { parseCurrencyInput, toCurrencyInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { MONTH_NAMES } from "./labels";

export type Loan = FunctionReturnType<typeof api.payroll.listLoans>[number];

/** Criar / editar empréstimo a funcionário (descontado em parcelas na folha). */
export function LoanFormSheet({ open, onClose, employeeId, employeeName, loan }: { open: boolean; onClose: () => void; employeeId: Loan["employeeId"]; employeeName: string; loan?: Loan | null }) {
  const toast = useToast();
  const create = useMutation(api.payroll.createLoan);
  const update = useMutation(api.payroll.updateLoan);
  const now = new Date();

  const [total, setTotal] = useState("");
  const [count, setCount] = useState("1");
  const [installment, setInstallment] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState<string | null>(String(now.getMonth() + 1));
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTotal(loan ? toCurrencyInput(loan.totalCents) : "");
    setCount(String(loan?.installmentCount ?? 1));
    setInstallment(loan ? toCurrencyInput(loan.installmentCents) : "");
    setYear(String(loan?.startYear ?? now.getFullYear()));
    setMonth(String(loan?.startMonth ?? now.getMonth() + 1));
    setDescription(loan?.description ?? "");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan]);

  const totalCents = parseCurrencyInput(total);
  const countNum = Number.parseInt(count, 10);
  const suggested = useMemo(() => (totalCents !== null && Number.isFinite(countNum) && countNum > 0 ? Math.round(totalCents / countNum) : null), [totalCents, countNum]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (totalCents === null || totalCents <= 0) nextErrors.total = "Informe o valor";
    if (!Number.isFinite(countNum) || countNum < 1) nextErrors.count = "Mínimo 1 parcela";
    const y = Number.parseInt(year, 10);
    if (!Number.isFinite(y) || y < 2000) nextErrors.year = "Ano inválido";
    if (!month) nextErrors.month = "Escolha o mês";
    const inst = installment.trim() ? parseCurrencyInput(installment) : null;
    if (installment.trim() && inst === null) nextErrors.installment = "Valor inválido";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const payload = {
        totalCents: totalCents!,
        installmentCount: countNum,
        installmentCents: inst ?? undefined,
        startYear: y,
        startMonth: Number.parseInt(month!, 10),
      };
      if (loan) {
        await update({ loanId: loan._id, ...payload, description: description.trim() || null });
        toast.success("Empréstimo atualizado");
      } else {
        await create({ employeeId, ...payload, description: description.trim() || undefined });
        toast.success("Empréstimo registrado");
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o empréstimo"));
    } finally {
      setSaving(false);
    }
  }

  const ic = colors.icon;

  return (
    <Sheet open={open} onClose={onClose} title={loan ? "Editar empréstimo" : "Novo empréstimo"} subtitle={employeeName} maxHeight={0.85} footer={<AppButton label={loan ? "Salvar" : "Registrar"} onPress={() => void submit()} loading={saving} />}>
      <Field label="Valor total (R$) *" icon={<Wallet size={24} color={ic} strokeWidth={1.6} />} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="0,00" error={errors.total} autoFocus={!loan} />
      <View style={styles.row}>
        <Field label="Parcelas *" icon={<Hash size={22} color={ic} strokeWidth={1.6} />} value={count} onChangeText={setCount} keyboardType="number-pad" containerStyle={{ flex: 1 }} error={errors.count} />
        <Field label="Parcela (R$)" value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" containerStyle={{ flex: 1.4 }} placeholder={suggested !== null ? toCurrencyInput(suggested) : "automático"} error={errors.installment} />
      </View>
      <Text style={[type.eyebrow, { color: colors.textSecondary }]}>Primeiro desconto</Text>
      <View style={styles.row}>
        <PickerField label="Mês *" icon={<Calendar size={22} color={ic} strokeWidth={1.6} />} value={month} onChange={setMonth} options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))} containerStyle={{ flex: 1.4 }} error={errors.month} />
        <Field label="Ano *" value={year} onChangeText={setYear} keyboardType="number-pad" containerStyle={{ flex: 1 }} error={errors.year} />
      </View>
      <Field label="Descrição" icon={<StickyNote size={24} color={ic} strokeWidth={1.6} />} value={description} onChangeText={setDescription} placeholder="Ex: adiantamento, ferramenta" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
});
