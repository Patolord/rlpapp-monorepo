import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

export type MaterialCatalogRow = FunctionReturnType<
  typeof api.materials.listCatalog
>["page"][number];

export const UNIT_SUGGESTIONS = ["un", "m", "kg", "cx", "pct", "rolo", "m²", "L"];

export type MaterialFormValues = {
  name: string;
  variantLabel: string;
  widthMm: string;
  heightMm: string;
  lengthMm: string;
  thicknessMm: string;
  diameterMm: string;
  sku: string;
  barcode: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  category: string;
  unit: string;
  purchaseUnit: string;
  unitsPerPurchaseUnit: string;
  trackInventory: boolean;
  spec: string;
  brandPreference: string;
  technicalAttributes: string;
};

export const EMPTY_MATERIAL_FORM: MaterialFormValues = {
  name: "",
  variantLabel: "",
  widthMm: "",
  heightMm: "",
  lengthMm: "",
  thicknessMm: "",
  diameterMm: "",
  sku: "",
  barcode: "",
  manufacturer: "",
  manufacturerPartNumber: "",
  category: "",
  unit: "",
  purchaseUnit: "",
  unitsPerPurchaseUnit: "",
  trackInventory: true,
  spec: "",
  brandPreference: "",
  technicalAttributes: "",
};

export function parseTechnicalAttributes(
  input: string
): Array<{ key: string; value: string }> {
  if (!input.trim()) return [];
  return input
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0 || separator === part.length - 1) {
        throw new Error(
          `Atributo inválido: "${part}". Use o formato chave=valor.`
        );
      }
      return {
        key: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    });
}

function materialToForm(material: MaterialCatalogRow): MaterialFormValues {
  return {
    name: material.name,
    variantLabel: material.variantLabel ?? "",
    widthMm: material.dimensions?.widthMm
      ? String(material.dimensions.widthMm)
      : "",
    heightMm: material.dimensions?.heightMm
      ? String(material.dimensions.heightMm)
      : "",
    lengthMm: material.dimensions?.lengthMm
      ? String(material.dimensions.lengthMm)
      : "",
    thicknessMm: material.dimensions?.thicknessMm
      ? String(material.dimensions.thicknessMm)
      : "",
    diameterMm: material.dimensions?.diameterMm
      ? String(material.dimensions.diameterMm)
      : "",
    sku: material.sku ?? "",
    barcode: material.barcode ?? "",
    manufacturer: material.manufacturer ?? "",
    manufacturerPartNumber: material.manufacturerPartNumber ?? "",
    category: material.category ?? "",
    unit: material.unit ?? "",
    purchaseUnit: material.purchaseUnit ?? "",
    unitsPerPurchaseUnit:
      material.unitsPerPurchaseUnit != null
        ? String(material.unitsPerPurchaseUnit)
        : "",
    trackInventory: material.trackInventory,
    spec: material.spec ?? "",
    brandPreference: material.brandPreference ?? "",
    technicalAttributes: (material.technicalAttributes ?? [])
      .map((attribute) => `${attribute.key}=${attribute.value}`)
      .join("; "),
  };
}

function dimensionsFromForm(form: MaterialFormValues) {
  const parse = (value: string) =>
    value.trim() ? Number.parseFloat(value.replace(",", ".")) : undefined;
  const dimensions = {
    widthMm: parse(form.widthMm),
    heightMm: parse(form.heightMm),
    lengthMm: parse(form.lengthMm),
    thicknessMm: parse(form.thicknessMm),
    diameterMm: parse(form.diameterMm),
  };
  return Object.values(dimensions).some((value) => value !== undefined)
    ? dimensions
    : undefined;
}

type MaterialFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: MaterialCatalogRow | null;
  onSaved?: () => void;
};

