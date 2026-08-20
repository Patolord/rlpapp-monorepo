import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, PackagePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RequestMaterialSheet } from "@/components/campo/request-material-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/material-import";

const REQUEST_STATUS: Record<
  string,
  { label: string; variant: "warning" | "default" | "destructive" | "secondary" | "success" }
> = {
  pending: { label: "Pendente", variant: "warning" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Recusado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
  fulfilled: { label: "Enviado", variant: "success" },
};

type RequestLine = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
  quantity: number;
  reason: "replenishment" | "new";
  markedDepleted: boolean;
};

export function CampoObraStockPage({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const currentUser = useQuery(api.users.getCurrentUser, {});
  const balances = useQuery(api.inventoryRequests.listObraBalances, {
    projectId,
  });
  const requests = useQuery(api.inventoryRequests.listObraRequests, {
    projectId,
  });
  const markDepleted = useMutation(api.inventoryRequests.markDepleted);
  const cancelRequest = useMutation(api.inventoryRequests.cancelRequest);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialLine, setInitialLine] = useState<RequestLine | null>(null);
  const [depleting, setDepleting] = useState<{
    materialId: Id<"materials">;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  function openRequest(line?: RequestLine) {
    setInitialLine(line ?? null);
    setSheetOpen(true);
  }

  async function confirmDepleted() {
    if (!depleting) return;
    setBusy(true);
    try {
      await markDepleted({
        projectId,
        materialId: depleting.materialId,
      });
      toast.success("Saldo zerado");
      setDepleting(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível marcar como acabou"));
    } finally {
      setBusy(false);
    }
  }

  if (balances === undefined || requests === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <Button className="h-12 w-full text-base" onClick={() => openRequest()}>
        <PackagePlus className="mr-2 size-5" />
        Pedir material
      </Button>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Materiais na obra</h2>
        {balances.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Esta obra ainda não recebeu materiais.
          </p>
        ) : (
          balances.map((item) => {
            const depleted = item.quantity <= 0;
            const stock = stockVisual(item.quantity, item.sentQuantity);
            return (
              <Card key={item.materialId}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {formatMaterialLabel(
                          item.materialName,
                          item.variantLabel
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Disponível {formatQty(item.quantity, item.unit)} ·
                        enviado {formatQty(item.sentQuantity, item.unit)}
                      </p>
                    </div>
                    <Badge variant={stock.variant}>{stock.label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-12"
                      disabled={depleted}
                      onClick={() =>
                        setDepleting({
                          materialId: item.materialId,
                          name: formatMaterialLabel(
                            item.materialName,
                            item.variantLabel
                          ),
                        })
                      }
                    >
                      Acabou
                    </Button>
                    <Button
                      className="h-12"
                      onClick={() =>
                        openRequest({
                          materialId: item.materialId,
                          name: item.materialName,
                          variantLabel: item.variantLabel,
                          unit: item.unit,
                          quantity: 1,
                          reason: "replenishment",
                          markedDepleted: depleted,
                        })
                      }
                    >
                      Pedir mais
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pedidos</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        ) : (
          requests.map((request) => {
            const status = REQUEST_STATUS[request.status] ?? {
              label: request.status,
              variant: "secondary" as const,
            };
            return (
              <Card key={request._id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  {request.items.map((item) => (
                    <p key={item._id} className="text-sm">
                      {formatQty(item.quantity, item.unit)}{" "}
                      {formatMaterialLabel(item.materialName, item.variantLabel)}
                    </p>
                  ))}
                  {request.status === "rejected" && request.reviewNotes ? (
                    <p className="text-sm text-destructive">{request.reviewNotes}</p>
                  ) : null}
                  {request.status === "pending" &&
                    request.requestedByUserId === currentUser?._id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void cancelRequest({ requestId: request._id }).catch(
                          (error) =>
                            toast.error(
                              getErrorMessage(error, "Não foi possível cancelar")
                            )
                        )
                      }
                    >
                      Cancelar pedido
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <RequestMaterialSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        projectId={projectId}
        initialMaterial={initialLine}
      />

      <Dialog
        open={depleting !== null}
        onOpenChange={(open) => {
          if (!open) setDepleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como acabou?</DialogTitle>
            <DialogDescription>
              O saldo de {depleting?.name} nesta obra será zerado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDepleting(null)}
              disabled={busy}
            >
              Voltar
            </Button>
            <Button onClick={() => void confirmDepleted()} disabled={busy}>
              {busy ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stockVisual(
  quantity: number,
  sentQuantity: number
): { label: string; variant: "success" | "warning" | "destructive" } {
  if (quantity <= 0) return { label: "Zerado", variant: "destructive" };
  if (sentQuantity > 0 && quantity / sentQuantity <= 0.2) {
    return { label: "Baixo", variant: "warning" };
  }
  return { label: "Ok", variant: "success" };
}

function formatQty(quantity: number, unit: string | null): string {
  const formatted = quantity.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}
