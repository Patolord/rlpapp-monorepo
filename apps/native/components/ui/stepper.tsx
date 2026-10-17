import { Minus, Plus } from "lucide-react-native";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, space } from "@/lib/theme";

import { IconButton } from "./screen";

// ---------------------------------------------------------------------------
// QuantityStepper: big tappable −/+ with the value in the middle.
// ---------------------------------------------------------------------------
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  style,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <IconButton
        label="Diminuir quantidade"
        size={48}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        icon={<Minus size={22} color={colors.text} strokeWidth={2.2} />}
      />
      <Text style={styles.value}>{value}</Text>
      <IconButton
        label="Aumentar quantidade"
        size={48}
        onPress={() => onChange(value + 1)}
        icon={<Plus size={22} color={colors.text} strokeWidth={2.2} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
  },
  value: {
    minWidth: 56,
    textAlign: "center",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
