import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
  useMutation,
} from "convex/react";
import {
  ClipboardList,
  Check,
  X,
  PackageCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/estoque/solicitacoes")({
  component: SolicitacoesPage,
});

function SolicitacoesPage() {
  return (
    <>
      <Authenticated>
        <SolicitacoesContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

const STATUS_LABELS: Record<string, string> = {
  Pendente: "Pendente",
  Aprovado: "Aprovado",
  Rejeitado: "Rejeitado",
  Convertido: "Convertido em Remessa",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Pendente: "outline",
  Aprovado: "default",
  Rejeitado: "destructive",
  Convertido: "secondary",
};

const URGENCY_LABELS: Record<string, string> = {
  normal: "Normal",
  urgente: "Urgente",
  critico: "Crítico",
};

const URGENCY_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  normal: "outline",
  urgente: "secondary",
  critico: "destructive",
};

function SolicitacoesContent() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const requests = useQuery(
    api.materialRequests.list,
    statusFilter ? { status: statusFilter } : {}
  );

  const approveMutation = useMutation(api.materialRequests.approve);
  const rejectMutation = useMutation(api.materialRequests.reject);
  const convertMutation = useMutation(api.materialRequests.convertToShipment);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveDialog, setApproveDialog] = useState<any | null>(null);
  const [rejectDialog, setRejectDialog] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [lineEdits, setLineEdits] = useState<
    { lineId: string; approvedQty: number }[]
  >([]);

  const openApproveDialog = (request: any) => {
    setApproveDialog(request);
    setApproveNotes("");
    setLineEdits(
      request.lines.map((l: any) => ({
        lineId: l._id,
        approvedQty: l.qty,
      }))
    );
  };

  const handleApprove = async () => {
    if (!approveDialog) return;
    try {
      await approveMutation({
        requestId: approveDialog._id as Id<"materialRequests">,
        reviewNotes: approveNotes || undefined,
        lineEdits: lineEdits.map((e) => ({
          lineId: e.lineId as Id<"materialRequestLines">,
          approvedQty: e.approvedQty,
        })),
      });
      toast.success("Solicitação aprovada");
      setApproveDialog(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar");
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    if (!rejectReason.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    try {
      await rejectMutation({
        requestId: rejectDialog._id as Id<"materialRequests">,
        reviewNotes: rejectReason,
      });
      toast.success("Solicitação rejeitada");
      setRejectDialog(null);
      setRejectReason("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao rejeitar");
    }
  };

  const handleConvert = async (requestId: string) => {
    if (
      !confirm(
        "Converter esta solicitação em remessa? O estoque será deduzido imediatamente."
      )
    )
      return;
    try {
      await convertMutation({
        requestId: requestId as Id<"materialRequests">,
      });
      toast.success("Remessa criada com sucesso a partir da solicitação");
    } catch (error: any) {
      toast.error(error.message || "Erro ao converter em remessa");
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("pt-BR");

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Solicitações de Material</h1>
        <p className="text-muted-foreground">
          Gerencie as solicitações enviadas pelos operadores
        </p>
      </div>

      <div className="flex gap-4 items-end">
        <div className="grid gap-1.5 min-w-[200px]">
          <Label className="text-xs">Filtrar por status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pendente">Pendente</SelectItem>
              <SelectItem value="Aprovado">Aprovado</SelectItem>
              <SelectItem value="Rejeitado">Rejeitado</SelectItem>
              <SelectItem value="Convertido">Convertido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {statusFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter("")}
          >
            Limpar
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Solicitações
          </CardTitle>
          <CardDescription>
            {requests
              ? `${requests.length} solicitação(ões)`
              : "Carregando..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!requests ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : requests.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma solicitação encontrada
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Status</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Urgência</TableHead>
                  <TableHead>Necessário até</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req: any) => (
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
                          variant={STATUS_VARIANTS[req.status] ?? "outline"}
                        >
                          {STATUS_LABELS[req.status] ?? req.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{req.requesterName}</TableCell>
                      <TableCell>{req.site?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            URGENCY_VARIANTS[req.urgency] ?? "outline"
                          }
                        >
                          {URGENCY_LABELS[req.urgency] ?? req.urgency}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(req.dateNeeded)}</TableCell>
                      <TableCell>{formatDate(req.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {req.status === "Pendente" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => openApproveDialog(req)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setRejectDialog(req);
                                  setRejectReason("");
                                }}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Rejeitar
                              </Button>
                            </>
                          )}
                          {req.status === "Aprovado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConvert(req._id)}
                            >
                              <PackageCheck className="h-4 w-4 mr-1" />
                              Converter em Remessa
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === req._id && (
                      <TableRow key={`${req._id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/50 p-0">
                          <div className="p-3 space-y-3">
                            <div>
                              <p className="text-sm font-medium">Motivo:</p>
                              <p className="text-sm text-muted-foreground">
                                {req.reason}
                              </p>
                            </div>
                            {req.reviewNotes && (
                              <div>
                                <p className="text-sm font-medium">
                                  Notas da revisão ({req.reviewerName}):
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {req.reviewNotes}
                                </p>
                              </div>
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Qtd Solicitada</TableHead>
                                  <TableHead>Qtd Aprovada</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {req.lines.map((line: any) => (
                                  <TableRow key={line._id}>
                                    <TableCell className="font-medium">
                                      {line.product?.name ??
                                        "Produto removido"}
                                    </TableCell>
                                    <TableCell>
                                      {line.qty} {line.product?.unit}
                                    </TableCell>
                                    <TableCell>
                                      {line.approvedQty != null
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

      <Dialog
        open={!!approveDialog}
        onOpenChange={(open) => !open && setApproveDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aprovar Solicitação</DialogTitle>
            <DialogDescription>
              Revise e edite as quantidades antes de aprovar
            </DialogDescription>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Solicitante:</strong>{" "}
                  {approveDialog.requesterName}
                </p>
                <p className="text-sm">
                  <strong>Motivo:</strong> {approveDialog.reason}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Solicitado</TableHead>
                    <TableHead>Aprovar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approveDialog.lines.map((line: any, idx: number) => (
                    <TableRow key={line._id}>
                      <TableCell className="font-medium">
                        {line.product?.name}
                      </TableCell>
                      <TableCell>
                        {line.qty} {line.product?.unit}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={lineEdits[idx]?.approvedQty ?? line.qty}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setLineEdits((prev) =>
                              prev.map((le, i) =>
                                i === idx
                                  ? { ...le, approvedQty: val }
                                  : le
                              )
                            );
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Observações (opcional)
                </Label>
                <Input
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Notas da aprovação"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveDialog(null)}
            >
              Cancelar
            </Button>
            <Button onClick={handleApprove}>Confirmar Aprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectDialog}
        onOpenChange={(open) => !open && setRejectDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Motivo da rejeição</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explique o motivo"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog(null)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
