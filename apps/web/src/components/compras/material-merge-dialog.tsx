import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

type MergeCandidate = {
  _id: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
};

type MaterialMergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: MergeCandidate;
  onMerged: (targetId: Id<"materials">) => void;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function MaterialMergeDialog({
  open,
  onOpenChange,
  current,
  onMerged,
}: MaterialMergeDialogProps) {
  const mergeMaterials = useMutation(api.materials.merge);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term, 300);
  const [selected, setSelected] = useState<MergeCandidate | null>(null);
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const trimmedTerm = debouncedTerm.trim();
  const suggestions = useQuery(
    api.materials.suggest,
    open && trimmedTerm.length >= 2 ? { term: trimmedTerm, limit: 8 } : "skip"
  );

  const sourceId = keepCurrent ? selected?._id : current._id;
  const targetId = keepCurrent ? current._id : selected?._id;
  const preview = useQuery(
    api.materials.mergePreview,
    open && sourceId && targetId && sourceId !== targetId
      ? { sourceId, targetId }
      : "skip"
  );

  useEffect(() => {
    if (!open) {
      setTerm("");
      setSelected(null);
      setKeepCurrent(true);
      setSubmitting(false);
    }
  }, [open]);

  const otherOptions = (suggestions ?? []).filter(
    (item) => item._id !== current._id
  );

  async function handleConfirm() {
    if (!sourceId || !targetId) return;
    setSubmitting(true);
    try {
      const result = await mergeMaterials({ sourceId, targetId });
      toast.success("Materiais mesclados");
      onMerged(result.targetId);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao mesclar materiais"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mesclar materiais</DialogTitle>
          <DialogDescription>
            Junta estoque, histórico e aliases no cadastro que permanecer. O
            outro é arquivado. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="merge-search">Buscar o outro cadastro</Label>
            <Input
              id="merge-search"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setSelected(null);
              }}
              placeholder="Nome, SKU ou alias"
            />
            {otherOptions.length > 0 ? (
              <ul className="max-h-40 overflow-y-auto rounded-md border">
                {otherOptions.map((item) => (
                  <li key={item._id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() =>
                        setSelected({
                          _id: item._id,
                          name: item.name,
                          variantLabel: item.variantLabel,
                          sku: item.sku,
                        })
                      }
                    >
                      {formatMaterialTitle(item.name, item.variantLabel)}
                      {item.sku ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.sku}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {selected ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Qual permanece?</legend>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input
                  type="radio"
                  name="merge-keep"
                  checked={keepCurrent}
                  onChange={() => setKeepCurrent(true)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Este cadastro</span>
                  <span className="block text-muted-foreground">
                    {formatMaterialTitle(current.name, current.variantLabel)}
                    {current.sku ? ` · ${current.sku}` : ""}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input
                  type="radio"
                  name="merge-keep"
                  checked={!keepCurrent}
                  onChange={() => setKeepCurrent(false)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">O outro cadastro</span>
                  <span className="block text-muted-foreground">
                    {formatMaterialTitle(selected.name, selected.variantLabel)}
                    {selected.sku ? ` · ${selected.sku}` : ""}
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {preview && preview.ok === false ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : null}

          {preview && preview.ok ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">Saldos após a mescla</p>
              {preview.locations.length === 0 ? (
                <p className="text-muted-foreground">Nenhum saldo em estoque.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.locations.map((location) => (
                    <li key={location.locationId}>
                      {location.locationName}: {location.sourceQuantity} +{" "}
                      {location.targetQuantity} → {location.mergedQuantity}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground">
                Takeoffs: {preview.takeoffItemCount} · Preços:{" "}
                {preview.priceEventCount} · Fornecedores: {preview.offeringCount}{" "}
                · Aliases: {preview.aliasCount}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={!selected || submitting || preview?.ok !== true}
          >
            {submitting ? "Mesclando..." : "Confirmar mescla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
