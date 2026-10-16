import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, space, type } from "@/lib/theme";

import { Surface } from "./surface";

/** Lista rótulo → valor para telas de detalhe. Omite linhas sem valor. */
export function KeyValueList({
  items,
}: {
  items: { label: string; value: React.ReactNode | string | null | undefined }[];
}) {
  const rows = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (rows.length === 0) return null;
  return (
    <Surface padded={false}>
      {rows.map((item, index) => (
        <View key={item.label} style={[styles.row, index > 0 && styles.border]}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{item.label}</Text>
          {typeof item.value === "string" ? (
            <Text style={[type.body, { color: colors.text }]} selectable>
              {item.value}
            </Text>
          ) : (
            item.value
          )}
        </View>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: 12, gap: 2 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
