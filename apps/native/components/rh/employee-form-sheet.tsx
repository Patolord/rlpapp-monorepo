import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { AtSign, Briefcase, Bus, Calendar, Hash, KeyRound, Phone, StickyNote, User, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Field, PickerField, SegmentedField, Sheet, Toggle, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseCurrencyInput, parseDateInput, toCurrencyInput, toDateInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { EMPLOYEE_STATUS, PAYMENT_METHOD, type EmployeeStatus, type PaymentMethod } from "./labels";

export type Employee = FunctionReturnType<typeof api.employees.list>[number];

/** Criar / editar funcionário (dados pessoais + parâmetros de folha). */
export function EmployeeFormSheet({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee?: Employee | null; onSaved?: (id: Employee["_id"]) => void }) {
  const toast = useToast();
  const create = useMutation(api.employees.create);
  const update = useMutation(api.employees.update);
  const isEdit = Boolean(employee);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cpf, setCpf] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hiredAt, setHiredAt] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("active");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [pixKey, setPixKey] = useState("");
  const [salary, setSalary] = useState("");
  const [transit, setTransit] = useState("");
  const [days, setDays] = useState("");
  const [foodBasket, setFoodBasket] = useState(false);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? "");
    setCode(employee?.code ?? "");
    setCpf(employee?.cpf ?? "");
    setJobTitle(employee?.jobTitle ?? "");
    setEmail(employee?.email ?? "");
    setPhone(employee?.phone ?? "");
    setHiredAt(toDateInput(employee?.hiredAt));
    setStatus(employee?.status ?? "active");
    setPaymentMethod(employee?.paymentMethod ?? "pix");
    setPixKey(employee?.pixKey ?? "");
    setSalary(employee ? toCurrencyInput(employee.baseSalaryCents) : "");
    setTransit(employee ? toCurrencyInput(employee.dailyTransitCents) : "");
    setDays(employee ? String(employee.defaultTransportFoodDays) : "22");
    setFoodBasket(employee?.receivesFoodBasket ?? false);
    setNotes(employee?.notes ?? "");
    setErrors({});
  }, [open, employee]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Informe o nome";
    const salaryCents = parseCurrencyInput(salary) ?? 0;
    const transitCents = parseCurrencyInput(transit) ?? 0;
    const daysNum = Number.parseInt(days, 10);
    if (salary && parseCurrencyInput(salary) === null) nextErrors.salary = "Valor inválido";
    if (transit && parseCurrencyInput(transit) === null) nextErrors.transit = "Valor inválido";
    if (days && (!Number.isFinite(daysNum) || daysNum < 0)) nextErrors.days = "Informe um número de dias";
    if (hiredAt && parseDateInput(hiredAt) === null) nextErrors.hiredAt = "Data inválida (dd/mm/aaaa)";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const common = {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        email: email.trim(),
        phone: phone.trim(),
        status,
        paymentMethod,
        pixKey: pixKey.trim(),
        baseSalaryCents: salaryCents,
        receivesFoodBasket: foodBasket,
        dailyTransitCents: transitCents,
        defaultTransportFoodDays: Number.isFinite(daysNum) ? daysNum : 0,
        notes: notes.trim(),
      };
      const hired = hiredAt ? parseDateInput(hiredAt) : null;
      let id: Employee["_id"];
      if (employee) {
        await update({ employeeId: employee._id, ...common, code: code.trim() || null, cpf: cpf.trim() || null, hiredAt: hired });
        id = employee._id;
        toast.success("Funcionário atualizado");
      } else {
        id = await create({ ...common, code: code.trim() || undefined, cpf: cpf.trim() || undefined, hiredAt: hired ?? undefined });
        toast.success("Funcionário cadastrado");
      }
      onClose();
      onSaved?.(id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar"));
    } finally {
      setSaving(false);
    }
  }

  const ic = colors.icon;

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? "Editar funcionário" : "Novo funcionário"} footer={<AppButton label={isEdit ? "Salvar alterações" : "Cadastrar"} onPress={() => void submit()} loading={saving} />}>
      <Field label="Nome *" icon={<User size={24} color={ic} strokeWidth={1.6} />} value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" autoFocus={!isEdit} />
      <View style={styles.row}>
        <Field label="Código" icon={<Hash size={22} color={ic} strokeWidth={1.6} />} value={code} onChangeText={setCode} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
        <Field label="CPF" value={cpf} onChangeText={setCpf} containerStyle={{ flex: 1.4 }} keyboardType="numbers-and-punctuation" placeholder="000.000.000-00" />
      </View>
      <Field label="Cargo" icon={<Briefcase size={24} color={ic} strokeWidth={1.6} />} value={jobTitle} onChangeText={setJobTitle} />
      <Field label="Telefone" icon={<Phone size={24} color={ic} strokeWidth={1.6} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="E-mail" icon={<AtSign size={24} color={ic} strokeWidth={1.6} />} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Field label="Admissão" icon={<Calendar size={24} color={ic} strokeWidth={1.6} />} value={hiredAt} onChangeText={(v) => setHiredAt(maskDateInput(v))} keyboardType="number-pad" placeholder="dd/mm/aaaa" error={errors.hiredAt} />
      <PickerField<EmployeeStatus>
        label="Situação"
        value={status}
        onChange={(next) => next && setStatus(next)}
        options={(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((s) => ({ value: s, label: EMPLOYEE_STATUS[s].label }))}
      />

      <Text style={[type.eyebrow, { color: colors.textSecondary, marginTop: space.sm }]}>Pagamento</Text>
      <Field label="Salário base (R$)" icon={<Wallet size={24} color={ic} strokeWidth={1.6} />} value={salary} onChangeText={setSalary} keyboardType="decimal-pad" placeholder="0,00" error={errors.salary} />
      <SegmentedField<PaymentMethod>
        label="Forma de pagamento"
        value={paymentMethod}
        onChange={setPaymentMethod}
        options={(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD[m] }))}
      />
      {paymentMethod === "pix" ? <Field label="Chave PIX" icon={<KeyRound size={24} color={ic} strokeWidth={1.6} />} value={pixKey} onChangeText={setPixKey} autoCapitalize="none" autoCorrect={false} /> : null}
      <View style={styles.row}>
        <Field label="VT por dia (R$)" icon={<Bus size={22} color={ic} strokeWidth={1.6} />} value={transit} onChangeText={setTransit} keyboardType="decimal-pad" containerStyle={{ flex: 1.3 }} error={errors.transit} />
        <Field label="Dias/mês" value={days} onChangeText={setDays} keyboardType="number-pad" containerStyle={{ flex: 1 }} error={errors.days} />
      </View>
      <Toggle value={foodBasket} onChange={setFoodBasket} label="Recebe cesta básica" description="Entra automaticamente nas linhas da folha." />
      <Field label="Observações" icon={<StickyNote size={24} color={ic} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
});
