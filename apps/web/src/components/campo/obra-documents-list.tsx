import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  CheckCircle2,
  CloudDownload,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import {
  FIELD_CACHE_CHANGED_EVENT,
  fieldCacheKeys,
  getOfflineDocument,
  listOfflineDocuments,
  pruneOfflineDocuments,
  removeOfflineDocument,
  saveDocumentOffline,
  type CachedDocumentMeta,
} from "@/lib/field-cache";
import { downloadBlob, openPdfInNewTab } from "@/lib/project-documents";
import { formatFileSize } from "@/lib/project-documents";
import { useDocumentBlobFetcher } from "@/lib/use-document-blob";
import { useFieldCacheOwner } from "@/lib/use-field-cache-owner";
import { useOfflineQuery } from "@/lib/use-offline-query";
import { useOnline } from "@/lib/use-online";

type FieldDocument = FunctionReturnType<
  typeof api.projectDocuments.listForTechnician
>[number];

function useOfflineDocuments(ownerId: string | null, projectId: Id<"projects">) {
  const [docs, setDocs] = useState<Map<string, CachedDocumentMeta>>(new Map());

  useEffect(() => {
    if (!ownerId) {
      setDocs(new Map());
      return;
    }
    let alive = true;
    const refresh = () => {
      void listOfflineDocuments(ownerId, projectId).then((items) => {
        if (!alive) return;
        setDocs(new Map(items.map((item) => [item.documentId, item])));
      });
    };
    refresh();
    window.addEventListener(FIELD_CACHE_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(FIELD_CACHE_CHANGED_EVENT, refresh);
    };
  }, [ownerId, projectId]);

  return docs;
}

export function ObraDocumentsList({ projectId }: { projectId: Id<"projects"> }) {
  const online = useOnline();
  const { ownerId } = useFieldCacheOwner();
  const { data: documents, fromCache, cacheChecked } = useOfflineQuery(
    fieldCacheKeys.documents(projectId),
    api.projectDocuments.listForTechnician,
    { projectId }
  );
  const offlineDocs = useOfflineDocuments(ownerId, projectId);

  // Com a lista ao vivo em mãos, descarta PDFs salvos que sumiram ou perderam
  // o acesso — o técnico não deve continuar com um arquivo que não pode mais ver.
  useEffect(() => {
    if (!documents || fromCache || !ownerId) return;
    void pruneOfflineDocuments(
      ownerId,
      projectId,
      documents.map((document) => document._id)
    );
  }, [documents, fromCache, ownerId, projectId]);

  const savedCount = useMemo(
    () => (documents ?? []).filter((d) => offlineDocs.has(d._id)).length,
    [documents, offlineDocs]
  );

  if (documents === undefined) {
    if (!cacheChecked) return null;
    if (!online) {
      return (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sem conexão e nenhum documento desta obra foi salvo neste aparelho.
        </p>
      );
    }
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Carregando documentos...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhum documento liberado para você nesta obra.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {documents.length} documento{documents.length === 1 ? "" : "s"}
        {savedCount > 0 &&
          ` · ${savedCount} salvo${savedCount === 1 ? "" : "s"} neste aparelho`}
        {fromCache && " · lista salva neste aparelho"}
      </p>
      <div className="space-y-2">
        {documents.map((document) => (
          <DocumentCard
            key={document._id}
            document={document}
            projectId={projectId}
            ownerId={ownerId}
            offline={offlineDocs.get(document._id) ?? null}
            online={online}
          />
        ))}
      </div>
    </div>
  );
}

type Busy = "open" | "download" | "save" | "remove" | null;

function DocumentCard({
  document,
  projectId,
  ownerId,
  offline,
  online,
}: {
  document: FieldDocument;
  projectId: Id<"projects">;
  ownerId: string | null;
  offline: CachedDocumentMeta | null;
  online: boolean;
}) {
  const fetchBlob = useDocumentBlobFetcher();
  const [busy, setBusy] = useState<Busy>(null);
  const isSaved = offline !== null;
  const canReach = isSaved || online;
  const canSave = online && ownerId !== null;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível concluir a ação."));
    } finally {
      setBusy(null);
    }
  };

  // Prefere o PDF salvo neste aparelho; senão busca pelo endpoint
  // autenticado (que reavalia o acesso a cada pedido).
  const loadBlob = async (): Promise<Blob> => {
    if (ownerId) {
      const cached = await getOfflineDocument(ownerId, document._id);
      if (cached) return cached.blob;
    }
    if (!online) throw new Error("Sem conexão para baixar este arquivo.");
    return await fetchBlob(document._id);
  };

  const handleOpen = () =>
    run("open", () => openPdfInNewTab(loadBlob, document.fileName));

  const handleDownload = () =>
    run("download", async () => {
      downloadBlob(await loadBlob(), document.fileName);
    });

  const handleSave = () =>
    run("save", async () => {
      if (!ownerId) throw new Error("Sessão não identificada.");
      const blob = await fetchBlob(document._id);
      await saveDocumentOffline(ownerId, {
        documentId: document._id,
        projectId,
        name: document.name,
        fileName: document.fileName,
        sizeBytes: blob.size,
        blob,
      });
      toast.success("PDF salvo para uso offline.");
    });

  const handleRemove = () =>
    run("remove", async () => {
      if (!ownerId) return;
      await removeOfflineDocument(ownerId, document._id);
      toast.success("PDF removido deste aparelho.");
    });

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <FileText className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-sm font-semibold leading-snug">
            {document.name}
          </p>
          {document.description && (
            <p className="text-xs text-muted-foreground">{document.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(document.sizeBytes)}</span>
            {isSaved ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3" />
                Salvo offline
              </Badge>
            ) : (
              !online && <Badge variant="outline">Precisa de conexão</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          variant="default"
          className="h-11"
          disabled={!canReach || busy !== null}
          onClick={handleOpen}
        >
          {busy === "open" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}
          Abrir
        </Button>
        <Button
          variant="outline"
          className="h-11"
          disabled={!canReach || busy !== null}
          onClick={handleDownload}
        >
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Baixar
        </Button>
        {isSaved ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy !== null}
            onClick={handleRemove}
          >
            {busy === "remove" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Remover
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-11"
            disabled={!canSave || busy !== null}
            onClick={handleSave}
          >
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CloudDownload className="size-4" />
            )}
            Offline
          </Button>
        )}
      </div>
    </div>
  );
}
