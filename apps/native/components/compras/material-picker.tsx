import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Package, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { AppButton, Banner, EmptyState, Field, LoadingState, SearchField, Sheet, Surface } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/format";
import { colors, control, radius, space, type } from "@/lib/theme";

export type PickedMaterial = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
  sku?: string | null;
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Seletor de material com busca no catálogo (servidor). Visual de Field com
 * label flutuante; abre um sheet com a busca.
 */
export function MaterialPickerField({
  label = "Material",
  value,
  onChange,
  error,
  disabled,
  containerStyle,
}: {
  label?: string;
  value: PickedMaterial | null;
  onChange: (material: PickedMaterial | null) => void;
  error?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${formatMaterialLabel(value.name, value.variantLabel)}` : label}
        style={({ pressed }) => [
          styles.field,
          { borderColor: error ? colors.destructive : colors.controlBorder, backgroundColor: disabled ? colors.controlDisabled : pressed ? colors.surfacePressed : colors.surface },
        ]}
      >
        <Package size={20} color={colors.icon} strokeWidth={1.8} />
        <Text style={[styles.value, { color: value ? colors.text : colors.textSecondary }]} numberOfLines={1}>
          {value ? formatMaterialLabel(value.name, value.variantLabel) : "Buscar no catálogo"}
        </Text>
        <ChevronDown size={20} color={colors.icon} />
      </Pressable>
      {error ? <Text style={[type.bodySm, { color: colors.destructive }]}>{error}</Text> : null}
      <MaterialPickerSheet open={open} onClose={() => setOpen(false)} selectedId={value?.materialId ?? null} onPick={onChange} />
    </View>
  );
}

export function MaterialPickerSheet({
  open,
  onClose,
  selectedId,
  onPick,
  title = "Escolher material",
}: {
  open: boolean;
  onClose: () => void;
  selectedId: Id<"materials"> | null;
  onPick: (material: PickedMaterial) => void;
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 250);
  const results = useQuery(api.inventory.listMaterialOptions, open ? { search: debounced || undefined } : "skip");
  const access = useQuery(api.inventory.getAccess, open ? {} : "skip");
  const [creating, setCreating] = useState(false);

  function pick(material: PickedMaterial) {
    onPick(material);
    onClose();
    setSearch("");
    setCreating(false);
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setSearch("");
        setCreating(false);
      }}
      title={creating ? "Criar material" : title}
      maxHeight={0.9}
    >
      {creating ? (
        <QuickCreateMaterial initialName={search.trim()} onCreated={pick} onCancel={() => setCreating(false)} />
      ) : (
        <>
      <SearchField value={search} onChangeText={setSearch} placeholder="Nome, variante, SKU ou categoria" autoFocus />
      {results === undefined ? (
        <LoadingState style={{ flex: 0, paddingVertical: space.xl }} />
      ) : results.length === 0 ? (
        <EmptyState title="Nenhum material" description={debounced ? "Nada no catálogo com essa busca." : "O catálogo está vazio."} />
      ) : (
        <Surface padded={false}>
          {results.slice(0, 60).map((item, index) => {
            const active = item._id === selectedId;
            return (
              <Pressable
                key={item._id}
                onPress={() => pick({ materialId: item._id, name: item.name, variantLabel: item.variantLabel, unit: item.unit, sku: item.sku })}
                style={({ pressed }) => [styles.option, index > 0 && styles.optionBorder, pressed && { backgroundColor: colors.surfacePressed }, active && { backgroundColor: colors.primarySoft }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
                    {formatMaterialLabel(item.name, item.variantLabel)}
                  </Text>
                  <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {[item.sku, item.category, item.unit].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {active ? <Check size={20} color={colors.primary} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </Surface>
      )}
      {access?.canQuickCreateMaterial && debounced ? (
        <AppButton label={`Criar material “${debounced}”`} variant="ghost" block icon={<Plus size={18} color={colors.primary} />} onPress={() => setCreating(true)} />
      ) : null}
        </>
      )}
    </Sheet>
  );
}

/**
 * Criar material no seletor (ficha E8): confere parecidos no catálogo antes
 * de criar, para não duplicar.
 */
function QuickCreateMaterial({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (material: PickedMaterial) => void;
  onCancel: () => void;
}) {
  const quickCreate = useMutation(api.inventory.quickCreateMaterial);
  const [name, setName] = useState(initialName);
  const [variant, setVariant] = useState("");
  const [unit, setUnit] = useState("");
  const [checked, setChecked] = useState<{ name: string; variant: string; unit: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = useQuery(
    api.materials.findDuplicateCandidates,
    checked ? { name: checked.name, variantLabel: checked.variant || undefined, unit: checked.unit || undefined } : "skip"
  );
  const current = { name: name.trim(), variant: variant.trim(), unit: unit.trim() };
  const upToDate = checked !== null && checked.name === current.name && checked.variant === current.variant && checked.unit === current.unit;

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const created = await quickCreate({ name: current.name, variantLabel: current.variant || undefined, unit: current.unit || undefined });
      onCreated({ materialId: created.materialId, name: created.name, variantLabel: created.variantLabel, unit: created.unit, sku: created.sku });
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para criar o material. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: space.lg }}>
      <Field label="Nome" value={name} onChangeText={setName} autoFocus error={!current.name && checked ? "Informe o nome" : undefined} />
      <Field label="Variação (opcional)" value={variant} onChangeText={setVariant} placeholder="Ex.: 1/4, 220 V, 3 m" />
      <Field label="Unidade (opcional)" value={unit} onChangeText={setUnit} placeholder="Ex.: m, un, kg" autoCapitalize="none" />

      {upToDate && candidates !== undefined && candidates.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Banner tone="warning" title="Já existe algo parecido no catálogo" detail="Use o existente para não duplicar o material." />
          <Surface padded={false}>
            {candidates.slice(0, 5).map((c, index) => (
              <Pressable
                key={c.materialId}
                onPress={() => onCreated({ materialId: c.materialId, name: c.name, variantLabel: c.variantLabel, unit: null, sku: c.sku })}
                style={({ pressed }) => [styles.option, index > 0 && styles.optionBorder, pressed && { backgroundColor: colors.surfacePressed }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text }]}>{formatMaterialLabel(c.name, c.variantLabel)}</Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{[c.sku, c.exact ? "igual" : "parecido"].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text style={[type.label, { color: colors.primary, fontWeight: "600" }]}>Usar</Text>
              </Pressable>
            ))}
          </Surface>
        </View>
      ) : null}

      {error ? <Banner tone="danger" title={error} /> : null}

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <AppButton label="Voltar" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        {upToDate && candidates !== undefined ? (
          <AppButton label={candidates.length > 0 ? "Criar mesmo assim" : "Criar material"} loading={saving} disabled={!current.name} onPress={() => void create()} style={{ flex: 1 }} />
        ) : (
          <AppButton label="Continuar" loading={upToDate && candidates === undefined} disabled={!current.name} onPress={() => setChecked(current)} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { height: control.height, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, gap: space.sm },
  label: { ...type.label },
  value: { flex: 1, fontSize: 16 },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
