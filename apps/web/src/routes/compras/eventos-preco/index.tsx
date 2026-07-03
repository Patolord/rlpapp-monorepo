import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate, parseCurrencyToCents } from "@rlpapp/shared";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/compras/eventos-preco/")({
  component: EventosPrecoPage,
});

function EventosPrecoPage() {
  return (
    <AuthShell>
      <EventosPrecoContent />
    </AuthShell>
  );
}

function EventosPrecoContent() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.priceEvents.list, { now, limit: 100 });
  const materials = useQuery(api.materials.list, { activeOnly: true });
  const suppliers = useQuery(api.suppliers.list, { activeOnly: true });
  const addPrice = useMutation(api.priceEvents.add);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    rawDescription: "",
    materialId: "",
    supplierId: "",
    supplierNameRaw: "",
    unitPrice: "",
    unit: "",
    source: "manual" as const,
    occurredAt: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  async function handleAdd() {
    setSubmitting(true);
    try {
      const unitPriceCents = parseCurrencyToCents(form.unitPrice);
      const occurredAt = new Date(form.occurredAt).getTime();
      await addPrice({
        rawDescription: form.rawDescription || undefined,
        materialId: form.materialId ? (form.materialId as Id<"materials">) : undefined,
        supplierId: form.supplierId ? (form.supplierId as Id<"suppliers">) : undefined,
        supplierNameRaw: form.supplierNameRaw || undefined,
        unitPriceCents,
        unit: form.unit || undefined,
        source: form.source,
        occurredAt,
        notes: form.notes || undefined,
      });
      toast.success("Preço registrado");
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao registrar preço"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eventos de Preço</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de cotações, compras e preços informados.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 size-4" />Registrar preço</Button>} />
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar preço manual</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Descrição livre</Label>
                <Input value={form.rawDescription} onChange={(e) => setForm({ ...form, rawDescription: e.target.value })} placeholder="cobre 1/4" />
              </div>
              <div>
                <Label>Material (opcional)</Label>
                <Select value={form.materialId} onValueChange={(v) => setForm({ ...form, materialId: v ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {(materials ?? []).map((m) => (
                      <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor cadastrado (opcional)</Label>
                <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {(suppliers ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor livre (opcional)</Label>
                <Input value={form.supplierNameRaw} onChange={(e) => setForm({ ...form, supplierNameRaw: e.target.value })} placeholder="João loja cobre" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Preço unitário</Label>
                  <Input value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="12,80" />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m" />
                </div>
              </div>
              <div>
                <Label>Fonte</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: (v ?? "manual") as typeof form.source })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="quote">Cotação</SelectItem>
                    <SelectItem value="purchase">Compra</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="invoice">Nota fiscal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material / Descrição</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Freshness</TableHead>
                <TableHead>Avisos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(events ?? []).map((e) => (
                <TableRow key={e._id}>
                  <TableCell>
                    <div className="font-medium">{e.materialName ?? e.rawDescription ?? "—"}</div>
                  </TableCell>
                  <TableCell>{e.supplierName}</TableCell>
                  <TableCell>{formatCurrency(e.unitPriceCents)}{e.unit ? `/${e.unit}` : ""}</TableCell>
                  <TableCell>{formatDate(e.occurredAt)}</TableCell>
                  <TableCell>
                    <PriceFreshnessBadge freshness={e.freshness} ageDays={e.ageDays} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.warnings.join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
