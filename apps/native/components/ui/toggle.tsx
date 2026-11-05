import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, space, type } from "@/lib/theme";

/** Interruptor com rótulo e descrição opcional. */
export function Toggle({
  value,
  onChange,
  label,
  description,
  disabled,
  style,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[styles.row, { opacity: disabled ? 0.6 : 1 }, style]}
    >
      <View style={[styles.track, value && { backgroundColor: colors.primary }]}>
        <View style={[styles.thumb, value && { alignSelf: "flex-end" }]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[type.caption, { color: colors.textMuted }]}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: 4 },
  track: { width: 48, height: 28, borderRadius: radius.pill, backgroundColor: colors.borderStrong, padding: 3, justifyContent: "center" },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignSelf: "flex-start" },
});
