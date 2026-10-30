import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, parseCurrencyToCents } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  type Dimensions,
  formatDimensionsShort,
  hasAnyDimension,
  SizeEstimateHint,
} from "@/components/compras/size-estimate-hint";
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
import { getErrorMessage } from "@/lib/errors";

export type TakeoffQuoteTarget = {
  _id: Id<"takeoffItems">;
  rawDescription: string;
  materialId: Id<"materials"> | null;
  materialName: string | null;
  unit: string | null;
  customDimensions: Dimensions | null;
  estimatedUnitPriceCents: number | null;
};

const NO_SUPPLIER = "__none__";

/**
 * Registra uma cotação recebida para um item do takeoff. O backend copia
 * material, obra, unidade e medidas do item, e cria o SKU da medida quando o
 * item ainda não tem material, para a cotação alimentar a família.
 */
export function TakeoffQuoteDialog({
  item,
  onOpenChange,
}: {
  item: TakeoffQuoteTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const suppliers = useQuery(api.suppliers.list, item ? { activeOnly: true } : "skip");
  const addPrice = useMutation(api.priceEvents.add);

  const [supplierId, setSupplierId] = useState(NO_SUPPLIER);
  const [supplierNameRaw, setSupplierNameRaw] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!item) return;
    setSupplierId(NO_SUPPLIER);
    setSupplierNameRaw("");
    setUnitPrice("");
    setOccurredAt(new Date().toISOString().slice(0, 10));
    setValidUntil("");
    setNotes("");
  }, [item]);

  if (!item) return null;

  const hasSupplier = supplierId !== NO_SUPPLIER || supplierNameRaw.trim();

  async function handleSubmit() {
    if (!item) return;
    let unitPriceCents: number;
    try {
      unitPriceCents = parseCurrencyToCents(unitPrice);
    } catch {
      toast.error("Informe o preço cotado");
      return;
    }
    if (!hasSupplier) {
      toast.error("Informe o fornecedor");
      return;
    }
    // O input de data pode ficar vazio; `new Date("")` vira NaN, que o
    // validador numérico aceitaria e quebraria ordenação e recência.
    const occurredAtMs = new Date(occurredAt).getTime();
    if (!Number.isFinite(occurredAtMs)) {
      toast.error("Informe a data da cotação");
      return;
    }
    const validUntilMs = validUntil ? new Date(validUntil).getTime() : undefined;
    if (validUntilMs !== undefined && !Number.isFinite(validUntilMs)) {
      toast.error("Data de validade inválida");
      return;
    }
    setSubmitting(true);
    try {
      await addPrice({
        takeoffItemId: item._id,
        supplierId:
          supplierId !== NO_SUPPLIER ? (supplierId as Id<"suppliers">) : undefined,
        supplierNameRaw:
          supplierId === NO_SUPPLIER ? supplierNameRaw.trim() : undefined,
        unitPriceCents,
        source: "quote",
        occurredAt: occurredAtMs,
        validUntil: validUntilMs,
        notes: notes.trim() || undefined,
      });
      toast.success("Cotação registrada");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao registrar cotação"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar cotação</DialogTitle>
          <DialogDescription>
            {item.materialName ?? item.rawDescription}
            {item.customDimensions && hasAnyDimension(item.customDimensions)
              ? ` · ${formatDimensionsShort(item.customDimensions)}`
              : ""}
            {item.unit ? ` · por ${item.unit}` : ""}
            {item.estimatedUnitPriceCents != null
              ? ` · estimado ${formatCurrency(item.estimatedUnitPriceCents)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="quote-supplier">Fornecedor</Label>
            <Select value={supplierId} onValueChange={(value) => setSupplierId(value ?? NO_SUPPLIER)}>
              <SelectTrigger id="quote-supplier" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>Não cadastrado…</SelectItem>
                {(suppliers ?? []).map((supplier) => (
                  <SelectItem key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {supplierId === NO_SUPPLIER ? (
            <div className="space-y-1">
              <Label htmlFor="quote-supplier-raw">Nome do fornecedor</Label>
              <Input
                id="quote-supplier-raw"
                value={supplierNameRaw}
                onChange={(event) => setSupplierNameRaw(event.target.value)}
                placeholder="Metalúrgica do bairro"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="quote-price">
                Preço cotado{item.unit ? ` (R$/${item.unit})` : " (R$)"}
              </Label>
              <Input
                id="quote-price"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-date">Data da cotação</Label>
              <Input
                id="quote-date"
                type="date"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-valid-until">Válida até</Label>
              <Input
                id="quote-valid-until"
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-notes">Observações</Label>
              <Input
                id="quote-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          {item.customDimensions && hasAnyDimension(item.customDimensions) ? (
            <SizeEstimateHint
              materialId={item.materialId}
              familyName={item.rawDescription}
              dimensions={item.customDimensions}
              supplierId={
                supplierId !== NO_SUPPLIER ? (supplierId as Id<"suppliers">) : null
              }
              compact
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Salvando…" : "Registrar cotação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
