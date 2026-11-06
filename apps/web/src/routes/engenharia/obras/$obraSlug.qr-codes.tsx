import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ClipboardList, History, Loader2, Plus, QrCode } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { PendingBanner } from "@/components/campo/pending-records";
import {
  GenerateQrBatchDialog,
  type CreatedQrBatch,
} from "@/components/engenharia/generate-qr-batch-dialog";
import { ProjectServicesList } from "@/components/engenharia/project-services-list";
import { ProjectShell, type ProjectOverview } from "@/components/engenharia/project-shell";
import {
  ALL,
  NO_BATCH,
  type BatchSummary,
  type QrRow,
  type RegistrationFilter,
} from "@/components/engenharia/qr-codes/qr-code-rows";
import { QrBatchChips, QrCodesFilters } from "@/components/engenharia/qr-codes/qr-codes-filters";
import { QrCodesTable } from "@/components/engenharia/qr-codes/qr-codes-table";
import { QrSelectionBar } from "@/components/engenharia/qr-codes/qr-selection-bar";
import { Button } from "@/components/ui/button";
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

type Tab = "labels" | "services";

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
          <QrCodesFilters
            search={search}
            onSearchChange={setSearch}
            registrationOptions={registrationOptions}
            registration={registration}
            onRegistrationChange={changeRegistration}
            status={status}
            onStatusChange={changeStatus}
            batches={batches}
            hasRowsWithoutBatch={hasRowsWithoutBatch}
            batchFilter={batchFilter}
            onBatchFilterChange={changeBatchFilter}
          />

          {/* Lotes recentes: reimpressão em um clique. */}
          {batches.length > 0 && (
            <QrBatchChips
              batches={batches}
              batchFilter={batchFilter}
              onBatchFilterChange={changeBatchFilter}
              onPrintBatch={handlePrintBatch}
            />
          )}

          {selectedRows.length > 0 && (
            <QrSelectionBar
              count={selectedRows.length}
              bulkDeleting={bulkDeleting}
              onClear={() => setSelected(new Set())}
              onPrint={() =>
                printTokens(
                  selectedRows.map((r) => r.token),
                  "Códigos QR selecionados"
                )
              }
              onBulkDelete={handleBulkDelete}
            />
          )}

          <QrCodesTable
            rows={filtered}
            selected={selected}
            allFilteredSelected={allFilteredSelected}
            deletingToken={deletingToken}
            onToggleAll={toggleAllFiltered}
            onToggle={toggleToken}
            onPrint={printTokens}
            onDelete={handleDelete}
          />
        </>
      )}
    </section>
  );
}
