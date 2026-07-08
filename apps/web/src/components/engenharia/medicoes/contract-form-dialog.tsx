import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
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
import { runWithToast } from "@/lib/errors";

export interface ContractInput {
  _id: Id<"contracts">;
  title: string;
  valueCents: number;
  notes: string | null;
  signedAt: number | null;
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

export function ContractFormDialog({
  projectId,
  contract,
  trigger,
}: {
  projectId: Id<"projects">;
  contract?: ContractInput;
  trigger: ReactNode;
}) {
  const createContract = useMutation(api.medicoes.createContract);
  const updateContract = useMutation(api.medicoes.updateContract);
  const isEdit = Boolean(contract);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(contract?.title ?? "");
  const [value, setValue] = useState(toCurrencyInput(contract?.valueCents));
  const [signedAt, setSignedAt] = useState(toDateInput(contract?.signedAt));
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle(contract?.title ?? "");
    setValue(toCurrencyInput(contract?.valueCents));
    setSignedAt(toDateInput(contract?.signedAt));
    setNotes(contract?.notes ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    let valueCents: number;
    try {
      valueCents = parseCurrencyToCents(value);
    } catch {
      toast.error("Valor do contrato inválido");
      return;
    }
    if (valueCents <= 0) {
      toast.error("O valor do contrato deve ser maior que zero");
      return;
    }

    setSaving(true);
    const ok = await runWithToast(
      () =>
        isEdit && contract
          ? updateContract({
              contractId: contract._id,
              title: title.trim(),
              valueCents,
              notes: notes.trim() || undefined,
              signedAt: fromDateInput(signedAt),
            })
          : createContract({
              projectId,
              title: title.trim(),
              valueCents,
              notes: notes.trim() || undefined,
              signedAt: fromDateInput(signedAt) ?? undefined,
            }),
      isEdit ? "Contrato atualizado" : "Contrato criado",
      isEdit
        ? "Não foi possível atualizar o contrato"
        : "Não foi possível criar o contrato"
    );
    setSaving(false);

    if (ok) {
      setOpen(false);
      if (!isEdit) reset();
    }
  }

  const previewCents = (() => {
    try {
      return parseCurrencyToCents(value);
    } catch {
      return null;
    }
  })();

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
          <DialogTitle>{isEdit ? "Editar contrato" : "Novo contrato"}</DialogTitle>
          <DialogDescription>
            As medições da obra são cobradas contra o valor deste contrato.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="contract-title">Título</Label>
            <Input
              id="contract-title"
              placeholder="Ex: Contrato principal, Aditivo 1..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contract-value">Valor (R$)</Label>
              <Input
                id="contract-value"
                placeholder="100.000,00"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              {previewCents != null && previewCents > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(previewCents)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-signed">Data de assinatura</Label>
              <Input
                id="contract-signed"
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract-notes">Observações</Label>
            <Input
              id="contract-notes"
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar contrato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
