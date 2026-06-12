import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import {
  ScanLine,
  PackageCheck,
  Send,
  ClipboardList,
  QrCode,
  Check,
  Plus,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuthShell } from "@/components/auth-shell";
import { getErrorMessage } from "@/lib/errors";

import type { Html5Qrcode } from "html5-qrcode";
import type { FunctionReturnType } from "convex/server";
import { MATERIAL_REQUEST_STATUS_LABELS, MATERIAL_REQUEST_STATUS_VARIANTS, formatDate, formatDateTime } from "@rlpapp/shared";

// Payload do QR gerado em shipments.createShipment
type ScannedShipment = {
  shipmentId: string;
  toSiteId: string;
  siteName: string;
  products: { name: string; qty: number; unit: string }[];
  createdAt: number;
};

type Shipment = FunctionReturnType<typeof api.shipments.listByStatus>[number];

export const Route = createFileRoute("/estoque/operador")({
  component: OperadorPage,
});

function OperadorPage() {
  return (
    <AuthShell>
      <OperadorContent />
    </AuthShell>
  );
}

type Tab = "receber" | "enviar" | "solicitar";

const TABS: { key: Tab; label: string; icon: typeof ScanLine }[] = [
  { key: "receber", label: "Receber", icon: ScanLine },
  { key: "enviar", label: "Enviar", icon: Send },
  { key: "solicitar", label: "Solicitar", icon: ClipboardList },
];

function OperadorContent() {
  const [activeTab, setActiveTab] = useState<Tab>("receber");

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Painel do Operador</h1>
        <p className="text-muted-foreground">
          Receba, envie e solicite materiais
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "receber" && <ReceberTab />}
      {activeTab === "enviar" && <EnviarTab />}
      {activeTab === "solicitar" && <SolicitarTab />}
    </div>
  );
}

