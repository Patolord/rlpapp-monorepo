import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery, useMutation } from "convex/react";
import { Plus, Check, Undo2, Trash2, ChevronDown, ChevronRight, ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/estoque/entrada")({
  component: EntradaPage,
});

function EntradaPage() {
  return (
    <>
      <Authenticated>
        <EntradaContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Faça login para acessar</p>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

type ReceiptLineForm = {
  productId: string;
  qty: number;
  unitCost: string;
};

const STATUS_LABELS: Record<string, string> = {
  PendingReceipt: "Pendente",
  Accepted: "Aceito",
  Returned: "Devolvido",
  Discarded: "Descartado",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PendingReceipt: "outline",
  Accepted: "default",
  Returned: "secondary",
  Discarded: "destructive",
};

function EntradaContent() {
  const receipts = useQuery(api.receipts.list);
  const products = useQuery(api.products.list, { onlyActive: true });
  const suppliers = useQuery(api.suppliers.list, { onlyActive: true });

  const createReceipt = useMutation(api.receipts.createReceipt);
  const acceptReceipt = useMutation(api.receipts.acceptReceipt);
  const returnReceipt = useMutation(api.receipts.returnReceipt);
  const discardReceipt = useMutation(api.receipts.discardReceipt);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    supplierId: "",
    notes: "",
    lines: [{ productId: "", qty: 1, unitCost: "" }] as ReceiptLineForm[],
  });

  const resetForm = () => {
    setForm({
      supplierId: "",
      notes: "",
      lines: [{ productId: "", qty: 1, unitCost: "" }],
    });
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", qty: 1, unitCost: "" }],
    }));
  };

  const removeLine = (index: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== index),
    }));
  };

  const updateLine = (index: number, field: keyof ReceiptLineForm, value: string | number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      ),
    }));
  };

  const handleCreate = async () => {
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      toast.error("Adicione pelo menos uma linha com produto");
      return;
    }
    try {
      await createReceipt({
        supplierId: form.supplierId
          ? (form.supplierId as Id<"suppliers">)
          : undefined,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: l.qty,
          unitCost: l.unitCost ? Number(l.unitCost) : undefined,
          costSource: l.unitCost ? ("manual" as const) : undefined,
        })),
      });
      toast.success("Recibo criado com sucesso");
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar recibo");
    }
  };

  const handleAccept = async (receiptId: Id<"receipts">) => {
    try {
      await acceptReceipt({ receiptId });
      toast.success("Recibo aceito - entrada registrada");
    } catch (error: any) {
      toast.error(error.message || "Erro ao aceitar recibo");
    }
  };

  const handleReturn = async (receiptId: Id<"receipts">) => {
    try {
      await returnReceipt({ receiptId });
      toast.success("Recibo devolvido");
    } catch (error: any) {
      toast.error(error.message || "Erro ao devolver recibo");
    }
  };

  const handleDiscard = async (receiptId: Id<"receipts">) => {
    if (!confirm("Deseja descartar este recibo?")) return;
    try {
      await discardReceipt({ receiptId });
      toast.success("Recibo descartado");
    } catch (error: any) {
      toast.error(error.message || "Erro ao descartar recibo");
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recibos (Entrada)</h1>
          <p className="text-muted-foreground">
            Gerencie recibos de entrada no armazém
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Recibo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Recibo</DialogTitle>
              <DialogDescription>
                Registre um novo recibo com uma ou mais linhas de produto
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Fornecedor (opcional)</Label>
                  <Select
                    value={form.supplierId}
                    onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Observações</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Notas opcionais"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Linhas</Label>
                  <Button variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3 w-3 mr-1" /> Linha
                  </Button>
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                    <div className="grid gap-1">
                      {i === 0 && <Label className="text-xs">Produto</Label>}
                      <Select
                        value={line.productId}
                        onValueChange={(v) => updateLine(i, "productId", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.name} ({p.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      {i === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateLine(i, "qty", Number(e.target.value))}
                      />
                    </div>
                    <div className="grid gap-1">
                      {i === 0 && <Label className="text-xs">Custo unit.</Label>}
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitCost}
                        onChange={(e) => updateLine(i, "unitCost", e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={form.lines.length <= 1}
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Criar Recibo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5" />
            Recibos
          </CardTitle>
          <CardDescription>
            Lista de recibos e suas linhas de produto
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!receipts ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : receipts.length === 0 ? (
            <p className="text-muted-foreground">Nenhum recibo encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Status</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Linhas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt: any) => (
                  <>
                    <TableRow
                      key={receipt._id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === receipt._id ? null : receipt._id)
                      }
                    >
                      <TableCell>
                        {expandedId === receipt._id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[receipt.status] ?? "outline"}>
                          {STATUS_LABELS[receipt.status] ?? receipt.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{receipt.supplier?.name ?? "-"}</TableCell>
                      <TableCell>{receipt.lines.length} produto(s)</TableCell>
                      <TableCell>{formatDate(receipt.createdAt)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {receipt.notes ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {receipt.status === "PendingReceipt" && (
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" onClick={() => handleAccept(receipt._id)}>
                              <Check className="h-4 w-4 mr-1" />
                              Aceitar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturn(receipt._id)}
                            >
                              <Undo2 className="h-4 w-4 mr-1" />
                              Devolver
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDiscard(receipt._id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedId === receipt._id && (
                      <TableRow key={`${receipt._id}-lines`}>
                        <TableCell colSpan={7} className="bg-muted/50 p-0">
                          <div className="p-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Quantidade</TableHead>
                                  <TableHead>Qtd Contada</TableHead>
                                  <TableHead>Custo Unit.</TableHead>
                                  <TableHead>Fonte Custo</TableHead>
                                  <TableHead>Estimado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {receipt.lines.map((line: any) => (
                                  <TableRow key={line._id}>
                                    <TableCell className="font-medium">
                                      {line.product?.name ?? "Produto não encontrado"}
                                    </TableCell>
                                    <TableCell>
                                      {line.qty} {line.product?.unit}
                                    </TableCell>
                                    <TableCell>
                                      {line.countedQty != null
                                        ? `${line.countedQty} ${line.product?.unit}`
                                        : "-"}
                                    </TableCell>
                                    <TableCell>
                                      {line.unitCost != null
                                        ? `R$ ${line.unitCost.toFixed(2)}`
                                        : "-"}
                                    </TableCell>
                                    <TableCell>{line.costSource ?? "-"}</TableCell>
                                    <TableCell>
                                      {line.isEstimated ? (
                                        <Badge variant="outline">Estimado</Badge>
                                      ) : line.unitCost != null ? (
                                        <Badge variant="secondary">Confirmado</Badge>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
