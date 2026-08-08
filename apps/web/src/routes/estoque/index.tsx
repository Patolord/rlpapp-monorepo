import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDateTime } from "@rlpapp/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Building2,
  CheckCircle2,
  History,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { InventoryAddressDialog } from "@/components/estoque/inventory-address-dialog";
import { InventoryApprovals } from "@/components/estoque/inventory-approvals";
import { InventoryMovementDialog } from "@/components/estoque/inventory-movement-dialog";
import { InventoryRules } from "@/components/estoque/inventory-rules";
import { StockHealthBadge } from "@/components/compras/material-replenishment-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/estoque/")({
  component: EstoquePage,
});

type Section =
  | "central"
  | "obras"
  | "movimentacoes"
  | "aprovacoes"
  | "regras";

const MOVEMENT_LABELS: Record<string, string> = {
  entry: "Entrada",
  transfer: "Envio para obra",
  consumption: "Consumo",
  return: "Retorno",
  adjustment: "Ajuste",
  reversal: "Estorno",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Exceção aprovada",
  posted: "Concluída",
  rejected: "Rejeitada",
  reversed: "Estornada",
};

function EstoquePage() {
  return (
    <AuthShell>
      <EstoqueContent />
    </AuthShell>
  );
}

function EstoqueContent() {
  const access = useQuery(api.inventory.getAccess, {});
  const materials = useQuery(api.inventory.listMaterialOptions, {});
  const projects = useQuery(api.inventory.listProjects, {});
  const summaries = useQuery(api.inventory.listProjectSummaries, {});
  const approvals = useQuery(api.inventory.listPendingApprovals, {});
  const rules = useQuery(api.inventory.listRules, {});
  const centralBalances = usePaginatedQuery(
    api.inventory.listBalances,
    access?.canViewCentral ? {} : "skip",
    { initialNumItems: 100 }
  );
  const documents = usePaginatedQuery(
    api.inventory.listDocuments,
    {},
    { initialNumItems: 20 }
  );
  const postDocument = useMutation(api.inventory.postDocument);
  const reverseDocument = useMutation(api.inventory.reverseDocument);

  const [section, setSection] = useState<Section>("central");
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [reversalDocumentId, setReversalDocumentId] =
    useState<Id<"inventoryDocuments"> | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const projectBalances = usePaginatedQuery(
    api.inventory.listBalances,
    selectedProjectId
      ? { projectId: selectedProjectId as Id<"projects"> }
      : "skip",
    { initialNumItems: 100 }
  );

  const filteredCentralBalances = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return centralBalances.results;
    return centralBalances.results.filter(
      (balance) =>
        balance.materialName.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.materialSku?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.category?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.physicalAddress?.toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [centralBalances.results, search]);

  useEffect(() => {
    if (access && !access.canViewCentral && section === "central") {
      setSection("obras");
    }
  }, [access, section]);

  if (
    !access ||
    !materials ||
    !projects ||
    !summaries ||
    !approvals ||
    !rules
  ) {
    return (
      <div className="mx-auto max-w-7xl py-16 text-center text-sm text-muted-foreground">
        Carregando estoque...
      </div>
    );
  }

  const inventoryAccess = access;
  const sections: Array<{ key: Section; label: string; icon: typeof Package }> = [
    ...(access.canViewCentral
      ? [{ key: "central" as const, label: "Central", icon: Warehouse }]
      : []),
    { key: "obras", label: "Obras", icon: Building2 },
    { key: "movimentacoes", label: "Movimentações", icon: History },
    ...(access.isEngineer
      ? [{ key: "aprovacoes" as const, label: "Aprovações", icon: ShieldAlert }]
      : []),
    { key: "regras", label: "Regras", icon: CheckCircle2 },
  ];

  async function post(documentId: Id<"inventoryDocuments">) {
    setSubmittingId(documentId);
    try {
      await postDocument({ documentId });
      toast.success("Movimentação concluída");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao concluir movimentação"));
    } finally {
      setSubmittingId(null);
    }
  }

  async function reverse() {
    if (!reversalDocumentId || !reversalReason.trim()) {
      toast.error("Informe o motivo do estorno");
      return;
    }
    setSubmittingId(reversalDocumentId);
    try {
      await reverseDocument({
        documentId: reversalDocumentId,
        reason: reversalReason,
      });
      toast.success("Movimentação estornada");
      setReversalDocumentId(null);
      setReversalReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao estornar movimentação"));
    } finally {
      setSubmittingId(null);
    }
  }

  function canPostDocument(type: string): boolean {
    if (inventoryAccess.canWriteCentral) return true;
    if (type === "entry") return inventoryAccess.canCreateEntry;
    return (
      type === "consumption" &&
      inventoryAccess.canCreateProjectMovement
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Controle do estoque central e dos materiais enviados às obras.
          </p>
        </div>
        <InventoryMovementDialog
          access={access}
          materials={materials}
          projects={projects}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Package}
          label="Materiais no central"
          value={String(
            centralBalances.results.filter((balance) => balance.quantity > 0)
              .length
          )}
        />
        <MetricCard
          icon={Building2}
          label="Obras monitoradas"
          value={String(
            summaries.filter((summary) => summary.materialCount > 0).length
          )}
        />
        <MetricCard
          icon={History}
          label="Movimentações carregadas"
          value={String(documents.results.length)}
        />
        <MetricCard
          icon={ShieldAlert}
          label="Suas aprovações pendentes"
          value={String(approvals.length)}
        />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
        {sections.map((item) => (
          <Button
            key={item.key}
            variant={section === item.key ? "default" : "ghost"}
            size="sm"
            className="shrink-0"
            onClick={() => setSection(item.key)}
          >
            <item.icon className="mr-1.5 size-4" />
            {item.label}
          </Button>
        ))}
      </div>

      {section === "central" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Estoque central</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Saldos e endereço físico de cada material.
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar material ou localização"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {centralBalances.status === "LoadingFirstPage" ? (
              <LoadingMessage />
            ) : filteredCentralBalances.length === 0 ? (
              <EmptyMessage text="Nenhum material no estoque central." />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Saúde</TableHead>
                      <TableHead>Localização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCentralBalances.map((balance) => (
                      <TableRow key={balance._id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{balance.materialName}</p>
                            {balance.materialSku && (
                              <p className="text-xs text-muted-foreground">
                                {balance.materialSku}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{balance.category ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {balance.quantity} {balance.unit ?? ""}
                        </TableCell>
                        <TableCell>
                          <StockHealthBadge
                            state={balance.replenishmentState}
                            suggestedOrderQuantity={
                              balance.suggestedOrderQuantity
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {access.canWriteCentral ? (
                            <InventoryAddressDialog
                              balanceId={balance._id}
                              materialName={balance.materialName}
                              currentAddress={balance.physicalAddress}
                            />
                          ) : (
                            balance.physicalAddress ?? "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {centralBalances.status === "CanLoadMore" && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => centralBalances.loadMore(100)}
                    >
                      Carregar mais
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {section === "obras" && (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3">
            {summaries.map((summary) => (
              <button
                type="button"
                key={summary.projectId}
                onClick={() => setSelectedProjectId(summary.projectId)}
                className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-primary/40 ${
                  selectedProjectId === summary.projectId
                    ? "border-primary ring-1 ring-primary/20"
                    : ""
                }`}
              >
                <p className="font-semibold">{summary.projectName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.materialCount} material(is) com saldo
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    {summary.transferCount} envios
                  </Badge>
                  <Badge variant="secondary">
                    {summary.consumptionCount} consumos
                  </Badge>
                  <Badge variant="secondary">
                    {summary.returnCount} retornos
                  </Badge>
                </div>
              </button>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                {summaries.find(
                  (summary) => summary.projectId === selectedProjectId
                )?.projectName ?? "Selecione uma obra"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedProjectId ? (
                <EmptyMessage text="Selecione uma obra para consultar o saldo." />
              ) : projectBalances.status === "LoadingFirstPage" ? (
                <LoadingMessage />
              ) : projectBalances.results.length === 0 ? (
                <EmptyMessage text="Esta obra ainda não possui materiais." />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Disponível</TableHead>
                        <TableHead>Saúde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectBalances.results.map((balance) => (
                        <TableRow key={balance._id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{balance.materialName}</p>
                              {balance.materialSku && (
                                <p className="text-xs text-muted-foreground">
                                  {balance.materialSku}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{balance.category ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {balance.quantity} {balance.unit ?? ""}
                          </TableCell>
                          <TableCell>
                            <StockHealthBadge
                              state={balance.replenishmentState}
                              suggestedOrderQuantity={
                                balance.suggestedOrderQuantity
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {projectBalances.status === "CanLoadMore" && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => projectBalances.loadMore(100)}
                      >
                        Carregar mais
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {section === "movimentacoes" && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.status === "LoadingFirstPage" ? (
              <LoadingMessage />
            ) : documents.results.length === 0 ? (
              <EmptyMessage text="Nenhuma movimentação registrada." />
            ) : (
              <div className="space-y-3">
                {documents.results.map((document) => (
                  <div key={document._id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {MOVEMENT_LABELS[document.type] ?? document.type}
                          </p>
                          <Badge
                            variant={
                              document.status === "rejected"
                                ? "destructive"
                                : document.status === "posted"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {STATUS_LABELS[document.status] ?? document.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {document.projectName ?? "Estoque central"} •{" "}
                          {formatDateTime(document.createdAt)} •{" "}
                          {document.createdByName}
                        </p>
                        {document.reference && (
                          <p className="mt-1 text-sm">
                            Referência: {document.reference}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(document.status === "draft" ||
                          document.status === "approved") &&
                          canPostDocument(document.type) && (
                            <Button
                              size="sm"
                              disabled={submittingId === document._id}
                              onClick={() => void post(document._id)}
                            >
                              Concluir
                            </Button>
                          )}
                        {document.status === "posted" &&
                          access.canWriteCentral && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReversalDocumentId(document._id);
                                setReversalReason("");
                              }}
                            >
                              <RotateCcw className="mr-1 size-4" />
                              Estornar
                            </Button>
                          )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {document.items.map((item) => (
                        <Badge key={item._id} variant="outline">
                          {item.materialName}: {item.quantity}
                        </Badge>
                      ))}
                    </div>
                    {document.compatibilityIssues.length > 0 && (
                      <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        {document.compatibilityIssues.length} incompatibilidade(s)
                        detectada(s).
                      </div>
                    )}
                  </div>
                ))}
                {documents.status === "CanLoadMore" && (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={() => documents.loadMore(20)}
                    >
                      Carregar mais
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {section === "aprovacoes" && (
        <InventoryApprovals approvals={approvals} />
      )}

      {section === "regras" && (
        <InventoryRules
          rules={rules}
          materials={materials}
          canConfigure={access.canConfigureRules}
        />
      )}

      <Dialog
        open={reversalDocumentId !== null}
        onOpenChange={(open) => {
          if (!open) setReversalDocumentId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar movimentação</DialogTitle>
            <DialogDescription>
              O histórico original será preservado e eventos compensatórios
              serão criados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              value={reversalReason}
              onChange={(event) => setReversalReason(event.target.value)}
              placeholder="Informe por que a movimentação deve ser estornada"
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={submittingId === reversalDocumentId}
              onClick={() => void reverse()}
            >
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingMessage() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Carregando...
    </p>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>
  );
}
