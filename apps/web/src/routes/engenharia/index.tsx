import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Eye,
  History,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";
import { printQrCodes } from "@/lib/qr-print";

const filterModes = ["all", "linked", "free", "latest_batch"] as const;
type FilterMode = (typeof filterModes)[number];

type QrCodeRow = {
  _id: Id<"qrCodes">;
  token: string;
  equipmentId?: Id<"equipment">;
  batchId?: string;
  batchName?: string;
  equipment: { tag?: string; location?: string; description?: string } | null;
};

export const Route = createFileRoute("/engenharia/")({
  validateSearch: (search: Record<string, unknown>): { filter?: FilterMode } => {
    const filter = search.filter;
    if (
      typeof filter === "string" &&
      filterModes.includes(filter as FilterMode)
    ) {
      return { filter: filter as FilterMode };
    }

    return {};
  },
  component: EngenhariaPage,
});

function EngenhariaPage() {
  return (
    <>
      <Authenticated>
        <PageContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function PageContent() {
  const search = Route.useSearch();
  const convex = useConvex();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingToken, setDeletingToken] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [printingBatch, setPrintingBatch] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  const stats = useQuery(api.qrCodes.stats, {});
  const equipmentList = useQuery(api.equipment.list);
  const generationBatches = useQuery(api.qrCodes.listBatches, { limit: 8 });
  const searchResults = useQuery(
    api.qrCodes.search,
    submittedSearch ? { term: submittedSearch } : "skip"
  );
  const removeQrCode = useMutation(api.qrCodes.remove);
  const removeManyQrCodes = useMutation(api.qrCodes.removeMany);

  const activeBatchId =
    selectedBatchId ??
    (search.filter === "latest_batch" ? generationBatches?.[0]?.batchId ?? null : null);

  const batchCodes = usePaginatedQuery(
    api.qrCodes.listByBatch,
    activeBatchId ? { batchId: activeBatchId } : "skip",
    { initialNumItems: 25 }
  );

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  const totalEquipment = equipmentList?.length ?? 0;
  const operational =
    equipmentList?.filter((e) => e.status === "operational").length ?? 0;
  const warnings =
    equipmentList?.filter((e) => e.status === "warning").length ?? 0;
  const errors = equipmentList?.filter((e) => e.status === "error").length ?? 0;
  const activeCodes = batchCodes.results as QrCodeRow[];
  const selectedRecords = activeCodes.filter((qr) => selected.has(qr.token));
  const activeBatchName = generationBatches?.find((batch) => batch.batchId === activeBatchId)?.batchName;
  const allLoadedSelected =
    activeCodes.length > 0 && activeCodes.every((qr) => selected.has(qr.token));

  useEffect(() => {
    if (
      search.filter === "latest_batch" &&
      !selectedBatchId &&
      generationBatches?.[0]
    ) {
      setSelectedBatchId(generationBatches[0].batchId);
    }
  }, [generationBatches, search.filter, selectedBatchId]);

  const openBatch = useCallback((batchId: string) => {
    setSelectedBatchId(batchId);
    setSelected(new Set());
    setPreviewToken(null);
  }, []);

  const toggleSelect = useCallback((token: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }, []);

  const toggleSelectLoaded = useCallback(() => {
    setSelected((prev) => {
      if (activeCodes.length > 0 && activeCodes.every((qr) => prev.has(qr.token))) {
        const next = new Set(prev);
        for (const qr of activeCodes) next.delete(qr.token);
        return next;
      }
      return new Set([...prev, ...activeCodes.map((qr) => qr.token)]);
    });
  }, [activeCodes]);

  function handlePrintTokens(tokens: string[], titlePrefix: string) {
    if (tokens.length === 0) return;
    printQrCodes({ tokens, baseUrl, title: `${titlePrefix} - RLP Engenharia` });
  }

  async function handlePrintBatch(batchId: string, title?: string) {
    setPrintingBatch(batchId);
    try {
      const tokens = await convex.query(api.qrCodes.getBatchTokens, { batchId });
      if (tokens.length === 0) {
        toast.error("Nenhum QR code encontrado neste lote");
        return;
      }
      handlePrintTokens(tokens, `QR Codes ${title ?? batchId}`);
    } catch (err) {
      console.error("Failed to print batch:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao imprimir lote");
    } finally {
      setPrintingBatch(null);
    }
  }

  async function handleDeleteQr(token: string, isLinked: boolean) {
    if (isLinked) {
      toast.error("QR codes vinculados a equipamentos não podem ser excluídos");
      return;
    }
    if (!window.confirm(`Excluir o QR code ${token}?`)) return;
    setDeletingToken(token);
    try {
      await removeQrCode({ token });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
      if (previewToken === token) setPreviewToken(null);
      toast.success("QR code excluído");
    } catch (err) {
      console.error("Failed to delete QR code:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir QR code");
    } finally {
      setDeletingToken(null);
    }
  }

  async function handleBulkDelete() {
    if (selectedRecords.length === 0) return;
    const freeCount = selectedRecords.filter((qr) => !qr.equipmentId).length;
    if (freeCount === 0) {
      toast.error("Nenhum QR code livre selecionado para exclusão");
      return;
    }
    const linkedCount = selectedRecords.length - freeCount;
    const message =
      linkedCount > 0
        ? `Excluir ${freeCount} QR code(s) livre(s)? ${linkedCount} vinculado(s) serão mantidos.`
        : `Excluir ${freeCount} QR code(s) selecionado(s)?`;
    if (!window.confirm(message)) return;
    setBulkDeleting(true);
    try {
      const result = await removeManyQrCodes({
        tokens: selectedRecords.map((qr) => qr.token),
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const token of [...result.deleted, ...result.missing]) {
          next.delete(token);
        }
        return next;
      });
      if (result.deleted.length > 0) {
        toast.success(`${result.deleted.length} QR code(s) excluído(s)`);
      }
      if (result.blocked.length > 0) {
        toast.error(`${result.blocked.length} QR code(s) vinculado(s) mantido(s)`);
      }
    } catch (err) {
      console.error("Failed to bulk delete QR codes:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir QR codes");
    } finally {
      setBulkDeleting(false);
    }
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedSearch(searchTerm.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">QR Codes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie lotes, reimpressões e códigos livres sem carregar a base inteira.
          </p>
        </div>
        <Button render={<Link to="/engenharia/qr-codes" />}>
          <Plus className="mr-2 h-4 w-4" />
          Criar QR Codes
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Equipamentos" value={totalEquipment.toString()} description={`${operational} operacionais${warnings > 0 ? `, ${warnings} alertas` : ""}${errors > 0 ? `, ${errors} erros` : ""}`} icon={<Wrench className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total QR Codes" value={stats ? `${stats.total}${stats.capped ? "+" : ""}` : "..."} description="códigos gerados" icon={<QrCode className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Vinculados" value={stats ? stats.linked.toString() : "..."} description="com equipamento vinculado" icon={<Link2 className="h-4 w-4 text-blue-500" />} />
        <StatCard title="Livres" value={stats ? stats.free.toString() : "..."} description="disponíveis para vínculo" icon={<Link2Off className="h-4 w-4 text-gray-400" />} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Lotes recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {generationBatches === undefined ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : generationBatches.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">Nenhum lote de geração encontrado ainda.</p>
            ) : (
              <div className="divide-y">
                {generationBatches.map((batch) => (
                  <div key={batch.batchId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openBatch(batch.batchId)}>
                      <p className="truncate text-sm font-semibold">{batch.batchName ?? batch.batchId}</p>
                      {batch.batchName && <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{batch.batchId}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {batch.count} QR code{batch.count === 1 ? "" : "s"} · {new Date(batch.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button variant={activeBatchId === batch.batchId ? "default" : "outline"} size="sm" onClick={() => openBatch(batch.batchId)}>Abrir lote</Button>
                      <Button variant="ghost" size="sm" disabled={printingBatch === batch.batchId} onClick={() => handlePrintBatch(batch.batchId, batch.batchName ?? batch.batchId)}>
                        {printingBatch === batch.batchId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Reimprimir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-muted-foreground" />
              Buscar lote ou código
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <form className="flex gap-2" onSubmit={handleSearch}>
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Código, nome do lote ou id" />
              <Button type="submit">Buscar</Button>
            </form>
            {submittedSearch && searchResults === undefined ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : submittedSearch && searchResults ? (
              <SearchResults results={searchResults} deletingToken={deletingToken} printingBatch={printingBatch} onOpenBatch={openBatch} onPrintBatch={handlePrintBatch} onPreview={setPreviewToken} onPrintOne={(token) => handlePrintTokens([token], `QR Code ${token}`)} onDelete={handleDeleteQr} />
            ) : (
              <p className="text-sm text-muted-foreground">Use a busca quando precisar encontrar um código específico. A página não carrega todos os QR codes por padrão.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRecords.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3 sm:flex-row sm:items-center">
          <span className="text-sm font-medium">{selectedRecords.length} selecionado{selectedRecords.length > 1 ? "s" : ""}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}><X className="mr-2 h-4 w-4" />Limpar</Button>
          <Button variant="outline" size="sm" onClick={() => handlePrintTokens(selectedRecords.map((qr) => qr.token), "QR Codes Selecionados")}><Printer className="mr-2 h-4 w-4" />Imprimir selecionados</Button>
          <Button variant="destructive" size="sm" disabled={bulkDeleting} onClick={handleBulkDelete}>{bulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Excluir livres</Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{activeBatchId ? "Códigos do lote" : "Selecione um lote"}</CardTitle>
                <p className="text-sm text-muted-foreground">{activeBatchId ? activeBatchName ?? activeBatchId : "Abra um lote recente ou resultado de busca para ver os códigos."}</p>
              </div>
              {activeBatchId && activeCodes.length > 0 && <Button variant="outline" size="sm" onClick={toggleSelectLoaded}>{allLoadedSelected ? "Desmarcar carregados" : "Selecionar carregados"}</Button>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!activeBatchId ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">A visualização de códigos fica vazia até você escolher um lote.</p>
            ) : batchCodes.status === "LoadingFirstPage" ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : activeCodes.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">Nenhum código encontrado neste lote.</p>
            ) : (
              <>
                <div className="divide-y">
                  {activeCodes.map((qr) => <QrCodeRowItem key={qr._id} qr={qr} checked={selected.has(qr.token)} deleting={deletingToken === qr.token} onSelect={() => toggleSelect(qr.token)} onPreview={() => setPreviewToken(qr.token)} onPrint={() => handlePrintTokens([qr.token], `QR Code ${qr.token}`)} onDelete={() => handleDeleteQr(qr.token, !!qr.equipmentId)} />)}
                </div>
                <div className="border-t px-4 py-3">
                  {batchCodes.status === "CanLoadMore" ? <Button variant="outline" size="sm" onClick={() => batchCodes.loadMore(25)}>Carregar mais códigos</Button> : batchCodes.status === "LoadingMore" ? <Button variant="outline" size="sm" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</Button> : <p className="text-sm text-muted-foreground">Todos os códigos carregados para este lote.</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <QrPreviewPanel token={previewToken} baseUrl={baseUrl} onClose={() => setPreviewToken(null)} />
      </div>
    </div>
  );
}

function StatCard({ title, value, description, icon }: { title: string; value: string; description: string; icon: React.ReactNode }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle>{icon}</CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">{description}</p></CardContent></Card>;
}

function SearchResults({ results, deletingToken, printingBatch, onOpenBatch, onPrintBatch, onPreview, onPrintOne, onDelete }: { results: { batches: Array<{ batchId: string; batchName?: string; createdAt: number; count: number }>; qrCodes: QrCodeRow[] }; deletingToken: string | null; printingBatch: string | null; onOpenBatch: (batchId: string) => void; onPrintBatch: (batchId: string, title?: string) => void; onPreview: (token: string) => void; onPrintOne: (token: string) => void; onDelete: (token: string, isLinked: boolean) => void }) {
  if (results.batches.length === 0 && results.qrCodes.length === 0) return <p className="text-sm text-muted-foreground">Nenhum lote ou código encontrado nessa busca.</p>;
  return <div className="space-y-4">{results.batches.length > 0 && <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lotes</p>{results.batches.map((batch) => <div key={batch.batchId} className="rounded-lg border p-3"><p className="truncate text-sm font-semibold">{batch.batchName ?? batch.batchId}</p>{batch.batchName && <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{batch.batchId}</p>}<p className="mt-1 text-xs text-muted-foreground">{batch.count} QR code{batch.count === 1 ? "" : "s"} · {new Date(batch.createdAt).toLocaleString("pt-BR")}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => onOpenBatch(batch.batchId)}>Abrir lote</Button><Button variant="outline" size="sm" disabled={printingBatch === batch.batchId} onClick={() => onPrintBatch(batch.batchId, batch.batchName ?? batch.batchId)}>{printingBatch === batch.batchId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}Imprimir</Button></div></div>)}</div>}{results.qrCodes.length > 0 && <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Códigos</p>{results.qrCodes.map((qr) => <QrSearchResult key={qr._id} qr={qr} deleting={deletingToken === qr.token} onPreview={() => onPreview(qr.token)} onPrint={() => onPrintOne(qr.token)} onDelete={() => onDelete(qr.token, !!qr.equipmentId)} />)}</div>}</div>;
}

function QrSearchResult({ qr, deleting, onPreview, onPrint, onDelete }: { qr: QrCodeRow; deleting: boolean; onPreview: () => void; onPrint: () => void; onDelete: () => void }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{qr.token}</p><StatusBadge linked={!!qr.equipmentId} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{qr.batchName ?? (qr.batchId ? `Lote ${qr.batchId}` : "Sem lote")}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" size="icon-sm" title="Ver QR" onClick={onPreview}><Eye className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={onPrint}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="ghost" size="sm" render={<Link to="/engenharia/qr/$token" params={{ token: qr.token }} />}>Detalhes</Button><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={!!qr.equipmentId || deleting} title={qr.equipmentId ? "QR code vinculado não pode ser excluído" : "Excluir QR code"} onClick={onDelete}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></div>;
}

function QrCodeRowItem({ qr, checked, deleting, onSelect, onPreview, onPrint, onDelete }: { qr: QrCodeRow; checked: boolean; deleting: boolean; onSelect: () => void; onPreview: () => void; onPrint: () => void; onDelete: () => void }) {
  return <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><Checkbox aria-label={`Selecionar QR code ${qr.token}`} checked={checked} onCheckedChange={onSelect} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-mono text-sm font-semibold">{qr.token}</p><StatusBadge linked={!!qr.equipmentId} /></div></div></div><div className="min-w-0 pl-8 sm:pl-0"><p className="truncate text-xs text-muted-foreground">{qr.batchName ?? (qr.batchId ? `Lote ${qr.batchId}` : "Sem lote")}</p><p className="truncate text-xs text-muted-foreground">{qr.equipment ? [qr.equipment.tag, qr.equipment.location ?? qr.equipment.description].filter(Boolean).join(" · ") || "Equipamento" : "Sem equipamento"}</p></div><div className="flex flex-wrap gap-1.5 pl-8 sm:justify-end sm:pl-0"><Button variant="ghost" size="icon-sm" title="Ver QR" onClick={onPreview}><Eye className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={onPrint}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="ghost" size="sm" render={<Link to="/engenharia/qr/$token" params={{ token: qr.token }} />}>Detalhes</Button><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={!!qr.equipmentId || deleting} title={qr.equipmentId ? "QR code vinculado não pode ser excluído" : "Excluir QR code"} onClick={onDelete}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></div>;
}

function StatusBadge({ linked }: { linked: boolean }) {
  return <Badge variant="outline" className={linked ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-500"}>{linked ? "Vinculado" : "Livre"}</Badge>;
}

function QrPreviewPanel({ token, baseUrl, onClose }: { token: string | null; baseUrl: string; onClose: () => void }) {
  if (!token) return <Card className="hidden lg:sticky lg:top-6 lg:block"><CardContent className="flex min-h-64 flex-col items-center justify-center p-5 text-center"><Eye className="mb-2 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">Preview do QR</p><p className="mt-1 text-xs text-muted-foreground">Escolha um código para ver a imagem sem carregar todos na lista.</p></CardContent></Card>;
  return <Card className="lg:sticky lg:top-6"><CardContent className="flex flex-col items-center p-5 text-center"><div className="mb-4 flex w-full items-center justify-between gap-2 border-b pb-3"><div className="min-w-0 text-left"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p><p className="truncate font-mono text-sm font-semibold">{token}</p></div><Button variant="ghost" size="icon-sm" aria-label="Fechar preview" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="rounded-xl border bg-white p-3"><QRCodeSVG value={`${baseUrl}/q/${token}`} size={170} level="M" /></div><p className="mt-3 text-xs text-muted-foreground">Use imprimir para gerar a etiqueta.</p></CardContent></Card>;
}
