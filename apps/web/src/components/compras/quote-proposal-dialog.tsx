import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, parseCurrencyToCents } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import {
  dateInputToEndOfDay,
  dateInputToInstant,
  toDateInput,
  toWeekParam,
} from "@/lib/quote-weeks";

type Line = {
  key: number;
  materialId: string;
  rawDescription: string;
  quantity: string;
  unit: string;
  price: string;
};

let nextKey = 1;
const emptyLine = (materialId = ""): Line => ({
  key: nextKey++,
  materialId,
  rawDescription: "",
  quantity: "",
  unit: "",
  price: "",
});

function parseQuantity(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Registra a proposta de um fornecedor: data, validade, condição e frete
 * valem para todas as linhas; cada linha é um preço. Propostas da mesma
 * semana são comparadas no mapa da rodada.
 */
export function QuoteProposalDialog({
  open,
  onOpenChange,
  initialMaterialId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMaterialId?: Id<"materials">;
  /** Recebe a semana da proposta ("aaaa-mm-dd"). */
  onCreated?: (week: string) => void;
}) {
  const materials = useQuery(api.materials.list, open ? { activeOnly: true } : "skip");
  const suppliers = useQuery(api.suppliers.list, open ? { activeOnly: true } : "skip");
  const createProposal = useMutation(api.quoteProposals.create);

  const [form, setForm] = useState(() => ({
    supplierId: "",
    supplierNameRaw: "",
    receivedAt: toDateInput(Date.now()),
    validUntil: "",
    paymentTerms: "",
    freight: "" as "" | "cif" | "fob",
    reference: "",
    notes: "",
  }));
  const [lines, setLines] = useState<Line[]>(() => [emptyLine(initialMaterialId)]);
  const [submitting, setSubmitting] = useState(false);

  const materialsById = new Map((materials ?? []).map((m) => [m._id as string, m]));
  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  let totalCents = 0;
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity);
    try {
      if (quantity && line.price.trim()) totalCents += quantity * parseCurrencyToCents(line.price);
    } catch {
      // preço ainda incompleto
    }
  }

  async function handleSubmit() {
    const receivedAt = dateInputToInstant(form.receivedAt);
    if (receivedAt === null) {
      toast.error("Informe a data da proposta");
      return;
    }
    const filled = lines.filter((line) => line.price.trim());
    if (filled.length === 0) {
      toast.error("Informe ao menos um preço");
      return;
    }
    setSubmitting(true);
    try {
      await createProposal({
        supplierId: form.supplierId ? (form.supplierId as Id<"suppliers">) : undefined,
        supplierNameRaw: form.supplierId ? undefined : form.supplierNameRaw || undefined,
        receivedAt,
        validUntil: form.validUntil ? (dateInputToEndOfDay(form.validUntil) ?? undefined) : undefined,
        paymentTerms: form.paymentTerms || undefined,
        freight: form.freight || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        lines: filled.map((line) => {
          const material = materialsById.get(line.materialId);
          return {
            materialId: line.materialId ? (line.materialId as Id<"materials">) : undefined,
            rawDescription: line.rawDescription || undefined,
            unitPriceCents: parseCurrencyToCents(line.price),
            unit: line.unit || material?.unit || undefined,
            quantity: parseQuantity(line.quantity),
          };
        }),
      });
      toast.success(`Proposta registrada com ${filled.length} ${filled.length === 1 ? "preço" : "preços"}`);
      onOpenChange(false);
      setLines([emptyLine(initialMaterialId)]);
      onCreated?.(toWeekParam(receivedAt));
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao registrar a proposta"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registrar proposta de fornecedor</DialogTitle>
          <DialogDescription>
            Os preços que um fornecedor passou de uma vez. Cada linha entra no histórico do equipamento e no mapa
            da semana, ao lado dos outros fornecedores.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v ?? "" })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecionar…" />
              </SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.supplierId ? (
              <Input
                aria-label="Fornecedor não cadastrado"
                placeholder="ou nome, se não estiver cadastrado"
                value={form.supplierNameRaw}
                onChange={(e) => setForm({ ...form, supplierNameRaw: e.target.value })}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proposal-received">Recebida em</Label>
            <Input
              id="proposal-received"
              type="date"
              value={form.receivedAt}
              onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proposal-valid">Válida até</Label>
            <Input
              id="proposal-valid"
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proposal-terms">Condição de pagamento</Label>
            <Input
              id="proposal-terms"
              placeholder="28 dias"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Frete</Label>
            <Select
              value={form.freight}
              onValueChange={(v) => setForm({ ...form, freight: (v ?? "") as typeof form.freight })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Não informado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cif">CIF (por conta do fornecedor)</SelectItem>
                <SelectItem value="fob">FOB (por conta da RLP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proposal-reference">Nº da proposta</Label>
            <Input
              id="proposal-reference"
              placeholder="PV-2211"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Preços</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus />
              Adicionar linha
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_80px_70px_120px_auto]">
                <Select value={line.materialId} onValueChange={(v) => updateLine(line.key, { materialId: v ?? "" })}>
                  <SelectTrigger className="w-full" aria-label={`Material da linha ${index + 1}`}>
                    <SelectValue placeholder="Material do catálogo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(materials ?? []).map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.variantLabel ? `${m.name} · ${m.variantLabel}` : m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Descrição do fornecedor, linha ${index + 1}`}
                  placeholder="Descrição do fornecedor"
                  value={line.rawDescription}
                  onChange={(e) => updateLine(line.key, { rawDescription: e.target.value })}
                />
                <Input
                  aria-label={`Quantidade, linha ${index + 1}`}
                  placeholder="Qtd"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
                <Input
                  aria-label={`Unidade, linha ${index + 1}`}
                  placeholder={materialsById.get(line.materialId)?.unit ?? "un"}
                  value={line.unit}
                  onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                />
                <Input
                  aria-label={`Preço unitário, linha ${index + 1}`}
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => updateLine(line.key, { price: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover linha ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Sem material do catálogo, a linha entra na fila de revisão da Compras com a descrição do fornecedor.
            {totalCents > 0 ? ` Total das linhas com quantidade: ${formatCurrency(Math.round(totalCents))}.` : ""}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proposal-notes">Observações</Label>
          <Textarea
            id="proposal-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Salvando…" : "Registrar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
