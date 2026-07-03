import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/compras/fila-revisao/")({
  component: FilaRevisaoPage,
});

function FilaRevisaoPage() {
  return (
    <AuthShell>
      <FilaRevisaoContent />
    </AuthShell>
  );
}

function FilaRevisaoContent() {
  const [now] = useState(() => Date.now());
  const queue = useQuery(api.priceEvents.reviewQueue, { now });
  const materials = useQuery(api.materials.list, { activeOnly: true });
  const suppliers = useQuery(api.suppliers.list, { activeOnly: true });
  const updateReview = useMutation(api.priceEvents.updateReview);

  const [linkState, setLinkState] = useState<
    Record<string, { materialId: string; supplierId: string; unit: string }>
  >({});

  function getLink(eventId: string) {
    return linkState[eventId] ?? { materialId: "", supplierId: "", unit: "" };
  }

  function setLink(eventId: string, patch: Partial<{ materialId: string; supplierId: string; unit: string }>) {
    setLinkState((prev) => ({
      ...prev,
      [eventId]: { ...getLink(eventId), ...patch },
    }));
  }

  async function handleReview(
    eventId: Id<"priceEvents">,
    reviewStatus: "reviewed" | "ignored" | "duplicate"
  ) {
    const link = getLink(eventId);
    try {
      await updateReview({
        eventId,
        reviewStatus,
        materialId: link.materialId ? (link.materialId as Id<"materials">) : undefined,
        supplierId: link.supplierId ? (link.supplierId as Id<"suppliers">) : undefined,
        unit: link.unit || undefined,
      });
      toast.success(
        reviewStatus === "reviewed"
          ? "Marcado como revisado"
          : reviewStatus === "ignored"
            ? "Ignorado"
            : "Marcado como duplicado"
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao revisar"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fila de Revisão</h1>
        <p className="text-sm text-muted-foreground">
          Vincule materiais e fornecedores aos preços incompletos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendentes ({queue?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(queue ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item pendente.</p>
          ) : (
            (queue ?? []).map((event) => (
              <div key={event._id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {event.rawDescription ?? event.materialName ?? "Sem descrição"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(event.unitPriceCents)}
                      {event.unit ? `/${event.unit}` : ""} · {event.supplierName} ·{" "}
                      {formatDate(event.occurredAt)}
                    </p>
                  </div>
                  <PriceFreshnessBadge freshness={event.freshness} ageDays={event.ageDays} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Select
                    value={getLink(event._id).materialId}
                    onValueChange={(v) => setLink(event._id, { materialId: v ?? "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Vincular material" /></SelectTrigger>
                    <SelectContent>
                      {(materials ?? []).map((m) => (
                        <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={getLink(event._id).supplierId}
                    onValueChange={(v) => setLink(event._id, { supplierId: v ?? "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Vincular fornecedor" /></SelectTrigger>
                    <SelectContent>
                      {(suppliers ?? []).map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    placeholder="Unidade (m, un...)"
                    value={getLink(event._id).unit}
                    onChange={(e) => setLink(event._id, { unit: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.warnings.map((w) => (
                    <span key={w} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleReview(event._id, "reviewed")}>
                    Marcar revisado
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleReview(event._id, "ignored")}>
                    Ignorar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleReview(event._id, "duplicate")}>
                    Duplicado
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
