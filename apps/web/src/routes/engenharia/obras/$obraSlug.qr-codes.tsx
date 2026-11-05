import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ClipboardList,
  History,
  Loader2,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { EquipmentStatusKey } from "@rlpapp/ui/tokens";

import { AuthShell } from "@/components/auth-shell";
import { PendingBanner } from "@/components/campo/pending-records";
import {
  GenerateQrBatchDialog,
  type CreatedQrBatch,
} from "@/components/engenharia/generate-qr-batch-dialog";
import { ProjectServicesList } from "@/components/engenharia/project-services-list";
import { ProjectShell, type ProjectOverview } from "@/components/engenharia/project-shell";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { getErrorMessage } from "@/lib/errors";
import { printQrCodes } from "@/lib/qr-print";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/qr-codes")({
  component: QrCodesPage,
});

function QrCodesPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <QrCodesContent
            projectId={projectId as Id<"projects">}
            project={project}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}

const ALL = "all";
// Valor do filtro de lote para etiquetas legadas sem lote.
const NO_BATCH = "__sem_lote__";

// "Cadastrada" = etiqueta já vinculada a um equipamento (bipada em campo);
// "Livre" = etiqueta do lote da obra ainda sem equipamento.
type RegistrationFilter = "all" | "registered" | "free";
type Tab = "labels" | "services";

type QrRow = FunctionReturnType<typeof api.qrCodes.listByProject>[number];

type BatchSummary = {
  batchId: string;
  batchName: string | null;
  createdAt: number;
  count: number;
};