export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
  onSaved,
}: MaterialFormDialogProps) {
  const createMaterial = useMutation(api.materials.create);
  const updateMaterial = useMutation(api.materials.update);
  const [form, setForm] = useState<MaterialFormValues>(EMPTY_MATERIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = material != null;
  const dimensions = dimensionsFromForm(form);
  const duplicateCandidates = useQuery(
    api.materials.findDuplicateCandidates,
    form.name.trim().length >= 2
      ? {
          name: form.name,
          variantLabel: form.variantLabel || undefined,
          manufacturer: form.manufacturer || undefined,
          manufacturerPartNumber: form.manufacturerPartNumber || undefined,
          unit: form.unit || undefined,
          dimensions,
          excludeMaterialId: material?._id,
        }
      : "skip"
  );

  useEffect(() => {
    if (open) {
      setForm(material ? materialToForm(material) : EMPTY_MATERIAL_FORM);
    }
  }, [open, material]);

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      const technicalAttributes = parseTechnicalAttributes(
        form.technicalAttributes
      );
      const submittedDimensions = dimensionsFromForm(form);
      const unitsPerPurchaseUnit = form.unitsPerPurchaseUnit.trim()
        ? Number.parseFloat(form.unitsPerPurchaseUnit)
        : undefined;

      if (isEdit && material) {
        await updateMaterial({
          materialId: material._id,
          name: form.name,
          variantLabel: form.variantLabel || null,
          dimensions: submittedDimensions ?? null,
          sku: form.sku || undefined,
          barcode: form.barcode.trim() ? form.barcode : null,
          manufacturer: form.manufacturer || undefined,
          manufacturerPartNumber: form.manufacturerPartNumber || undefined,
          category: form.category || undefined,
          unit: form.unit || undefined,
          purchaseUnit: form.purchaseUnit || undefined,
          unitsPerPurchaseUnit,
          trackInventory: form.trackInventory,
          spec: form.spec || undefined,
          brandPreference: form.brandPreference || undefined,
          technicalAttributes,
        });
        toast.success("Material atualizado");
      } else {
        await createMaterial({
          name: form.name,
          variantLabel: form.variantLabel || undefined,
          dimensions: submittedDimensions,
          sku: form.sku.trim() || undefined,
          barcode: form.barcode || undefined,
          manufacturer: form.manufacturer || undefined,
          manufacturerPartNumber: form.manufacturerPartNumber || undefined,
          category: form.category || undefined,
          unit: form.unit || undefined,
          purchaseUnit: form.purchaseUnit || undefined,
          unitsPerPurchaseUnit,
          trackInventory: form.trackInventory,
          spec: form.spec || undefined,
          brandPreference: form.brandPreference || undefined,
          technicalAttributes,
        });
        toast.success("Material criado");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(
        getErrorMessage(error, isEdit ? "Erro ao atualizar material" : "Erro ao criar material")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar material" : "Novo material"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Identificação</h3>
            <div>
              <Label>Família / nome-base</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div>
              <Label>Detalhe da variante</Label>
              <Input
                value={form.variantLabel}
                onChange={(event) =>
                  setForm({ ...form, variantLabel: event.target.value })
                }
                placeholder="Ex.: Branca, MAXX 150, 3x2,5 mm²"
              />
            </div>
            {(duplicateCandidates ?? []).length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-medium">Materiais semelhantes encontrados</p>
                <ul className="mt-1 space-y-1">
                  {(duplicateCandidates ?? []).map((candidate) => (
                    <li key={candidate.materialId}>
                      {candidate.name}
                      {candidate.variantLabel
                        ? ` — ${candidate.variantLabel}`
                        : ""}{" "}
                      ({candidate.sku ?? "sem SKU"})
                      {candidate.exact ? " · duplicata exata" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>SKU</Label>
                <Input
                  value={form.sku}
                  onChange={(event) =>
                    setForm({ ...form, sku: event.target.value })
                  }
                  placeholder={isEdit ? undefined : "Gerado automaticamente"}
                />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input
                  value={form.barcode}
                  onChange={(event) =>
                    setForm({ ...form, barcode: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Fabricante</Label>
                <Input
                  value={form.manufacturer}
                  onChange={(event) =>
                    setForm({ ...form, manufacturer: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Código do fabricante</Label>
                <Input
                  value={form.manufacturerPartNumber}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      manufacturerPartNumber: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Unidades e embalagem</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Unidade de estoque</Label>
                <Input
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                  placeholder="un, m, kg..."
                  list="material-unit-suggestions"
                />
              </div>
              <div>
                <Label>Unidade de compra</Label>
                <Input
                  value={form.purchaseUnit}
                  onChange={(event) =>
                    setForm({ ...form, purchaseUnit: event.target.value })
                  }
                  placeholder="cx, rolo..."
                  list="material-unit-suggestions"
                />
              </div>
            </div>
            <datalist id="material-unit-suggestions">
              {UNIT_SUGGESTIONS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
            <div>
              <Label>Unidades por embalagem</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.unitsPerPurchaseUnit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    unitsPerPurchaseUnit: event.target.value,
                  })
                }
                placeholder="Ex.: 100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.trackInventory}
                onChange={(event) =>
                  setForm({ ...form, trackInventory: event.target.checked })
                }
              />
              Controlar estoque deste material
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Dados técnicos</h3>
            <div>
              <Label>Dimensões padronizadas (mm)</Label>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["widthMm", "Largura"],
                  ["heightMm", "Altura"],
                  ["lengthMm", "Comprimento"],
                  ["thicknessMm", "Espessura"],
                  ["diameterMm", "Diâmetro"],
                ].map(([field, label]) => (
                  <Input
                    key={field}
                    type="number"
                    min="0"
                    step="any"
                    aria-label={`${label} em milímetros`}
                    placeholder={label}
                    value={form[field as keyof MaterialFormValues] as string}
                    onChange={(event) =>
                      setForm({ ...form, [field]: event.target.value })
                    }
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Especificação</Label>
              <Input
                value={form.spec}
                onChange={(event) =>
                  setForm({ ...form, spec: event.target.value })
                }
              />
            </div>
            <div>
              <Label>Marca preferida</Label>
              <Input
                value={form.brandPreference}
                onChange={(event) =>
                  setForm({ ...form, brandPreference: event.target.value })
                }
              />
            </div>
            <div>
              <Label>Atributos técnicos</Label>
              <Textarea
                value={form.technicalAttributes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    technicalAttributes: event.target.value,
                  })
                }
                placeholder="tensao=220v; fase=trifasico"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Usados nas regras de compatibilidade do Estoque.
              </p>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type MaterialFormDialogMaterialId = Id<"materials">;
