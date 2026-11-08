import { Check, ChevronDown } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, control, radius, shadow, space, type } from "@/lib/theme";

import { SearchField } from "./field";
import { Sheet } from "./sheet";
import { EmptyState } from "./state";
import { Surface } from "./surface";

export type PickerOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string | null;
};

// ---------------------------------------------------------------------------
// PickerField: looks like a Field (floating label) but opens a bottom sheet
// with a searchable list of options — the native "select".
// ---------------------------------------------------------------------------
export function PickerField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Selecionar",
  icon,
  searchable,
  clearable,
  disabled,
  error,
  helper,
  loading,
  emptyText = "Nenhuma opção disponível.",
  containerStyle,
}: {
  label: string;
  value: V | null;
  options: PickerOption<V>[];
  onChange: (value: V | null) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  helper?: string;
  loading?: boolean;
  emptyText?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((option) => option.value === value) ?? null;
  const borderColor = error ? colors.destructive : colors.controlBorder;

  const visible = React.useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return options;
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase("pt-BR").includes(term) ||
        (option.description?.toLocaleLowerCase("pt-BR").includes(term) ?? false)
    );
  }, [options, search]);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: disabled ? colors.controlDisabled : pressed ? colors.surfacePressed : colors.surface,
            borderColor,
          },
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          style={[styles.value, { color: selected ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {loading && !selected ? "Carregando..." : selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={20} color={colors.icon} />
      </Pressable>
      {error || helper ? (
        <Text style={[type.bodySm, { color: error ? colors.destructive : colors.textSecondary }]}>{error ?? helper}</Text>
      ) : null}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setSearch("");
        }}
        title={label}
        maxHeight={0.85}
      >
        {searchable ? <SearchField value={search} onChangeText={setSearch} autoFocus /> : null}
        {clearable && selected ? (
          <Pressable
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
            hitSlop={8}
          >
            <Text style={[type.label, { color: colors.danger }]}>Limpar seleção</Text>
          </Pressable>
        ) : null}
        {visible.length === 0 ? (
          <EmptyState title={search ? "Nada encontrado" : "Sem opções"} description={search ? undefined : emptyText} />
        ) : (
          <Surface padded={false}>
            {visible.map((option, index) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && styles.optionBorder,
                    pressed && { backgroundColor: colors.surfacePressed },
                    active && { backgroundColor: colors.primarySoft },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  {active ? <Check size={20} color={colors.primary} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })}
          </Surface>
        )}
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SegmentedField: a labelled row of exclusive chips, for 2–4 options.
// ---------------------------------------------------------------------------
export function SegmentedField<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  containerStyle,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: space.sm }, containerStyle]}>
      <Text style={[type.label, { color: colors.label, marginLeft: 4 }]}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[
                styles.segment,
                { backgroundColor: active ? colors.primary : "transparent", opacity: disabled ? 0.6 : 1 },
              ]}
            >
              <Text style={[type.label, { color: active ? colors.onPrimary : colors.textSecondary }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    height: control.height,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: space.sm,
    ...shadow.xs,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.text },
  icon: { width: 32, alignItems: "flex-start", justifyContent: "center" },
  value: { flex: 1, fontSize: 16 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.menu,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
});
