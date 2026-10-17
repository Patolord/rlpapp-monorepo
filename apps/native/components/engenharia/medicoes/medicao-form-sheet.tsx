import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Calendar, FileText, Percent, StickyNote, Wallet } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";

import { AppButton, Field, PickerField, SegmentedField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseCurrencyInput, parseDateInput, toCurrencyInput, toDateInput } from "@/lib/format";
import { colors, type } from "@/lib/theme";

export type MedicaoBasis = "percentual" | "valor_fixo" | "progresso_equipamentos";
export type Medicao = FunctionReturnType<typeof api.medicoes.listMedicoes>[number];
export type ContractSummary = FunctionReturnType<typeof api.medicoes.listContracts>[number];

const BASIS_OPTIONS: { value: MedicaoBasis; label: string }[] = [
  { value: "percentual", label: "% do contrato" },
  { value: "valor_fixo", label: "Valor fixo" },
  { value: "progresso_equipamentos", label: "Progresso" },
];

/** Criar / editar medição de um contrato da obra. */
export function MedicaoFormSheet({
  open,
  onClose,
  projectId,
  contracts,
  defaultContractId,
  medicao,
}: {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  contracts: ContractSummary[];
  defaultContractId?: Id<"contracts"> | null;
  medicao?: Medicao | null;
}) {
  const toast = useToast();
  const createMedicao = useMutation(api.medicoes.createMedicao);
  const updateMedicao = useMutation(api.medicoes.updateMedicao);
  const isEdit = Boolean(medicao);

  const [contractId, setContractId] = useState<string | null>(null);
  const [basis, setBasis] = useState<MedicaoBasis>("percentual");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const progress = useQuery(api.medicoes.getProgress, open && basis === "progresso_equipamentos" ? { projectId } : "skip");

  useEffect(() => {
    if (!open) return;
    setContractId(medicao?.contractId ?? defaultContractId ?? contracts[0]?._id ?? null);
    setBasis(medicao?.basis ?? "percentual");
    setPercent(medicao?.percent != null ? String(medicao.percent).replace(".", ",") : "");
    setAmount(medicao?.basis === "valor_fixo" ? toCurrencyInput(medicao.amountCents) : "");
    setReferenceDate(toDateInput(medicao?.referenceDate ?? Date.now()));
    setDescription(medicao?.description ?? "");
    setErrors({});
  }, [open, medicao, defaultContractId, contracts]);

  // Sugere o % do progresso da obra quando a base é "progresso".
  useEffect(() => {
    if (basis === "progresso_equipamentos" && progress && !medicao && !percent) {
      setPercent(String(progress.percent).replace(".", ","));
    }
  }, [basis, progress, medicao, percent]);

  const contract = contracts.find((c) => c._id === contractId) ?? null;
  const percentValue = Number.parseFloat(percent.replace(",", "."));
  const computedCents = useMemo(() => {
    if (basis === "valor_fixo") return parseCurrencyInput(amount);
    if (!contract || !Number.isFinite(percentValue)) return null;
    return Math.round((contract.valueCents * percentValue) / 100);
  }, [basis, amount, contract, percentValue]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!contractId) nextErrors.contract = "Escolha o contrato";
    const date = parseDateInput(referenceDate);
    if (date === null) nextErrors.date = "Data inválida (dd/mm/aaaa)";
    if (basis === "valor_fixo") {
      const cents = parseCurrencyInput(amount);
      if (cents === null || cents <= 0) nextErrors.amount = "Informe o valor";
    } else if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue > 100) {
      nextErrors.percent = "Informe um percentual entre 0,1 e 100";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        description: description.trim() || undefined,
        basis,
        percent: basis === "valor_fixo" ? undefined : percentValue,
        amountCents: basis === "valor_fixo" ? (parseCurrencyInput(amount) ?? undefined) : undefined,
        referenceDate: date!,
      };
      if (medicao) {
        await updateMedicao({ medicaoId: medicao._id, ...payload });
        toast.success("Medição atualizada");
      } else {
        await createMedicao({ contractId: contractId as Id<"contracts">, ...payload });
        toast.success("Medição criada");
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar a medição"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar medição nº ${medicao?.sequence}` : "Nova medição"}
      subtitle={contract ? `${contract.title} · saldo ${formatCurrency(contract.saldoCents)}` : undefined}
      footer={<AppButton label={isEdit ? "Salvar alterações" : "Criar medição"} onPress={() => void submit()} loading={saving} />}
    >
      <PickerField
        label="Contrato *"
        icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
        value={contractId}
        onChange={setContractId}
        disabled={isEdit}
        options={contracts.map((c) => ({
          value: c._id as string,
          label: c.title,
          description: `${formatCurrency(c.valueCents)} · saldo ${formatCurrency(c.saldoCents)}`,
        }))}
        error={errors.contract}
        emptyText="Nenhum contrato de venda ao cliente nesta obra."
      />
      <SegmentedField<MedicaoBasis> label="Base de cálculo" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />
      {basis === "valor_fixo" ? (
        <Field
          label="Valor (R$) *"
          icon={<Wallet size={24} color={iconColor} strokeWidth={1.6} />}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          error={errors.amount}
        />
      ) : (
        <Field
          label="Percentual (%) *"
          icon={<Percent size={24} color={iconColor} strokeWidth={1.6} />}
          value={percent}
          onChangeText={setPercent}
          keyboardType="decimal-pad"
          placeholder="10"
          error={errors.percent}
          helper={
            basis === "progresso_equipamentos" && progress
              ? `Progresso da obra: ${progress.installedItems}/${progress.totalItems} equipamentos instalados (${progress.percent}%).`
              : undefined
          }
        />
      )}
      {computedCents != null && basis !== "valor_fixo" ? (
        <Text style={[type.bodySm, { color: colors.textSecondary, marginLeft: 4 }]}>
          Valor calculado: <Text style={{ color: colors.text, fontWeight: "600" }}>{formatCurrency(computedCents)}</Text>
        </Text>
      ) : null}
      <Field
        label="Data de referência *"
        icon={<Calendar size={24} color={iconColor} strokeWidth={1.6} />}
        value={referenceDate}
        onChangeText={(v) => setReferenceDate(maskDateInput(v))}
        keyboardType="number-pad"
        placeholder="dd/mm/aaaa"
        error={errors.date}
      />
      <Field
        label="Descrição"
        icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Período, etapa ou observação"
      />
    </Sheet>
  );
}
