import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Check, ChevronDown, Package } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { EmptyState, LoadingState, SearchField, Sheet, Surface } from "@/components/ui";
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
    <View style={containerStyle}>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.field,
          { borderColor: error ? colors.danger : colors.border, backgroundColor: disabled ? colors.surfaceMuted : pressed ? colors.surfacePressed : colors.surface },
        ]}
      >
        <View style={[styles.labelWrap, { backgroundColor: disabled ? colors.surfaceMuted : colors.surface }]}>
          <Text style={[styles.label, { color: error ? colors.danger : colors.label }]}>{label}</Text>
        </View>
        <Package size={22} color={colors.icon} strokeWidth={1.6} />
        <Text style={[styles.value, { color: value ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {value ? formatMaterialLabel(value.name, value.variantLabel) : "Buscar no catálogo"}
        </Text>
        <ChevronDown size={20} color={colors.icon} />
      </Pressable>
      {error ? <Text style={[type.caption, { color: colors.danger, marginTop: 6, marginLeft: space.lg }]}>{error}</Text> : null}
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

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setSearch("");
      }}
      title={title}
      maxHeight={0.9}
    >
      <SearchField value={search} onChangeText={setSearch} placeholder="Nome, variante, SKU ou categoria" autoFocus />
      {results === undefined ? (
        <LoadingState style={{ flex: 0, paddingVertical: space.xl }} />
      ) : results.length === 0 ? (
        <EmptyState title="Nenhum material" description={debounced ? "Nada corresponde à busca." : "O catálogo está vazio."} />
      ) : (
        <Surface padded={false}>
          {results.slice(0, 60).map((item, index) => {
            const active = item._id === selectedId;
            return (
              <Pressable
                key={item._id}
                onPress={() => {
                  onPick({ materialId: item._id, name: item.name, variantLabel: item.variantLabel, unit: item.unit, sku: item.sku });
                  onClose();
                  setSearch("");
                }}
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { height: control.height, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md },
  labelWrap: { position: "absolute", top: -10, left: 14, paddingHorizontal: 4 },
  label: { fontSize: 14, lineHeight: 18 },
  value: { flex: 1, fontSize: 16 },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
