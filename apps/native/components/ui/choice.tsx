import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, space, tone as toneColors, type, type Tone } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Escolhas em botões (formulários de campo): única (`ChoiceGroup`) ou várias
// (`ChoiceChips`). Botões grandes para tocar com luva; o selecionado ganha
// contorno azul e marca, nunca só cor.
// ---------------------------------------------------------------------------

export type ChoiceOption<V extends string> = { value: V; label: string; tone?: Tone };

export function ChoiceGroup<V extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
  error,
  style,
}: {
  label: string;
  value: V | null;
  options: ChoiceOption<V>[];
  onChange: (value: V) => void;
  columns?: 1 | 2;
  error?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.option,
                columns === 2 ? styles.half : styles.full,
                selected && styles.selected,
                pressed && !selected && styles.pressed,
              ]}
            >
              {option.tone ? <View style={[styles.dot, { backgroundColor: toneColors[option.tone].dot }]} /> : null}
              <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={1}>
                {option.label}
              </Text>
              {selected ? <Check size={16} color={colors.primary} strokeWidth={2.5} /> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ChoiceChips<V extends string>({
  label,
  values,
  options,
  onChange,
  style,
}: {
  label: string;
  values: V[];
  options: { value: V; label: string }[];
  onChange: (values: V[]) => void;
  style?: StyleProp<ViewStyle>;
}) {
  function toggle(v: V) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => toggle(option.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.pressed]}
            >
              {selected ? <Check size={14} color={colors.onPrimary} strokeWidth={2.5} /> : null}
              <Text style={[type.label, { color: selected ? colors.onPrimary : colors.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...type.label, color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  half: { flexBasis: "47%", flexGrow: 1 },
  full: { flexBasis: "100%" },
  selected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.surfacePressed },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { ...type.body, color: colors.text, flex: 1 },
  optionTextSelected: { fontWeight: "600" },
  error: { ...type.bodySm, color: colors.destructive },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
