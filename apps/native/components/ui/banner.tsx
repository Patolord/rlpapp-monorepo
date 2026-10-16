import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, space, tone as toneColors, type, type Tone } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Banner: inline notice (offline, cached data, warnings).
// ---------------------------------------------------------------------------
export function Banner({
  icon,
  title,
  detail,
  tone: t = "warning",
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const tc = toneColors[t];
  return (
    <View style={[styles.banner, { backgroundColor: tc.bg }, style]}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.label, { color: tc.fg }]}>{title}</Text>
        {detail ? <Text style={[type.caption, { color: tc.fg, opacity: 0.85 }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
});
