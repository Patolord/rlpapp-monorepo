import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/material-import";
import { cn } from "@/lib/utils";

const UNIT_SUGGESTIONS = ["un", "m", "kg", "cx", "pct", "rolo", "m²", "L"];

const CATEGORY_SUGGESTIONS = [
  "Ar Condicionado",
  "Bocas de Ar",
  "Dutos e Conexões",
  "Detecção e Alarme",
  "Equipamentos de Ventilação",
  "Filtragem",
  "Dampers",
  "Elétrica",
  "Fixação",
];

export type PickedMaterial = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
};

export function MaterialPickerField({
  value,
  onChange,
  canQuickCreate,
}: {
  value: PickedMaterial | null;
  onChange: (material: PickedMaterial) => void;
  canQuickCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center rounded-lg border bg-background px-3 py-2 text-left text-sm"
      >
        {value ? (
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {formatMaterialLabel(value.name, value.variantLabel)}
            </span>
            {value.unit ? (
              <span className="text-xs text-muted-foreground">{value.unit}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">Buscar material</span>
        )}
      </button>
      <MaterialPickerSheet
        open={open}
        onOpenChange={setOpen}
        canQuickCreate={canQuickCreate}
        onPick={(material) => {
          onChange(material);
          setOpen(false);
        }}
      />
    </>
  );
}

function MaterialPickerSheet({
  open,
  onOpenChange,
  canQuickCreate,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canQuickCreate: boolean;
  onPick: (material: PickedMaterial) => void;
}) {
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const trimmed = term.trim();
  const suggestions = useQuery(
    api.materials.suggest,
    open && trimmed.length >= 2 ? { term: trimmed, limit: 12 } : "skip"
  );

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setTerm("");
      setCreating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Material</SheetTitle>
          <SheetDescription>
            Busque pelo nome, SKU, bitola ou apelido.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative px-4 pt-3">
            <Search className="pointer-events-none absolute top-6 left-7 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setCreating(false);
              }}
              placeholder="Ex.: cobre 1/4, grelha 150x150"
              className="h-12 pl-9 text-base"
            />
          </div>

          {creating && canQuickCreate ? (
            <QuickCreatePanel
              initialName={trimmed}
              onCreated={onPick}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {trimmed.length < 2 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Digite pelo menos 2 caracteres para buscar.
                </p>
              ) : suggestions === undefined ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Buscando...
                </p>
              ) : suggestions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum material encontrado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {suggestions.map((item) => (
                    <li key={item._id}>
                      <button
                        type="button"
                        onClick={() =>
                          onPick({
                            materialId: item._id,
                            name: item.name,
                            variantLabel: item.variantLabel,
                            unit: item.unit,
                          })
                        }
                        className="flex min-h-14 w-full flex-col items-start rounded-xl border bg-background px-3 py-2 text-left"
                      >
                        <span className="font-medium">
                          {formatMaterialLabel(item.name, item.variantLabel)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[item.sku, item.unit].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canQuickCreate && !creating ? (
            <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                onClick={() => setCreating(true)}
              >
                <Plus className="mr-2 size-4" />
                {trimmed
                  ? `Criar “${trimmed}”`
                  : "Criar material"}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuickCreatePanel({
  initialName,
  onCreated,
}: {
  initialName: string;
  onCreated: (material: PickedMaterial) => void;
}) {
  const quickCreate = useMutation(api.inventory.quickCreateMaterial);
  const [name, setName] = useState(initialName);
  const [variantLabel, setVariantLabel] = useState("");
  const [unit, setUnit] = useState("un");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const duplicates = useQuery(
    api.materials.findDuplicateCandidates,
    name.trim()
      ? {
          name: name.trim(),
          variantLabel: variantLabel.trim() || undefined,
          unit: unit.trim() || undefined,
        }
      : "skip"
  );

  const exactDuplicate = useMemo(
    () => duplicates?.find((candidate) => candidate.exact),
    [duplicates]
  );

  async function submit() {
    if (!name.trim()) {
      toast.error("Informe o nome do material");
      return;
    }
    setSubmitting(true);
    try {
      const created = await quickCreate({
        name: name.trim(),
        variantLabel: variantLabel.trim() || undefined,
        unit: unit.trim() || undefined,
        category: category.trim() || undefined,
      });
      onCreated({
        materialId: created.materialId,
        name: created.name,
        variantLabel: created.variantLabel,
        unit: created.unit,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar material"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="quick-name">Nome da família</Label>
          <Input
            id="quick-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Tubo de Cobre"
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-variant">Variante (tamanho, bitola, acabamento)</Label>
          <Input
            id="quick-variant"
            value={variantLabel}
            onChange={(event) => setVariantLabel(event.target.value)}
            placeholder='Ex.: Split – 1/4" ou Branca 150x150 mm'
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <div className="flex flex-wrap gap-2">
            {UNIT_SUGGESTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setUnit(option)}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm",
                  unit === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Categoria (opcional)</Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_SUGGESTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() =>
                  setCategory((current) => (current === option ? "" : option))
                }
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm",
                  category === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {exactDuplicate ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Já existe {formatMaterialLabel(exactDuplicate.name, exactDuplicate.variantLabel)}.
            Use a busca para selecioná-lo.
          </p>
        ) : duplicates && duplicates.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Materiais parecidos:{" "}
            {duplicates
              .slice(0, 3)
              .map((item) => formatMaterialLabel(item.name, item.variantLabel))
              .join("; ")}
          </p>
        ) : null}
      </div>
      <div className="mt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={() => void submit()}
          disabled={submitting || Boolean(exactDuplicate)}
        >
          {submitting ? "Criando..." : "Criar e usar"}
        </Button>
      </div>
    </div>
  );
}
