import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, parseCurrencyToCents } from "@rlpapp/shared";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";

export type MedicaoBasis =
  | "percentual"
  | "valor_fixo"
  | "progresso_equipamentos";

const BASIS_OPTIONS: { value: MedicaoBasis; label: string }[] = [
  { value: "percentual", label: "Percentual do contrato" },
  { value: "valor_fixo", label: "Valor fixo" },
  { value: "progresso_equipamentos", label: "Progresso de equipamentos" },
];

export interface ContractOption {
  _id: Id<"contracts">;
  title: string;
  valueCents: number;
}

export interface MedicaoInput {
  _id: Id<"medicoes">;
  contractId: Id<"contracts">;
  sequence: number;
  description: string | null;
  basis: MedicaoBasis;
  percent: number | null;
  amountCents: number;
  referenceDate: number;
}

/** Converte timestamp (ms) para o formato yyyy-mm-dd de um input date. */
function toDateInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Converte yyyy-mm-dd para timestamp (ms) ou null. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Valor em centavos → string editável no formato pt-BR (ex: "1.234,56"). */
function toCurrencyInput(cents?: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function MedicaoFormDialog({
  projectId,
  contracts,
  defaultContractId,
  medicao,
  trigger,
}: {
  projectId: Id<"projects">;
  contracts: ContractOption[];
  defaultContractId?: Id<"contracts">;
  medicao?: MedicaoInput;
  trigger: ReactNode;
}) {
  const createMedicao = useMutation(api.medicoes.createMedicao);
  const updateMedicao = useMutation(api.medicoes.updateMedicao);
  const isEdit = Boolean(medicao);

  const [open, setOpen] = useState(false);
  const [contractId, setContractId] = useState<string>(
    medicao?.contractId ?? defaultContractId ?? contracts[0]?._id ?? ""
  );
  const [basis, setBasis] = useState<MedicaoBasis>(medicao?.basis ?? "percentual");
  const [percent, setPercent] = useState(
    medicao?.percent != null ? String(medicao.percent) : ""
  );
  const [amount, setAmount] = useState(
    medicao?.basis === "valor_fixo" ? toCurrencyInput(medicao.amountCents) : ""
  );
  const [referenceDate, setReferenceDate] = useState(
    toDateInput(medicao?.referenceDate ?? Date.now())
  );
  const [description, setDescription] = useState(medicao?.description ?? "");
  const [saving, setSaving] = useState(false);

  // Sugestão de % com base no progresso de instalação da obra.
  const progress = useQuery(
    api.medicoes.getProgress,
    open && basis === "progresso_equipamentos" ? { projectId } : "skip"
  );

  useEffect(() => {
    if (
      basis === "progresso_equipamentos" &&
      progress !== undefined &&
      percent === ""
    ) {
      setPercent(String(progress.percent));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, progress]);

  function reset() {
    setContractId(
      medicao?.contractId ?? defaultContractId ?? contracts[0]?._id ?? ""
    );
    setBasis(medicao?.basis ?? "percentual");
    setPercent(medicao?.percent != null ? String(medicao.percent) : "");
    setAmount(
      medicao?.basis === "valor_fixo" ? toCurrencyInput(medicao.amountCents) : ""
    );
    setReferenceDate(toDateInput(medicao?.referenceDate ?? Date.now()));
    setDescription(medicao?.description ?? "");
  }

  const selectedContract = contracts.find((c) => c._id === contractId);
  const percentNumber = Number.parseFloat(percent.replace(",", "."));
  const computedAmountCents =
    basis !== "valor_fixo" &&
    selectedContract &&
    Number.isFinite(percentNumber) &&
    percentNumber > 0
      ? Math.round((selectedContract.valueCents * percentNumber) / 100)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractId) {
      toast.error("Selecione um contrato");
      return;
    }
    const refDate = fromDateInput(referenceDate);
    if (!refDate) {
      toast.error("Informe a data de referência");
      return;
    }

    let payloadPercent: number | undefined;
    let payloadAmountCents: number | undefined;

    if (basis === "valor_fixo") {
      try {
        payloadAmountCents = parseCurrencyToCents(amount);
      } catch {
        toast.error("Valor da medição inválido");
        return;
      }
      if (payloadAmountCents <= 0) {
        toast.error("O valor da medição deve ser maior que zero");
        return;
      }
    } else {
      if (!Number.isFinite(percentNumber) || percentNumber <= 0) {
        toast.error("Informe o percentual da medição");
        return;
      }
      payloadPercent = percentNumber;
    }

    setSaving(true);
    const ok = await runWithToast(
      () =>
        isEdit && medicao
          ? updateMedicao({
              medicaoId: medicao._id,
              description: description.trim(),
              basis,
              percent: payloadPercent,
              amountCents: payloadAmountCents,
              referenceDate: refDate,
            })
          : createMedicao({
              contractId: contractId as Id<"contracts">,
              description: description.trim() || undefined,
              basis,
              percent: payloadPercent,
              amountCents: payloadAmountCents,
              referenceDate: refDate,
            }),
      isEdit ? "Medição atualizada" : "Medição criada",
      isEdit
        ? "Não foi possível atualizar a medição"
        : "Não foi possível criar a medição"
    );
    setSaving(false);

    if (ok) {
      setOpen(false);
      if (!isEdit) reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar medição nº ${medicao?.sequence}` : "Nova medição"}
          </DialogTitle>
          <DialogDescription>
            Cobrança por serviços realizados, deduzida do valor do contrato.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="medicao-contract">Contrato</Label>
            <Select
              value={contractId}
              onValueChange={setContractId}
              disabled={isEdit}
            >
              <SelectTrigger id="medicao-contract">
                <SelectValue placeholder="Selecione o contrato" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.title} — {formatCurrency(c.valueCents)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="medicao-basis">Base de cálculo</Label>
            <Select
              value={basis}
              onValueChange={(v) => {
                setBasis(v as MedicaoBasis);
                if (v === "progresso_equipamentos") setPercent("");
              }}
            >
              <SelectTrigger id="medicao-basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASIS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {basis === "valor_fixo" ? (
            <div className="space-y-2">
              <Label htmlFor="medicao-amount">Valor (R$)</Label>
              <Input
                id="medicao-amount"
                placeholder="10.000,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="medicao-percent">Percentual (%)</Label>
              <Input
                id="medicao-percent"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                placeholder="10"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
              />
              {basis === "progresso_equipamentos" && progress !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Progresso atual da obra: {progress.installedItems}/
                  {progress.totalItems} equipamentos instalados (
                  {progress.percent}%).
                </p>
              )}
              {computedAmountCents != null && (
                <p className="text-xs font-medium tabular-nums">
                  Valor calculado: {formatCurrency(computedAmountCents)}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="medicao-date">Data de referência</Label>
              <Input
                id="medicao-date"
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medicao-description">Descrição</Label>
              <Input
                id="medicao-description"
                placeholder="Opcional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !contractId}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar medição"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
