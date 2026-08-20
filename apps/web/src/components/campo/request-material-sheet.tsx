import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { QuantityStepper } from "@/components/campo/quantity-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/material-import";
import { cn } from "@/lib/utils";

type CatalogMaterial = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
};

type DraftLine = CatalogMaterial & {
  quantity: number;
  reason: "replenishment" | "new";
  markedDepleted: boolean;
};

export function RequestMaterialSheet({
  open,
  onOpenChange,
  projectId,
  initialMaterial,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<"projects">;
  initialMaterial?: DraftLine | null;
  onSubmitted?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<CatalogMaterial | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const createRequest = useMutation(api.inventoryRequests.createRequest);
  const suggestions = useQuery(
    api.inventoryRequests.listPickerSuggestions,
    open ? { projectId } : "skip"
  );
  const catalog = useQuery(
    api.inventoryRequests.searchCatalog,
    open && search.trim().length >= 2 ? { search: search.trim() } : "skip"
  );

  const trimmed = search.trim();

  useEffect(() => {
    if (!open) return;
    if (initialMaterial) {
      setSelected(initialMaterial);
      setQuantity(initialMaterial.quantity);
    }
  }, [open, initialMaterial]);

  const visibleSuggestions = useMemo(() => {
    const recents = suggestions?.recents ?? [];
    const common = (suggestions?.common ?? []).filter(
      (item) => !recents.some((recent) => recent.materialId === item.materialId)
    );
    return { recents, common };
  }, [suggestions]);

  function reset() {
    setSearch("");
    setQuantity(1);
    setSelected(null);
    setLines([]);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      reset();
      return;
    }
    if (initialMaterial) {
      setSelected(initialMaterial);
      setQuantity(initialMaterial.quantity);
      setLines([]);
    }
  }

  function lineMeta(materialId: Id<"materials">) {
    if (initialMaterial?.materialId === materialId) {
      return {
        reason: initialMaterial.reason,
        markedDepleted: initialMaterial.markedDepleted,
      };
    }
    const onObra = (suggestions?.common ?? []).some(
      (item) => item.materialId === materialId
    );
    return {
      reason: onObra ? ("replenishment" as const) : ("new" as const),
      markedDepleted: false,
    };
  }

  function addSelected() {
    const material = selected;
    if (!material) {
      toast.error("Escolha um material");
      return;
    }
    const meta = lineMeta(material.materialId);
    setLines((current) => {
      const existing = current.find(
        (line) => line.materialId === material.materialId
      );
      if (existing) {
        return current.map((line) =>
          line.materialId === material.materialId
            ? { ...line, quantity: line.quantity + quantity }
            : line
        );
      }
      return [
        ...current,
        {
          ...material,
          quantity,
          ...meta,
        },
      ];
    });
    setSelected(null);
    setQuantity(1);
    setSearch("");
  }

  async function submit() {
    const payload = lines.length > 0
      ? lines
      : selected
        ? [
            {
              ...selected,
              quantity,
              ...lineMeta(selected.materialId),
            },
          ]
        : [];
    if (payload.length === 0) {
      toast.error("Adicione pelo menos um material");
      return;
    }
    setSubmitting(true);
    try {
      await createRequest({
        projectId,
        items: payload.map((line) => ({
          materialId: line.materialId,
          quantity: line.quantity,
          reason: line.reason,
          markedDepleted: line.markedDepleted,
        })),
      });
      toast.success("Pedido enviado para o escritório");
      reset();
      onOpenChange(false);
      onSubmitted?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível enviar o pedido"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-base">Pedir material</SheetTitle>
          <SheetDescription>
            Recentes e itens da obra primeiro. Só o catálogo da empresa.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="relative px-4 pt-3">
            <Search className="pointer-events-none absolute top-6 left-7 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar no catálogo"
              className="h-12 pl-9 text-base"
            />
          </div>

          {trimmed.length < 2 ? (
            <div className="space-y-4 px-4 py-4">
              {visibleSuggestions.recents.length > 0 && (
                <ChipGroup
                  title="Recentes"
                  items={visibleSuggestions.recents}
                  selectedId={selected?.materialId ?? null}
                  onPick={setSelected}
                />
              )}
              {visibleSuggestions.common.length > 0 && (
                <ChipGroup
                  title="Nesta obra"
                  items={visibleSuggestions.common}
                  selectedId={selected?.materialId ?? null}
                  onPick={setSelected}
                />
              )}
              {suggestions &&
                visibleSuggestions.recents.length === 0 &&
                visibleSuggestions.common.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Digite para buscar no catálogo.
                  </p>
                )}
            </div>
          ) : catalog === undefined ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Buscando...
            </p>
          ) : catalog.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum material encontrado.
            </p>
          ) : (
            <div className="space-y-2 px-4 py-3">
              {catalog.map((item) => (
                <button
                  key={item.materialId}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-3 text-left",
                    selected?.materialId === item.materialId
                      ? "border-primary bg-primary/5"
                      : "bg-background"
                  )}
                >
                  <p className="font-medium">
                    {formatMaterialLabel(item.name, item.variantLabel)}
                  </p>
                  {item.unit ? (
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-3 border-t px-4 py-4">
              <p className="text-sm font-medium">
                {formatMaterialLabel(selected.name, selected.variantLabel)}
              </p>
              <QuantityStepper value={quantity} onChange={setQuantity} />
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                onClick={addSelected}
              >
                Adicionar ao pedido
              </Button>
            </div>
          )}

          {lines.length > 0 && (
            <div className="space-y-2 border-t px-4 py-4">
              <p className="text-sm font-medium">Neste pedido</p>
              {lines.map((line) => (
                <div
                  key={line.materialId}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {formatMaterialLabel(line.name, line.variantLabel)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantity} {line.unit ?? ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    onClick={() =>
                      setLines((current) =>
                        current.filter(
                          (item) => item.materialId !== line.materialId
                        )
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <SheetFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            className="h-12 w-full text-base"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Enviando..." : "Enviar pedido"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ChipGroup({
  title,
  items,
  selectedId,
  onPick,
}: {
  title: string;
  items: CatalogMaterial[];
  selectedId: Id<"materials"> | null;
  onPick: (item: CatalogMaterial) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.materialId}
            type="button"
            onClick={() => onPick(item)}
            className={cn(
              "rounded-full border px-4 py-2.5 text-sm",
              selectedId === item.materialId
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent"
            )}
          >
            {formatMaterialLabel(item.name, item.variantLabel)}
          </button>
        ))}
      </div>
    </div>
  );
}
