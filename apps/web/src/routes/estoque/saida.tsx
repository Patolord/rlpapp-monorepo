import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import {
  Plus,
  Check,
  PackageCheck,
  XCircle,
  ChevronDown,
  ChevronRight,
  ArrowUpFromLine,
  QrCode,
  Printer,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";

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
import { AuthShell } from "@/components/auth-shell";
import { getErrorMessage } from "@/lib/errors";

import type { FunctionReturnType } from "convex/server";
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_VARIANTS, formatDateTime } from "@rlpapp/shared";

type Shipment = FunctionReturnType<typeof api.shipments.list>[number];

export const Route = createFileRoute("/estoque/saida")({
  component: SaidaPage,
});

function SaidaPage() {
  return (
    <AuthShell>
      <SaidaContent />
    </AuthShell>
  );
}

type ShipmentLineForm = {
  productId: string;
  qty: number;
};

function SaidaContent() {
  const shipments = useQuery(api.shipments.list);
  const products = useQuery(api.products.list, { onlyActive: true });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const stock = useQuery(api.inventory.getStock);

  const createShipment = useMutation(api.shipments.createShipment);
  const stageShipment = useMutation(api.shipments.stageShipment);
  const confirmDelivery = useMutation(api.shipments.confirmDelivery);
  const cancelBeforeLeave = useMutation(api.shipments.cancelBeforeLeave);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qrShipment, setQrShipment] = useState<Shipment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!qrShipment?.qrCodeData) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrShipment.qrCodeData, { width: 250, margin: 2 }).then(
      (url: string) => setQrDataUrl(url),
      () => setQrDataUrl("")
    );
  }, [qrShipment]);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Código QR - Remessa</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}.center{text-align:center}</style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const [form, setForm] = useState({
    toSiteId: "",
    notes: "",
    lines: [{ productId: "", qty: 1 }] as ShipmentLineForm[],
  });

  const resetForm = () => {
    setForm({
      toSiteId: "",
      notes: "",
      lines: [{ productId: "", qty: 1 }],
    });
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", qty: 1 }],
    }));
  };

  const removeLine = (index: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== index),
    }));
  };

  const updateLine = (index: number, field: keyof ShipmentLineForm, value: string | number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      ),
    }));
  };

  const getStockForProduct = (productId: string) => {
    const snap = stock?.find((s) => s.productId === productId);
    return snap?.qtyOnHand ?? 0;
  };

  const handleCreate = async () => {
    if (!form.toSiteId) {
      toast.error("Selecione a obra de destino");
      return;
    }
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      toast.error("Adicione pelo menos uma linha com produto");
      return;
    }
    try {
      await createShipment({
        toSiteId: form.toSiteId as Id<"sites">,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: l.qty,
        })),
      });
      toast.success("Remessa criada - saída registrada");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar remessa"));
    }
  };

  const handleStage = async (shipmentId: Id<"shipments">) => {
    try {
      await stageShipment({ shipmentId });
      toast.success("Remessa marcada como aguardando envio");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao preparar remessa"));
    }
  };

  const handleConfirmDelivery = async (shipmentId: Id<"shipments">) => {
    try {
      await confirmDelivery({ shipmentId });
      toast.success("Entrega confirmada");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao confirmar entrega"));
    }
  };

  const handleCancel = async (shipmentId: Id<"shipments">) => {
    if (!confirm("Cancelar remessa? O estoque será restaurado no armazém.")) return;
    try {
      await cancelBeforeLeave({ shipmentId });
      toast.success("Remessa cancelada - estoque restaurado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao cancelar remessa"));
    }
  };

  const canAct = (status: string) =>
    status === "RegisteredOut" || status === "PendingShipment";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Remessas (Saída)</h1>
          <p className="text-muted-foreground">
            Gerencie remessas do armazém para sites
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Remessa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Remessa</DialogTitle>
              <DialogDescription>
                Registre uma nova remessa com uma ou mais linhas (a saída do
                estoque é aplicada imediatamente)
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Obra de destino</Label>
                  <Select
                    value={form.toSiteId}
                    onValueChange={(v) => setForm((f) => ({ ...f, toSiteId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((s) => (
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
                  <div key={i} className="grid grid-cols-[1fr_100px_32px] gap-2 items-end">
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
                              {p.name} - Disp: {getStockForProduct(p._id)} {p.unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      {i === 0 && <Label className="text-xs">Quantidade</Label>}
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateLine(i, "qty", Number(e.target.value))}
                      />
                      {line.productId && (
                        <p className="text-[10px] text-muted-foreground">
                          Disp: {getStockForProduct(line.productId)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={form.lines.length <= 1}
                      onClick={() => removeLine(i)}
                    >
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Criar Remessa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5" />
            Remessas
          </CardTitle>
          <CardDescription>
            Lista de remessas e suas transições de estado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!shipments ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : shipments.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma remessa encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Situação</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Linhas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((shipment) => (
                  <>
                    <TableRow
                      key={shipment._id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === shipment._id ? null : shipment._id)
                      }
                    >
                      <TableCell>
                        {expandedId === shipment._id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SHIPMENT_STATUS_VARIANTS[shipment.status] ?? "outline"}>
                          {SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{shipment.site?.name ?? "-"}</TableCell>
                      <TableCell>{shipment.lines.length} produto(s)</TableCell>
                      <TableCell>{formatDateTime(shipment.createdAt)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {shipment.notes ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {canAct(shipment.status) && (
                            <>
                              {shipment.status === "RegisteredOut" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStage(shipment._id)}
                                >
                                  <PackageCheck className="h-4 w-4 mr-1" />
                                  Preparar
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleConfirmDelivery(shipment._id)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Entregue
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCancel(shipment._id)}
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {canAct(shipment.status) && shipment.qrCodeData && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setQrShipment(shipment)}
                            >
                              <QrCode className="h-4 w-4 mr-1" />
                              QR
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === shipment._id && (
                      <TableRow key={`${shipment._id}-lines`}>
                        <TableCell colSpan={7} className="bg-muted/50 p-0">
                          <div className="p-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Quantidade</TableHead>
                                  <TableHead>Quantidade contada na entrega</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {shipment.lines.map((line) => (
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

      <Dialog open={!!qrShipment} onOpenChange={(open) => !open && setQrShipment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Código QR da remessa</DialogTitle>
            <DialogDescription>
              Imprima este documento e envie junto com os materiais
            </DialogDescription>
          </DialogHeader>
          {qrShipment && (
            <div ref={printRef} className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold text-lg">Remessa de Materiais</h3>
                <p className="text-sm text-muted-foreground">
                  Destino: {qrShipment.site?.name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Data: {formatDateTime(qrShipment.createdAt)}
                </p>
              </div>
              {qrDataUrl && (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="Código QR" className="w-[200px] h-[200px]" />
                </div>
              )}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2">Produto</th>
                    <th className="text-right py-1 px-2">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {qrShipment.lines.map((line) => (
                    <tr key={line._id} className="border-b">
                      <td className="py-1 px-2">{line.product?.name ?? "—"}</td>
                      <td className="text-right py-1 px-2">
                        {line.qty} {line.product?.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {qrShipment.notes && (
                <p className="text-sm"><strong>Obs:</strong> {qrShipment.notes}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrShipment(null)}>
              Fechar
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Estoque do Armazém</CardTitle>
          <CardDescription>Posição atual calculada a partir do histórico de eventos</CardDescription>
        </CardHeader>
        <CardContent>
          {!stock ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : stock.length === 0 ? (
            <p className="text-muted-foreground">Armazém vazio</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Custo Médio</TableHead>
                  <TableHead>Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell className="font-medium">
                      {item.product?.name ?? "Produto não encontrado"}
                    </TableCell>
                    <TableCell>
                      {item.qtyOnHand} {item.product?.unit}
                    </TableCell>
                    <TableCell>
                      {item.avgCost > 0 ? `R$ ${item.avgCost.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>
                      {item.totalValue > 0 ? `R$ ${item.totalValue.toFixed(2)}` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
