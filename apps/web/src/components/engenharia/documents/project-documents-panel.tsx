import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  Archive,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectDocumentDialog } from "@/components/engenharia/documents/project-document-dialog";
import { getErrorMessage } from "@/lib/errors";
import {
  TECHNICIAN_ACCESS_LABELS,
  downloadBlob,
  formatFileSize,
  openPdfInNewTab,
} from "@/lib/project-documents";
import { useDocumentBlobFetcher } from "@/lib/use-document-blob";

type OfficeDocument = FunctionReturnType<
  typeof api.projectDocuments.listByProject
>[number];

export function ProjectDocumentsPanel({
  projectId,
  projectName,
  archived = false,
}: {
  projectId: Id<"projects">;
  projectName: string;
  /** Obra arquivada: só consulta e remoção; envio/edição ficam bloqueados. */
  archived?: boolean;
}) {
  const documents = useQuery(api.projectDocuments.listByProject, { projectId });
  const removeDocument = useMutation(api.projectDocuments.remove);
  const [removing, setRemoving] = useState<OfficeDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeDocument({ documentId: removing._id });
      toast.success("Documento removido");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover"));
    } finally {
      setBusy(false);
    }
  }

  const sharedCount =
    documents?.filter((d) => d.technicianAccess !== "none").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Documentos da obra</h2>
          <p className="text-sm text-muted-foreground">
            PDFs de {projectName} para consulta em campo.
            {documents && documents.length > 0 && (
              <>
                {" "}
                {sharedCount} de {documents.length} liberado
                {sharedCount === 1 ? "" : "s"} para técnicos.
              </>
            )}
          </p>
        </div>
        {!archived && (
          <ProjectDocumentDialog
            projectId={projectId}
            trigger={
              <Button>
                <Upload className="mr-1.5 size-4" />
                Enviar PDF
              </Button>
            }
          />
        )}
      </div>

      {archived && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          Obra arquivada: os documentos continuam disponíveis para consulta,
          mas restaure a obra para enviar ou editar PDFs.
        </p>
      )}

      {documents === undefined ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <FileText className="size-9 text-muted-foreground" />
          <div>
            <p className="font-medium">Nenhum PDF nesta obra ainda</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Envie plantas, memoriais e manuais. Você escolhe, arquivo a
              arquivo, quais técnicos podem ver e baixar.
            </p>
          </div>
          {!archived && (
            <ProjectDocumentDialog
              projectId={projectId}
              trigger={
                <Button variant="outline">
                  <Upload className="mr-1.5 size-4" />
                  Enviar o primeiro PDF
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {documents.map((document) => (
            <DocumentRow
              key={document._id}
              projectId={projectId}
              document={document}
              archived={archived}
              onRemove={() => setRemoving(document)}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover documento?</DialogTitle>
            <DialogDescription>
              &quot;{removing?.name}&quot; será apagado da obra e deixará de
              aparecer para os técnicos. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoving(null)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmRemove()}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRow({
  projectId,
  document,
  archived,
  onRemove,
}: {
  projectId: Id<"projects">;
  document: OfficeDocument;
  archived: boolean;
  onRemove: () => void;
}) {
  const fetchBlob = useDocumentBlobFetcher();
  const [busy, setBusy] = useState<"open" | "download" | null>(null);

  async function run(kind: "open" | "download", action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          kind === "open" ? "Não foi possível abrir" : "Não foi possível baixar"
        )
      );
    } finally {
      setBusy(null);
    }
  }

  const handleOpen = () =>
    run("open", () =>
      openPdfInNewTab(() => fetchBlob(document._id), document.fileName)
    );

  const handleDownload = () =>
    run("download", async () => {
      downloadBlob(await fetchBlob(document._id), document.fileName);
    });

  const accessVariant =
    document.technicianAccess === "none"
      ? "secondary"
      : document.technicianAccess === "all"
        ? "success"
        : "warning";

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{document.name}</p>
          {document.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {document.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formatFileSize(document.sizeBytes)} ·{" "}
            {new Date(document.createdAt).toLocaleDateString("pt-BR")}
            {document.uploadedBy ? ` · ${document.uploadedBy.name}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge variant={accessVariant} className="px-2 py-0.5 text-xs">
              <Users className="mr-1 size-3" />
              {TECHNICIAN_ACCESS_LABELS[document.technicianAccess]}
            </Badge>
            {document.technicianAccess === "selected" &&
              document.allowedTechnicians.map((tech) => (
                <span
                  key={tech._id}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tech.name}
                </span>
              ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void handleOpen()}
        >
          {busy === "open" ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <ExternalLink className="mr-1.5 size-3.5" />
          )}
          Abrir
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void handleDownload()}
        >
          {busy === "download" ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 size-3.5" />
          )}
          Baixar
        </Button>
        {!archived && (
          <ProjectDocumentDialog
            projectId={projectId}
            document={document}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 size-3.5" />
                Editar
              </Button>
            }
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remover documento"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
