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
import { getErrorMessage } from "@/lib/errors";
import {
  centsToLaborPriceInput,
  parseLaborPriceInput,
} from "@/lib/labor-price";
import { uploadPhotos } from "@/lib/upload-photos";

import {
  MaterialBudgetSection,
  MaterialIdentificationFields,
  MaterialTechnicalSection,
  MaterialUnitsSection,
} from "./material-form-sections";
import { MaterialImageField } from "./material-image-field";

export type MaterialCatalogRow = FunctionReturnType<
  typeof api.materials.listCatalog
>["page"][number];

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
  /** Mão de obra por unidade, em reais ("45,50"); vazio = sem preço. */
  laborPrice: string;
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
  laborPrice: "",
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
    laborPrice: centsToLaborPriceInput(material.laborPriceCents),
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
  const generateUploadUrl = useMutation(api.materials.generateUploadUrl);
  const families = useQuery(api.materials.listFamilies, { activeOnly: true });
  const [form, setForm] = useState<MaterialFormValues>(EMPTY_MATERIAL_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = material != null;
  const dimensions = dimensionsFromForm(form);
  const selectedFamily = (families ?? []).find(
    (family) =>
      family.name.localeCompare(form.name.trim(), "pt-BR", {
        sensitivity: "base",
      }) === 0
  );
  const duplicateCandidates = useQuery(
    api.materials.findDuplicateCandidates,
    form.name.trim().length >= 2
      ? {
          name: form.name,
          familyId: selectedFamily?._id,
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
      setImageFile(null);
      setImageRemoved(false);
    }
  }, [open, material]);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreviewUrl(
      imageRemoved ? null : (material?.imageUrl ?? null)
    );
    return undefined;
  }, [imageFile, imageRemoved, material?.imageUrl]);

  async function resolveImageId(): Promise<
    Id<"_storage"> | null | undefined
  > {
    if (imageFile) {
      const [storageId] = await uploadPhotos(generateUploadUrl, [imageFile]);
      if (!storageId) throw new Error("Falha no upload da imagem");
      return storageId;
    }
    if (imageRemoved) return null;
    return undefined;
  }

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
      const laborPriceCents = parseLaborPriceInput(form.laborPrice);
      const imageId = await resolveImageId();

      if (isEdit && material) {
        await updateMaterial({
          materialId: material._id,
          name: form.name,
          familyId: selectedFamily?._id,
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
          laborPriceCents,
          ...(imageId !== undefined ? { imageId } : {}),
        });
        toast.success("Material atualizado");
      } else {
        await createMaterial({
          name: form.name,
          familyId: selectedFamily?._id,
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
          ...(laborPriceCents !== null ? { laborPriceCents } : {}),
          ...(imageId ? { imageId } : {}),
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
            <MaterialIdentificationFields
              form={form}
              setForm={setForm}
              families={families}
              duplicateCandidates={duplicateCandidates}
              isEdit={isEdit}
            />
            <MaterialImageField
              imagePreviewUrl={imagePreviewUrl}
              onSelect={(file) => {
                setImageFile(file);
                setImageRemoved(false);
              }}
              onRemove={() => {
                setImageFile(null);
                setImageRemoved(true);
              }}
            />
          </section>

          <MaterialUnitsSection form={form} setForm={setForm} />

          <MaterialBudgetSection
            form={form}
            setForm={setForm}
            laborPriceUpdatedAt={material?.laborPriceUpdatedAt}
          />

          <MaterialTechnicalSection form={form} setForm={setForm} />
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
