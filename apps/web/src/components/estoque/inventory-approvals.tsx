import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

type Approval = FunctionReturnType<
  typeof api.inventory.listPendingApprovals
>[number];

export function InventoryApprovals({
  approvals,
}: {
  approvals: Approval[];
}) {
  const reviewDocument = useMutation(api.inventory.reviewDocument);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openDecision(
    document: Approval,
    nextDecision: "approve" | "reject"
  ) {
    setSelected(document);
    setDecision(nextDecision);
    setReason("");
  }

  async function submit() {
    if (!selected || !reason.trim()) {
      toast.error("Informe a justificativa");
      return;
    }
    setSubmitting(true);
    try {
      await reviewDocument({
        documentId: selected._id,
        decision,
        reason,
      });
      toast.success(
        decision === "approve" ? "Exceção aprovada" : "Movimentação rejeitada"
      );
      setSelected(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao analisar exceção"));
    } finally {
      setSubmitting(false);
    }
  }

  if (approvals.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma exceção aguarda sua aprovação.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {approvals.map((document) => (
          <Card key={document._id}>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-5 text-amber-500" />
                    {document.projectName ?? "Obra"}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {document.items.length} material(is) •{" "}
                    {document.reference ?? "Sem referência"}
                  </p>
                </div>
                <Badge variant="outline">Aguardando sua decisão</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {document.compatibilityIssues.map((issue) => (
                  <div
                    key={`${issue.ruleId}-${issue.materialAId}-${issue.materialBId}`}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                  >
                    <p className="font-medium text-amber-950">
                      {issue.materialAName} × {issue.materialBName}
                    </p>
                    <p className="text-amber-800">{issue.message}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => openDecision(document, "approve")}
                >
                  <Check className="mr-1 size-4" />
                  Aprovar exceção
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openDecision(document, "reject")}
                >
                  <X className="mr-1 size-4" />
                  Rejeitar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approve" ? "Aprovar exceção" : "Rejeitar remessa"}
            </DialogTitle>
            <DialogDescription>
              Sua decisão ficará registrada na auditoria. A aprovação apenas
              libera o Estoque para concluir a transferência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explique por que a exceção pode ou não ser aceita"
            />
          </div>
          <DialogFooter>
            <Button
              variant={decision === "reject" ? "destructive" : "default"}
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? "Salvando..." : "Confirmar decisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