function ReceberTab() {
  const pendingShipments = useQuery(api.shipments.listByStatus, {
    status: "PendingShipment",
  });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const confirmFromQR = useMutation(api.deliveryConfirmations.confirmFromQR);

  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedShipment | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScanning(true);

    await new Promise((r) => setTimeout(r, 100));

    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          try {
            const data = JSON.parse(decodedText);
            if (data.shipmentId) {
              setScannedData(data);
              void stopScanner();
            }
          } catch {
            toast.error("Código QR inválido");
          }
        },
        () => {}
      );
    } catch (err) {
      toast.error("Não foi possível acessar a câmera");
      setScanning(false);
    }
  }, [stopScanner]);

  const handleConfirm = async () => {
    if (!scannedData) return;
    if (!selectedSiteId) {
      toast.error("Selecione a obra onde está recebendo");
      return;
    }
    if (!receiverName.trim()) {
      toast.error("Informe o nome de quem está recebendo");
      return;
    }
    try {
      await confirmFromQR({
        shipmentId: scannedData.shipmentId as Id<"shipments">,
        receivedAtSiteId: selectedSiteId as Id<"sites">,
        receiverName: receiverName.trim(),
        notes: confirmNotes || undefined,
      });
      toast.success("Entrega confirmada com sucesso");
      setScannedData(null);
      setReceiverName("");
      setSelectedSiteId("");
      setConfirmNotes("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao confirmar entrega"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Escanear código QR
          </CardTitle>
          <CardDescription>
            Escaneie o código QR enviado junto com os materiais para confirmar
            o recebimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!scanning && !scannedData && (
            <Button onClick={startScanner}>
              <QrCode className="h-4 w-4 mr-2" />
              Abrir Câmera
            </Button>
          )}

          {scanning && (
            <div className="space-y-2">
              <div
                ref={scannerContainerRef}
                id="qr-reader"
                className="w-full max-w-sm mx-auto rounded-lg overflow-hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={stopScanner}
              >
                Cancelar
              </Button>
            </div>
          )}

          {scannedData && (
            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold">Dados da Remessa</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>
                  <strong>Destino:</strong> {scannedData.siteName}
                </p>
                <p>
                  <strong>Data:</strong>{" "}
                  {formatDateTime(scannedData.createdAt)}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scannedData.products?.map((p, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          {p.qty} {p.unit}
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Obra onde está recebendo</Label>
                  <Select
                    value={selectedSiteId}
                    onValueChange={(v) => setSelectedSiteId(v ?? "")}
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
                <div className="grid gap-1.5">
                  <Label>Nome de quem está recebendo</Label>
                  <Input
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Observações (opcional)</Label>
                  <Input
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    placeholder="Notas adicionais"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleConfirm}>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Recebimento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setScannedData(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remessas Pendentes</CardTitle>
          <CardDescription>
            Remessas aguardando confirmação de entrega
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingShipments ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : pendingShipments.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma remessa pendente
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingShipments.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-medium">
                      {s.site?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {s.lines.length} produto(s)
                    </TableCell>
                    <TableCell>{formatDateTime(s.createdAt)}</TableCell>
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

function EnviarTab() {
  const readyShipments = useQuery(api.shipments.listByStatus, {
    status: "RegisteredOut",
  });
  const stageShipment = useMutation(api.shipments.stageShipment);

  const [qrShipment, setQrShipment] = useState<Shipment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!qrShipment?.qrCodeData) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrShipment.qrCodeData, {
      width: 200,
      margin: 2,
    }).then((url: string) => setQrDataUrl(url), () => setQrDataUrl(""));
  }, [qrShipment]);

  const handleStage = async (shipmentId: Id<"shipments">) => {
    try {
      await stageShipment({ shipmentId });
      toast.success("Remessa marcada como aguardando envio");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao preparar remessa"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Remessas Prontas para Envio
          </CardTitle>
          <CardDescription>
            Remessas com saída registrada, prontas para preparar e enviar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!readyShipments ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : readyShipments.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma remessa pronta para envio
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyShipments.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-medium">
                      {s.site?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {s.lines.length} produto(s)
                    </TableCell>
                    <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStage(s._id)}
                        >
                          <PackageCheck className="h-4 w-4 mr-1" />
                          Preparar
                        </Button>
                        {s.qrCodeData && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setQrShipment(s)}
                          >
                            <QrCode className="h-4 w-4 mr-1" />
                            QR
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!qrShipment}
        onOpenChange={(open) => !open && setQrShipment(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Código QR da remessa</DialogTitle>
          </DialogHeader>
          {qrShipment && (
            <div className="space-y-4 text-center">
              <p className="text-sm">
                Destino: <strong>{qrShipment.site?.name}</strong>
              </p>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Código QR"
                  className="w-[200px] h-[200px] mx-auto"
                />
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qrShipment.lines.map((line) => (
                    <TableRow key={line._id}>
                      <TableCell>{line.product?.name}</TableCell>
                      <TableCell className="text-right">
                        {line.qty} {line.product?.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setQrShipment(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SolicitarTab() {
  const products = useQuery(api.products.list, { onlyActive: true });
  const sites = useQuery(api.sites.list, { onlyActive: true });
  const myRequests = useQuery(api.materialRequests.listByUser);
  const createRequest = useMutation(api.materialRequests.create);

  const [form, setForm] = useState({
    siteId: "",
    reason: "",
    urgency: "normal" as "normal" | "urgente" | "critico",
    dateNeeded: "",
    lines: [{ productId: "", qty: 1 }] as { productId: string; qty: number }[],
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setForm({
      siteId: "",
      reason: "",
      urgency: "normal",
      dateNeeded: "",
      lines: [{ productId: "", qty: 1 }],
    });
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", qty: 1 }],
    }));
  };

  const removeLine = (idx: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== idx),
    }));
  };

  const updateLine = (
    idx: number,
    field: "productId" | "qty",
    value: string | number
  ) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) =>
        i === idx ? { ...l, [field]: value } : l
      ),
    }));
  };

  const handleSubmit = async () => {
    if (!form.siteId) {
      toast.error("Selecione a obra");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Informe o motivo da solicitação");
      return;
    }
    if (!form.dateNeeded) {
      toast.error("Informe a data necessária");
      return;
    }
    const validLines = form.lines.filter((l) => l.productId);
    if (validLines.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }

    try {
      await createRequest({
        siteId: form.siteId as Id<"sites">,
        reason: form.reason,
        urgency: form.urgency,
        dateNeeded: new Date(form.dateNeeded).getTime(),
        lines: validLines.map((l) => ({
          productId: l.productId as Id<"products">,
          qty: l.qty,
        })),
      });
      toast.success("Solicitação enviada com sucesso");
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao enviar solicitação"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Nova Solicitação de Material
          </CardTitle>
          <CardDescription>
            Solicite materiais ao administrador informando o motivo e a
            urgência
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Obra</Label>
              <Select
                value={form.siteId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, siteId: v ?? "" }))
                }
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
            <div className="grid gap-1.5">
              <Label>Urgência</Label>
              <Select
                value={form.urgency}
                onValueChange={(v) =>
                  v && setForm((f) => ({
                    ...f,
                    urgency: v as "normal" | "urgente" | "critico",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Padrão</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Data necessária</Label>
            <Input
              type="date"
              value={form.dateNeeded}
              onChange={(e) =>
                setForm((f) => ({ ...f, dateNeeded: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Motivo / Justificativa</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="Explique porque precisa destes materiais"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Produtos</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Produto
              </Button>
            </div>
            {form.lines.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_100px_32px] gap-2 items-end"
              >
                <div className="grid gap-1">
                  {i === 0 && (
                    <Label className="text-xs">Produto</Label>
                  )}
                  <Select
                    value={line.productId}
                    onValueChange={(v) => updateLine(i, "productId", v ?? "")}
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
                  {i === 0 && <Label className="text-xs">Quantidade</Label>}
                  <Input
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(e) =>
                      updateLine(i, "qty", Number(e.target.value))
                    }
                  />
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

          <Button onClick={handleSubmit} className="w-full sm:w-auto">
            Enviar Solicitação
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minhas Solicitações</CardTitle>
          <CardDescription>
            Acompanhe o status das suas solicitações
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!myRequests ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : myRequests.length === 0 ? (
            <p className="text-muted-foreground">
              Você ainda não fez solicitações
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Situação</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Urgência</TableHead>
                  <TableHead>Necessário até</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.map((req) => (
                  <>
                    <TableRow
                      key={req._id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(
                          expandedId === req._id ? null : req._id
                        )
                      }
                    >
                      <TableCell>
                        {expandedId === req._id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            MATERIAL_REQUEST_STATUS_VARIANTS[req.status] ?? "outline"
                          }
                        >
                          {MATERIAL_REQUEST_STATUS_LABELS[req.status] ?? req.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {req.site?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.urgency === "critico"
                              ? "destructive"
                              : req.urgency === "urgente"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {req.urgency === "normal"
                            ? "Padrão"
                            : req.urgency === "urgente"
                              ? "Urgente"
                              : "Crítico"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDate(req.dateNeeded)}
                      </TableCell>
                      <TableCell>
                        {formatDate(req.createdAt)}
                      </TableCell>
                    </TableRow>
                    {expandedId === req._id && (
                      <TableRow key={`${req._id}-detail`}>
                        <TableCell
                          colSpan={6}
                          className="bg-muted/50 p-0"
                        >
                          <div className="p-3 space-y-2">
                            <p className="text-sm">
                              <strong>Motivo:</strong>{" "}
                              {req.reason}
                            </p>
                            {req.reviewNotes && (
                              <p className="text-sm">
                                <strong>Resposta:</strong>{" "}
                                {req.reviewNotes}
                              </p>
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Solicitado</TableHead>
                                  <TableHead>Aprovado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {req.lines.map((line) => (
                                  <TableRow key={line._id}>
                                    <TableCell>
                                      {line.product?.name ??
                                        "—"}
                                    </TableCell>
                                    <TableCell>
                                      {line.qty}{" "}
                                      {line.product?.unit}
                                    </TableCell>
                                    <TableCell>
                                      {line.approvedQty !=
                                      null
                                        ? `${line.approvedQty} ${line.product?.unit}`
                                        : "—"}
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
