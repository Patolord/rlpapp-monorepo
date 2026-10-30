import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Calendar, Hash, Ruler, StickyNote, Tag, Truck, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Field, PickerField, SegmentedField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseCurrencyInput, parseDateInput, toDateInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { MaterialPickerField, type PickedMaterial } from "./material-picker";

type Source = "manual" | "quote" | "purchase" | "invoice";

function parseMm(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Registrar um preço (cotação, compra, nota) para um material. */
export function PriceEventFormSheet({ open, onClose, initialMaterial }: { open: boolean; onClose: () => void; initialMaterial?: PickedMaterial | null }) {
  const toast = useToast();
  const add = useMutation(api.priceEvents.add);
  const suppliers = useQuery(api.suppliers.list, open ? { activeOnly: true } : "skip");

  const [material, setMaterial] = useState<PickedMaterial | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierRaw, setSupplierRaw] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState<Source>("quote");
  const [occurredAt, setOccurredAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [diameterMm, setDiameterMm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMaterial(initialMaterial ?? null);
    setUnit(initialMaterial?.unit ?? "");
    setSupplierId(null);
    setSupplierRaw("");
    setPrice("");
    setQuantity("");
    setSource("quote");
    setOccurredAt(toDateInput(Date.now()));
    setValidUntil("");
    setNotes("");
    setWidthMm("");
    setHeightMm("");
    setLengthMm("");
    setDiameterMm("");
    setErrors({});
  }, [open, initialMaterial]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!material) nextErrors.material = "Escolha o material";
    if (!supplierId && !supplierRaw.trim()) nextErrors.supplier = "Informe o fornecedor";
    const cents = parseCurrencyInput(price);
    if (cents === null || cents <= 0) nextErrors.price = "Informe o preço unitário";
    const date = parseDateInput(occurredAt);
    if (date === null) nextErrors.occurredAt = "Data inválida (dd/mm/aaaa)";
    if (validUntil && parseDateInput(validUntil) === null) nextErrors.validUntil = "Data inválida";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const qty = quantity.trim() ? Number.parseFloat(quantity.replace(",", ".")) : undefined;
      const dimensions = {
        widthMm: parseMm(widthMm),
        heightMm: parseMm(heightMm),
        lengthMm: parseMm(lengthMm),
        diameterMm: parseMm(diameterMm),
      };
      const hasDimensions = Object.values(dimensions).some((value) => value !== undefined);
      await add({
        materialId: material!.materialId,
        supplierId: (supplierId as Id<"suppliers"> | null) ?? undefined,
        supplierNameRaw: supplierId ? undefined : supplierRaw.trim(),
        unitPriceCents: cents!,
        unit: unit.trim() || undefined,
        quantity: qty !== undefined && Number.isFinite(qty) ? qty : undefined,
        source,
        occurredAt: date!,
        validUntil: validUntil ? (parseDateInput(validUntil) ?? undefined) : undefined,
        notes: notes.trim() || undefined,
        dimensions: hasDimensions ? dimensions : undefined,
      });
      toast.success("Preço registrado");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível registrar o preço"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet open={open} onClose={onClose} title="Novo preço" subtitle="Cotação, compra ou nota fiscal de um material." footer={<AppButton label="Registrar preço" onPress={() => void submit()} loading={saving} />}>
      <MaterialPickerField value={material} onChange={(m) => { setMaterial(m); if (m?.unit && !unit) setUnit(m.unit); }} error={errors.material} />
      <PickerField
        label="Fornecedor"
        icon={<Truck size={24} color={iconColor} strokeWidth={1.6} />}
        value={supplierId}
        onChange={setSupplierId}
        options={(suppliers ?? []).map((s) => ({ value: s._id as string, label: s.name, description: s.categories?.join(", ") }))}
        loading={suppliers === undefined}
        searchable
        clearable
        placeholder="Selecionar cadastrado"
        error={supplierId ? undefined : errors.supplier}
      />
      {!supplierId ? (
        <Field label="Ou nome do fornecedor" icon={<Truck size={24} color={iconColor} strokeWidth={1.6} />} value={supplierRaw} onChangeText={setSupplierRaw} placeholder="Fornecedor não cadastrado" />
      ) : null}
      <Field label="Preço unitário (R$) *" icon={<Wallet size={24} color={iconColor} strokeWidth={1.6} />} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0,00" error={errors.price} />
      <Field label="Unidade" icon={<Tag size={24} color={iconColor} strokeWidth={1.6} />} value={unit} onChangeText={setUnit} placeholder="un, m, kg" />
      <Field label="Quantidade cotada" icon={<Hash size={24} color={iconColor} strokeWidth={1.6} />} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
      <SegmentedField<Source>
        label="Origem"
        value={source}
        onChange={setSource}
        options={[
          { value: "quote", label: "Cotação" },
          { value: "purchase", label: "Compra" },
          { value: "invoice", label: "Nota" },
          { value: "manual", label: "Manual" },
        ]}
      />
      <Field label="Data *" icon={<Calendar size={24} color={iconColor} strokeWidth={1.6} />} value={occurredAt} onChangeText={(v) => setOccurredAt(maskDateInput(v))} keyboardType="number-pad" placeholder="dd/mm/aaaa" error={errors.occurredAt} />
      <Field label="Válido até" icon={<Calendar size={24} color={iconColor} strokeWidth={1.6} />} value={validUntil} onChangeText={(v) => setValidUntil(maskDateInput(v))} keyboardType="number-pad" placeholder="dd/mm/aaaa" error={errors.validUntil} />
      <View style={styles.dimensionsHeader}>
        <Ruler size={18} color={iconColor} strokeWidth={1.6} />
        <Text style={[type.label, { color: colors.textSecondary }]}>Medidas (mm), para itens sob medida</Text>
      </View>
      <View style={styles.dimensionsRow}>
        <Field label="Largura" size="md" value={widthMm} onChangeText={setWidthMm} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Field label="Altura" size="md" value={heightMm} onChangeText={setHeightMm} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <View style={styles.dimensionsRow}>
        <Field label="Comprimento" size="md" value={lengthMm} onChangeText={setLengthMm} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Field label="Diâmetro" size="md" value={diameterMm} onChangeText={setDiameterMm} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Field label="Observações" icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dimensionsHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, marginLeft: 4 },
  dimensionsRow: { flexDirection: "row", gap: space.sm },
});
