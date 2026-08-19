import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Check, Truck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { InventoryMovementDialog } from "@/components/estoque/inventory-movement-dialog";
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
import { formatMaterialLabel } from "@/lib/material-import";

type Access = FunctionReturnType<typeof api.inventory.getAccess>;
type Project = FunctionReturnType<typeof api.inventory.listProjects>[number];
type RequestRow = FunctionReturnType<
  typeof api.inventoryRequests.listOfficeRequests
>[number];

const STATUS_LABEL: Record<
  RequestRow["status"],
  { label: string; variant: "warning" | "default" | "destructive" | "secondary" | "success" }
> = {
  pending: { label: "Pendente", variant: "warning" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Recusado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
  fulfilled: { label: "Enviado", variant: "success" },
};

export function ObraMaterialRequests({
  requests,
  access,
  projects,
  emptyText,
}: {
  requests: RequestRow[];
  access: Access;
  projects: Project[];
  emptyText: string;
}) {
  const reviewRequest = useMutation(api.inventoryRequests.reviewRequest);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fulfillRequest, setFulfillRequest] = useState<RequestRow | null>(null);

  async function submitReview() {
    if (!selected || !reason.trim()) {
      toast.error("Informe a justificativa");
      return;
    }
    setSubmitting(true);
    try {
      await reviewRequest({
        requestId: selected._id,
        decision,
        reason,
      });
      toast.success(
        decision === "approve" ? "Pedido aprovado" : "Pedido recusado"
      );
      setSelected(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao analisar o pedido"));
    } finally {
      setSubmitting(false);
    }
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {requests.map((request) => {
          const status = STATUS_LABEL[request.status];
          return (
            <Card key={request._id}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {request.projectName}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {request.requestedByName} ·{" "}
                      {new Date(request.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {request.items.map((item) => (
                  <p key={item._id} className="text-sm">
                    {item.quantity.toLocaleString("pt-BR")} {item.unit ?? ""}{" "}
                    {formatMaterialLabel(item.materialName, item.variantLabel)}
                    {item.markedDepleted ? " · acabou no campo" : ""}
                  </p>
                ))}
                {request.reviewNotes ? (
                  <p className="text-sm text-muted-foreground">
                    {request.reviewNotes}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {request.status === "pending" &&
                    access.canReviewMaterialRequests && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelected(request);
                            setDecision("approve");
                            setReason("");
                          }}
                        >
                          <Check className="mr-1 size-4" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelected(request);
                            setDecision("reject");
                            setReason("");
                          }}
                        >
                          <X className="mr-1 size-4" />
                          Recusar
                        </Button>
                      </>
                    )}
                  {request.status === "approved" &&
                    access.canFulfillMaterialRequests && (
                      <Button
                        size="sm"
                        onClick={() => setFulfillRequest(request)}
                      >
                        <Truck className="mr-1 size-4" />
                        Enviar para a obra
                      </Button>
                    )}
                </div>
              </CardContent>
            </Card>
          );
        })}
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
              {decision === "approve" ? "Aprovar pedido" : "Recusar pedido"}
            </DialogTitle>
            <DialogDescription>
              A aprovação não movimenta estoque. O Estoque envia depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Textarea
              id="justificativa"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Por que este pedido pode ou não ser atendido"
            />
          </div>
          <DialogFooter>
            <Button
              variant={decision === "reject" ? "destructive" : "default"}
              onClick={() => void submitReview()}
              disabled={submitting}
            >
              {submitting ? "Salvando..." : "Confirmar decisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fulfillRequest && (
        <FulfillRequestDialog
          request={fulfillRequest}
          access={access}
          projects={projects}
          onClose={() => setFulfillRequest(null)}
        />
      )}
    </>
  );
}

function FulfillRequestDialog({
  request,
  access,
  projects,
  onClose,
}: {
  request: RequestRow;
  access: Access;
  projects: Project[];
  onClose: () => void;
}) {
  return (
    <InventoryMovementDialog
      access={access}
      projects={projects}
      fixedProjectId={request.projectId as Id<"projects">}
      scope="central"
      requestId={request._id}
      prefillLines={request.items.map((item) => ({
        materialId: item.materialId,
        name: item.materialName,
        variantLabel: item.variantLabel,
        unit: item.unit,
        quantity: item.quantity,
      }))}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger={null}
    />
  );
}
