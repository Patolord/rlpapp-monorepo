import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";

type MergeTarget = {
  _id: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
};

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Rascunho a revisar (cadastro em campo ou proposta do Takeoff): de onde veio,
 * os parecidos que ele pode duplicar e as duas saídas: manter como item novo
 * ou mesclar num existente (abre o diálogo de mesclagem já escolhido).
 */
export function MaterialDraftReview({
  materialId,
  canEdit,
  onMergeInto,
  onApproved,
}: {
  materialId: Id<"materials">;
  canEdit: boolean;
  onMergeInto: (target: MergeTarget) => void;
  onApproved: () => void;
}) {
  const review = useQuery(api.materialCaptures.reviewForMaterial, { materialId });
  const updateMaterial = useMutation(api.materials.update);
  const [approving, setApproving] = useState(false);

  async function keepAsNew() {
    setApproving(true);
    try {
      await updateMaterial({ materialId, status: "active", active: true });
      toast.success("Item mantido como novo no catálogo");
      onApproved();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao aprovar o item"));
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Rascunho: confira se não repete outro item</h3>
        <p className="text-xs text-muted-foreground">
          O saldo já está lançado. Se for o mesmo de um item abaixo, mescle; o
          estoque e o histórico vão junto.
        </p>
      </div>

      {review?.captures.length ? (
        <ul className="space-y-1 text-xs">
          {review.captures.map((capture) => (
            <li key={capture._id} className="flex items-center gap-2">
              {capture.photoUrl ? (
                <a href={capture.photoUrl} target="_blank" rel="noreferrer">
                  <img src={capture.photoUrl} alt="" className="h-10 w-10 rounded border object-cover" />
                </a>
              ) : null}
              <span>
                Cadastrado em campo por {capture.capturedByName} em{" "}
                {capture.locationName}, {formatDateTime(capture.capturedAt)} · contou{" "}
                {capture.countedQuantity.toLocaleString("pt-BR")}
                {capture.offline ? " · sem sinal" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {review === undefined ? (
        <p className="text-xs text-muted-foreground">Procurando parecidos…</p>
      ) : review && review.similar.length > 0 ? (
        <ul className="divide-y rounded-md border bg-background">
          {review.similar.map((item) => (
            <li key={item.materialId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{formatMaterialTitle(item.name, item.variantLabel)}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.sku, item.unit].filter(Boolean).join(" · ")}
                </p>
              </div>
              {item.status === "draft" ? <Badge variant="outline">Rascunho</Badge> : null}
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onMergeInto({
                      _id: item.materialId,
                      name: item.name,
                      variantLabel: item.variantLabel,
                      sku: item.sku,
                    })
                  }
                >
                  Mesclar neste
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum item parecido no catálogo.</p>
      )}

      {canEdit ? (
        <Button size="sm" onClick={() => void keepAsNew()} disabled={approving}>
          {approving ? "Salvando…" : "Manter como item novo"}
        </Button>
      ) : null}
    </section>
  );
}
