import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { formatDateTime } from "@rlpapp/shared";
import { useMutation } from "convex/react";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

type Access = FunctionReturnType<typeof api.inventory.getAccess>;
type DocumentRow = FunctionReturnType<
  typeof api.inventory.listDocuments
>["page"][number];

export const MOVEMENT_LABELS: Record<string, string> = {
  entry: "Entrada",
  transfer: "Envio para obra",
  consumption: "Consumo",
  return: "Retorno",
  adjustment: "Ajuste",
  reversal: "Estorno",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Exceção aprovada",
  posted: "Concluída",
  rejected: "Rejeitada",
  reversed: "Estornada",
};

type PaginatedDocuments = {
  results: DocumentRow[];
  status: string;
  loadMore: (numItems: number) => void;
};

export function InventoryDocumentsHistory({
  access,
  documents,
  emptyText = "Nenhuma movimentação registrada.",
  showProjectName = true,
}: {
  access: Access;
  documents: PaginatedDocuments;
  emptyText?: string;
  showProjectName?: boolean;
}) {
  const postDocument = useMutation(api.inventory.postDocument);
  const reverseDocument = useMutation(api.inventory.reverseDocument);
  const [reversalDocumentId, setReversalDocumentId] =
    useState<Id<"inventoryDocuments"> | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  function canPostDocument(type: string): boolean {
    if (access.canWriteCentral) return true;
    if (type === "entry") return access.canCreateEntry;
    return type === "consumption" && access.canCreateProjectMovement;
  }

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

  if (documents.status === "LoadingFirstPage") {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Carregando...
      </p>
    );
  }

  if (documents.results.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <>
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
                  {showProjectName
                    ? `${document.projectName ?? "Estoque central"} • `
                    : ""}
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
                {document.status === "posted" && access.canWriteCentral && (
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
            <Button variant="outline" onClick={() => documents.loadMore(20)}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>

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
    </>
  );
}