function QrCodesContent({
  projectId,
  project,
}: {
  projectId: Id<"projects">;
  project: ProjectOverview;
}) {
  const rows = useQuery(api.qrCodes.listByProject, { projectId });
  // null quando o usuário não tem engenharia.read: a aba de serviços fica oculta.
  const activityUsers = useQuery(api.technicianActivity.listActivityUsers);
  const removeQrCode = useMutation(api.qrCodes.remove);
  const removeManyQrCodes = useMutation(api.qrCodes.removeMany);
  const canViewServices = Boolean(activityUsers);
  const [tab, setTab] = useState<Tab>("labels");
  const [search, setSearch] = useState("");
  const [registration, setRegistration] = useState<RegistrationFilter>("all");
  const [status, setStatus] = useState(ALL);
  const [batchFilter, setBatchFilter] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deletingToken, setDeletingToken] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Trocar de lote ou de situação limpa a seleção: evita agir sobre etiquetas
  // que saíram da tela.
  function changeBatchFilter(value: string) {
    setBatchFilter(value);
    setSelected(new Set());
  }
  function changeRegistration(value: RegistrationFilter) {
    setRegistration(value);
    setSelected(new Set());
  }
  function changeStatus(value: string) {
    setStatus(value);
    setSelected(new Set());
  }

  // Lote recém-gerado: mostra só ele, já selecionado para imprimir/revisar.
  function handleBatchCreated(batch: CreatedQrBatch) {
    setSearch("");
    setRegistration("all");
    setStatus(ALL);
    setBatchFilter(batch.batchId);
    setSelected(new Set(batch.tokens));
  }

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  const registeredCount = useMemo(
    () => rows?.filter((r) => r.equipmentId).length ?? 0,
    [rows]
  );

  // Lotes da obra (mais recentes primeiro), para filtrar e reimprimir.
  const batches = useMemo<BatchSummary[]>(() => {
    if (!rows) return [];
    const byId = new Map<string, BatchSummary>();
    for (const row of rows) {
      if (!row.batchId) continue;
      const existing = byId.get(row.batchId);
      if (existing) {
        existing.count += 1;
        existing.createdAt = Math.min(existing.createdAt, row.createdAt);
      } else {
        byId.set(row.batchId, {
          batchId: row.batchId,
          batchName: row.batchName,
          createdAt: row.createdAt,
          count: 1,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [rows]);
  const hasRowsWithoutBatch = useMemo(
    () => rows?.some((r) => !r.batchId) ?? false,
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows
      .filter(
        (r) =>
          registration === "all" ||
          (registration === "registered") === Boolean(r.equipmentId)
      )
      .filter((r) => status === ALL || r.status === status)
      .filter((r) => {
        if (batchFilter === ALL) return true;
        if (batchFilter === NO_BATCH) return !r.batchId;
        return r.batchId === batchFilter;
      })
      .filter(
        (r) =>
          !term ||
          [
            r.token,
            r.description,
            r.ambiente,
            r.modelo,
            r.system,
            r.environmentName,
            r.batchName,
          ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))
      );
  }, [rows, search, registration, status, batchFilter]);

  // Ações em massa só alcançam etiquetas visíveis com os filtros atuais.
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.token)),
    [filtered, selected]
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.token));

  const toggleToken = useCallback((token: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }, []);

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filtered) next.delete(r.token);
      } else {
        for (const r of filtered) next.add(r.token);
      }
      return next;
    });
  }

  function printTokens(tokens: string[], title: string) {
    if (tokens.length === 0) return;
    printQrCodes({
      tokens,
      baseUrl,
      title: `${title} - ${project.name} - RLP Engenharia`,
    });
  }

  function handlePrintBatch(batch: BatchSummary) {
    const tokens = (rows ?? [])
      .filter((r) => r.batchId === batch.batchId)
      .map((r) => r.token);
    printTokens(tokens, `Códigos QR ${batch.batchName ?? batch.batchId}`);
  }

  async function handleDelete(row: QrRow) {
    if (row.equipmentId) {
      toast.error("Etiqueta cadastrada em campo não pode ser excluída");
      return;
    }
    if (!window.confirm(`Excluir a etiqueta ${row.token}?`)) return;
    setDeletingToken(row.token);
    try {
      await removeQrCode({ token: row.token });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.token);
        return next;
      });
      toast.success("Etiqueta excluída");
    } catch (err) {
      toast.error(getErrorMessage(err, "Erro ao excluir etiqueta"));
    } finally {
      setDeletingToken(null);
    }
  }

  async function handleBulkDelete() {
    const freeTokens = selectedRows
      .filter((r) => !r.equipmentId)
      .map((r) => r.token);
    if (freeTokens.length === 0) {
      toast.error("Nenhuma etiqueta livre selecionada para exclusão");
      return;
    }
    const linkedCount = selectedRows.length - freeTokens.length;
    const message =
      linkedCount > 0
        ? `Excluir ${freeTokens.length} etiqueta(s) livre(s)? ${linkedCount} cadastrada(s) em campo serão mantidas.`
        : `Excluir ${freeTokens.length} etiqueta(s) selecionada(s)?`;
    if (!window.confirm(message)) return;
    setBulkDeleting(true);
    try {
      const result = await removeManyQrCodes({ tokens: freeTokens });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const token of [...result.deleted, ...result.missing]) {
          next.delete(token);
        }
        return next;
      });
      if (result.deleted.length > 0) {
        toast.success(`${result.deleted.length} etiqueta(s) excluída(s)`);
      }
      if (result.blocked.length > 0) {
        toast.error(`${result.blocked.length} etiqueta(s) cadastrada(s) mantida(s)`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Erro ao excluir etiquetas"));
    } finally {
      setBulkDeleting(false);
    }
  }

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showServices = canViewServices && tab === "services";
  const registrationOptions: Array<{
    id: RegistrationFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: "Todas", count: rows.length },
    { id: "registered", label: "Cadastradas", count: registeredCount },
    { id: "free", label: "Livres", count: rows.length - registeredCount },
  ];
  const generateButton = (
    <Button size="sm" onClick={() => setGenerateOpen(true)}>
      <Plus />
      Gerar etiquetas
    </Button>
  );

  return (
    <section className="space-y-4">
      {/* Um só diálogo para os dois botões: a tela "Lote gerado" continua
          aberta mesmo quando a lista deixa de estar vazia. */}
      <GenerateQrBatchDialog
        projectId={projectId}
        projectName={project.name}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={handleBatchCreated}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {showServices ? "Serviços da obra" : "QR codes da obra"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {showServices
              ? "Registros enviados pelos técnicos em campo nesta obra."
              : `${rows.length} QR${rows.length === 1 ? "" : "s"} atribuído${
                  rows.length === 1 ? "" : "s"
                } de ${project.totalItems} equipamento${
                  project.totalItems === 1 ? "" : "s"
                } previsto${project.totalItems === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewServices && (
            <div className="grid w-fit grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  { id: "labels", label: "Etiquetas", icon: QrCode },
                  { id: "services", label: "Serviços", icon: History },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={tab === option.id}
                    onClick={() => setTab(option.id)}
                    className="flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* Histórico completo (todas as obras), antes acessível pela tela
              "Registro de campo" removida. */}
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/meus-registros" />}
          >
            <ClipboardList />
            Meus registros
          </Button>
          {!showServices && generateButton}
        </div>
      </div>

      {/* Registros feitos sem internet ainda não enviados; some com a fila vazia. */}
      <PendingBanner />

      {showServices ? (
        <ProjectServicesList
          projectId={projectId}
          activityUsers={activityUsers ?? []}
        />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <QrCode className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Nenhum QR code atribuído a esta obra</p>
          <p className="mx-auto mt-1 mb-4 max-w-md text-sm text-muted-foreground">
            Gere um lote de etiquetas livres para imprimir e cadastrar em campo,
            ou gere QR codes a partir dos equipamentos previstos (botão "Gerar
            QR" na hierarquia da obra).
          </p>
          {generateButton}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar token, lote, descrição, ambiente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {registrationOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={registration === option.id ? "default" : "outline"}
                  aria-pressed={registration === option.id}
                  onClick={() => changeRegistration(option.id)}
                >
                  {option.label}
                  <span className="ml-1 tabular-nums opacity-80">
                    ({option.count})
                  </span>
                </Button>
              ))}
            </div>
            <Select value={status} onValueChange={changeStatus}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                <SelectItem value="operational">Operacional</SelectItem>
                <SelectItem value="installing">Em instalação</SelectItem>
                <SelectItem value="warning">Alerta</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
            {(batches.length > 0 || hasRowsWithoutBatch) && (
              <Select value={batchFilter} onValueChange={changeBatchFilter}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="Lote" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os lotes</SelectItem>
                  {batches.map((batch) => (
                    <SelectItem key={batch.batchId} value={batch.batchId}>
                      {batch.batchName ?? batch.batchId} ({batch.count})
                    </SelectItem>
                  ))}
                  {hasRowsWithoutBatch && (
                    <SelectItem value={NO_BATCH}>Sem lote</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Lotes recentes: reimpressão em um clique. */}
          {batches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Lotes:</span>
              {batches.slice(0, 6).map((batch) => (
                <div
                  key={batch.batchId}
                  className="flex items-center overflow-hidden rounded-md border"
                >
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent ${
                      batchFilter === batch.batchId ? "bg-muted" : ""
                    }`}
                    onClick={() =>
                      changeBatchFilter(
                        batchFilter === batch.batchId ? ALL : batch.batchId
                      )
                    }
                    title={new Date(batch.createdAt).toLocaleString("pt-BR")}
                  >
                    {batch.batchName ?? batch.batchId}
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      ({batch.count})
                    </span>
                  </button>
                  <button
                    type="button"
                    className="border-l px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={`Imprimir lote ${batch.batchName ?? batch.batchId}`}
                    aria-label={`Imprimir lote ${batch.batchName ?? batch.batchId}`}
                    onClick={() => handlePrintBatch(batch)}
                  >
                    <Printer className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedRows.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3 sm:flex-row sm:items-center">
              <span className="text-sm font-medium">
                {selectedRows.length} selecionada
                {selectedRows.length === 1 ? "" : "s"}
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                <X />
                Limpar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  printTokens(
                    selectedRows.map((r) => r.token),
                    "Códigos QR selecionados"
                  )
                }
              >
                <Printer />
                Imprimir selecionadas
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
              >
                {bulkDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Excluir livres
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label={
                          allFilteredSelected
                            ? "Desmarcar etiquetas listadas"
                            : "Selecionar etiquetas listadas"
                        }
                        checked={allFilteredSelected}
                        disabled={filtered.length === 0}
                        onCheckedChange={toggleAllFiltered}
                      />
                    </TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhum QR corresponde aos filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow
                        key={r._id}
                        data-state={selected.has(r.token) ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Selecionar etiqueta ${r.token}`}
                            checked={selected.has(r.token)}
                            onCheckedChange={() => toggleToken(r.token)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/engenharia/qr/$token"
                            params={{ token: r.token }}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {r.token}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <LocationCell
                            towerName={r.towerName}
                            floorLabel={r.floorLabel}
                            environmentName={r.environmentName}
                            ambiente={r.ambiente}
                          />
                        </TableCell>
                        <TableCell>
                          <EquipmentCell row={r} />
                        </TableCell>
                        <TableCell>
                          {r.status ? (
                            <StatusBadge
                              status={r.status as EquipmentStatusKey}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.batchName ?? r.batchId ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Imprimir etiqueta"
                              aria-label={`Imprimir etiqueta ${r.token}`}
                              onClick={() =>
                                printTokens([r.token], `Código QR ${r.token}`)
                              }
                            >
                              <Printer />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={!!r.equipmentId || deletingToken === r.token}
                              title={
                                r.equipmentId
                                  ? "Etiqueta cadastrada em campo não pode ser excluída"
                                  : "Excluir etiqueta"
                              }
                              aria-label={`Excluir etiqueta ${r.token}`}
                              onClick={() => handleDelete(r)}
                            >
                              {deletingToken === r.token ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function EquipmentCell({ row }: { row: QrRow }) {
  if (row.plannedItemId) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.system ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[row.modelo, row.capacidade].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {row.kind && (
          <Badge variant="outline" className="shrink-0">
            {row.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
          </Badge>
        )}
      </div>
    );
  }
  // Cadastrada em campo sem item planejado: a descrição do técnico é o nome.
  if (row.equipmentId) {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium">
          {row.description || "Cadastrado em campo"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Sem item planejado
        </p>
      </div>
    );
  }
  return <span className="text-muted-foreground">Etiqueta livre</span>;
}

function LocationCell({
  towerName,
  floorLabel,
  environmentName,
  ambiente,
}: {
  towerName: string | null;
  floorLabel: string | null;
  environmentName: string | null;
  ambiente: string | null;
}) {
  const parts = [towerName, floorLabel, environmentName].filter(
    (p): p is string => Boolean(p)
  );
  if (parts.length > 0) {
    return <span>{parts.join(" · ")}</span>;
  }
  // Itens legados sem hierarquia: mostra o texto livre do ambiente.
  if (ambiente) {
    return <span className="text-muted-foreground">{ambiente}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}
