import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Barcode, Factory, FileText, Package, Ruler, Tag, Tags } from "lucide-react-native";
import { useEffect, useState } from "react";

import { AppButton, Field, PickerField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors } from "@/lib/theme";

export type MaterialDetail = NonNullable<FunctionReturnType<typeof api.materials.get>>;

const UNIT_OPTIONS = ["un", "m", "m²", "m³", "kg", "l", "pç", "cx", "rolo", "barra", "saco", "par", "jogo", "kit"];

/** Criar / editar material do catálogo (campos principais). */
export function MaterialFormSheet({
  open,
  onClose,
  material,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  material?: MaterialDetail | null;
  onSaved?: (id: MaterialDetail["_id"]) => void;
}) {
  const toast = useToast();
  const create = useMutation(api.materials.create);
  const update = useMutation(api.materials.update);
  const categories = useQuery(api.materials.listCategories, open ? {} : "skip");
  const isEdit = Boolean(material);

  const [name, setName] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [unit, setUnit] = useState<string | null>(null);
  const [manufacturer, setManufacturer] = useState("");
  const [spec, setSpec] = useState("");
  const [brand, setBrand] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(material?.name ?? "");
    setVariantLabel(material?.variantLabel ?? "");
    setSku(material?.sku ?? "");
    setCategory(material?.category ?? null);
    setCustomCategory("");
    setUnit(material?.unit ?? null);
    setManufacturer(material?.manufacturer ?? "");
    setSpec(material?.spec ?? "");
    setBrand(material?.brandPreference ?? "");
    setErrors({});
  }, [open, material]);

  const categoryOptions = [
    ...(categories ?? []).map((c) => ({ value: c, label: c })),
    { value: "__new__", label: "Outra categoria…" },
  ];
  const effectiveCategory = category === "__new__" ? customCategory.trim() : (category ?? "");

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Informe o nome";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        category: effectiveCategory || undefined,
        unit: unit ?? undefined,
        manufacturer: manufacturer.trim() || undefined,
        spec: spec.trim() || undefined,
        brandPreference: brand.trim() || undefined,
      };
      let id: MaterialDetail["_id"];
      if (material) {
        await update({ materialId: material._id, ...payload, variantLabel: variantLabel.trim() || null });
        id = material._id;
        toast.success("Material atualizado");
      } else {
        id = await create({ ...payload, variantLabel: variantLabel.trim() || undefined });
        toast.success("Material criado");
      }
      onClose();
      onSaved?.(id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o material"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar material" : "Novo material"}
      footer={<AppButton label={isEdit ? "Salvar alterações" : "Criar material"} onPress={() => void submit()} loading={saving} />}
    >
      <Field label="Nome *" icon={<Package size={24} color={iconColor} strokeWidth={1.6} />} value={name} onChangeText={setName} error={errors.name} placeholder="Ex: Tubo de cobre" autoFocus={!isEdit} />
      <Field label="Variante" icon={<Ruler size={24} color={iconColor} strokeWidth={1.6} />} value={variantLabel} onChangeText={setVariantLabel} placeholder='Ex: 3/8", 25 mm' helper="Tamanho, bitola ou especificação que diferencia este item." />
      <Field label="SKU / código" icon={<Barcode size={24} color={iconColor} strokeWidth={1.6} />} value={sku} onChangeText={setSku} autoCapitalize="characters" autoCorrect={false} helper={isEdit ? undefined : "Deixe vazio para gerar automaticamente."} />
      <PickerField label="Categoria" icon={<Tags size={24} color={iconColor} strokeWidth={1.6} />} value={category} onChange={setCategory} options={categoryOptions} searchable clearable loading={categories === undefined} />
      {category === "__new__" ? (
        <Field label="Nova categoria" value={customCategory} onChangeText={setCustomCategory} placeholder="Ex: Dutos, Elétrica" autoFocus />
      ) : null}
      <PickerField label="Unidade" icon={<Tag size={24} color={iconColor} strokeWidth={1.6} />} value={unit} onChange={setUnit} options={UNIT_OPTIONS.map((u) => ({ value: u, label: u }))} clearable />
      <Field label="Fabricante" icon={<Factory size={24} color={iconColor} strokeWidth={1.6} />} value={manufacturer} onChangeText={setManufacturer} />
      <Field label="Marca preferida" icon={<Factory size={24} color={iconColor} strokeWidth={1.6} />} value={brand} onChangeText={setBrand} />
      <Field label="Especificação" icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />} value={spec} onChangeText={setSpec} multiline />
    </Sheet>
  );
}
