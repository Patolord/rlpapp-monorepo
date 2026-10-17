import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, Field, KeyValueList, SegmentedField, Sheet, Toggle, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { parseCurrencyInput, toCurrencyInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { PAYMENT_METHOD, type PaymentMethod } from "./labels";

export type PayrollLine = FunctionReturnType<typeof api.payroll.getWorkspace>["lines"][number];

/** Edição de uma linha da folha (só com a folha em rascunho). */
export function PayrollLineSheet({ line, editable, onClose }: { line: PayrollLine | null; editable: boolean; onClose: () => void }) {
  const toast = useToast();
  const updateLine = useMutation(api.payroll.updateLine);
  const removeLine = useMutation(api.payroll.removeLine);

  const [salary, setSalary] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [earnings, setEarnings] = useState("");
  const [deductions, setDeductions] = useState("");
  const [supplement, setSupplement] = useState("");
  const [th1, setTh1] = useState("");
  const [th2, setTh2] = useState("");
  const [manualLoan, setManualLoan] = useState("");
  const [days, setDays] = useState("");
  const [transit, setTransit] = useState("");
  const [basket, setBasket] = useState(false);
  const [away, setAway] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!line) return;
    setSalary(toCurrencyInput(line.baseSalaryCents));
    setMethod(line.paymentMethod);
    setEarnings(toCurrencyInput(line.earningsCents));
    setDeductions(toCurrencyInput(line.deductionsCents));
    setSupplement(toCurrencyInput(line.supplementCents));
    setTh1(toCurrencyInput(line.thirteenthFirstCents));
    setTh2(toCurrencyInput(line.thirteenthSecondCents));
    setManualLoan(toCurrencyInput(line.manualLoanDeductionCents));
    setDays(String(line.transportFoodDays));
    setTransit(toCurrencyInput(line.dailyTransitCents));
    setBasket(line.foodBasketEnabled);
    setAway(line.awayNotes ?? "");
    setNotes(line.notes ?? "");
  }, [line]);

  const cents = (v: string) => parseCurrencyInput(v) ?? 0;

  async function submit() {
    if (!line) return;
    setSaving(true);
    try {
      await updateLine({
        lineId: line._id,
        baseSalaryCents: cents(salary),
        paymentMethod: method,
        earningsCents: cents(earnings),
        deductionsCents: cents(deductions),
        supplementCents: cents(supplement),
        thirteenthFirstCents: cents(th1),
        thirteenthSecondCents: cents(th2),
        manualLoanDeductionCents: cents(manualLoan),
        transportFoodDays: Math.max(0, Number.parseInt(days, 10) || 0),
        dailyTransitCents: cents(transit),
        foodBasketEnabled: basket,
        awayNotes: away.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Linha atualizada");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar a linha"));
    } finally {
      setSaving(false);
    }
  }

  async function doRemove() {
    if (!line) return;
    setSaving(true);
    try {
      await removeLine({ lineId: line._id });
      toast.success("Removido da folha");
      setConfirmRemove(false);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open={line !== null}
        onClose={onClose}
        title={line?.name ?? "Linha"}
        subtitle={line ? `Total a pagar ${formatCurrency(line.totalPaymentCents)}` : undefined}
        footer={
          editable ? (
            <View style={styles.footer}>
              <AppButton label="Remover" variant="secondary" icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />} onPress={() => setConfirmRemove(true)} />
              <AppButton label="Salvar" onPress={() => void submit()} loading={saving} style={{ flex: 1 }} />
            </View>
          ) : undefined
        }
      >
        {line ? (
          <>
            <KeyValueList
              items={[
                { label: "Vale-refeição", value: formatCurrency(line.mealVoucherCents) },
                { label: "Vale-transporte", value: formatCurrency(line.transitVoucherCents) },
                { label: "Cesta básica", value: line.foodBasketEnabled ? formatCurrency(line.foodBasketCents) : null },
                { label: "Empréstimos (parcelas do mês)", value: line.scheduledLoanDeductionCents > 0 ? `${formatCurrency(line.scheduledLoanDeductionCents)} · ${line.activeLoanCount} ativo${line.activeLoanCount === 1 ? "" : "s"}` : null },
              ]}
            />
            {!editable ? <Text style={[type.caption, { color: colors.textMuted }]}>Folha fechada — somente leitura.</Text> : null}
            <Field label="Salário base (R$)" size="md" value={salary} onChangeText={setSalary} keyboardType="decimal-pad" editable={editable} />
            <SegmentedField<PaymentMethod> label="Pagamento" value={method} onChange={setMethod} disabled={!editable} options={(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD[m] }))} />
            <View style={styles.row}>
              <Field label="Proventos (R$)" size="md" value={earnings} onChangeText={setEarnings} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
              <Field label="Descontos (R$)" size="md" value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
            </View>
            <View style={styles.row}>
              <Field label="Complemento (R$)" size="md" value={supplement} onChangeText={setSupplement} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
              <Field label="Empréstimo manual (R$)" size="md" value={manualLoan} onChangeText={setManualLoan} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
            </View>
            <View style={styles.row}>
              <Field label="13º 1ª parcela (R$)" size="md" value={th1} onChangeText={setTh1} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
              <Field label="13º 2ª parcela (R$)" size="md" value={th2} onChangeText={setTh2} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} editable={editable} />
            </View>
            <View style={styles.row}>
              <Field label="Dias VT/VR" size="md" value={days} onChangeText={setDays} keyboardType="number-pad" containerStyle={{ flex: 1 }} editable={editable} />
              <Field label="VT por dia (R$)" size="md" value={transit} onChangeText={setTransit} keyboardType="decimal-pad" containerStyle={{ flex: 1.3 }} editable={editable} />
            </View>
            <Toggle value={basket} onChange={setBasket} label="Cesta básica neste mês" disabled={!editable} />
            <Field label="Afastamentos / faltas" size="md" value={away} onChangeText={setAway} multiline editable={editable} />
            <Field label="Observações" size="md" value={notes} onChangeText={setNotes} multiline editable={editable} />
          </>
        ) : null}
      </Sheet>
      <ConfirmDialog open={confirmRemove} title="Remover da folha?" description={`${line?.name ?? ""} sai desta folha; pode ser adicionado de novo.`} confirmLabel="Remover" destructive busy={saving} onCancel={() => setConfirmRemove(false)} onConfirm={() => void doRemove()} />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  row: { flexDirection: "row", gap: space.md },
});
