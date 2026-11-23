import {
  dueMissingSlots,
  formatMinute,
  PUNCH_SLOTS,
  type ClassifiedDay,
  type PunchSlot,
} from "@rlpapp/shared/rh/pontoDay";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Surface } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

const SHORT_LABEL: Record<PunchSlot, string> = {
  entrada: "Entrada",
  almoco_saida: "Almoço",
  almoco_retorno: "Volta",
  saida: "Saída",
};

/**
 * O dia em quatro quadros (entrada, almoço, volta, saída). O que ficou para
 * trás sem marcação mostra "Esqueci": um toque e a pessoa informa o horário.
 */
export function TodaySlots({
  day,
  onForgot,
}: {
  day: ClassifiedDay;
  onForgot?: (slot: PunchSlot) => void;
}) {
  const due = new Set(dueMissingSlots(day));
  const extras = day.items.filter(
    (item) => item.role === "entrada_extra" || item.role === "saida_extra"
  );
  return (
    <Surface style={{ gap: space.sm }}>
      <View style={styles.grid}>
        {PUNCH_SLOTS.map((slot) => {
          const item = day.slots[slot];
          const missing = !item && due.has(slot);
          return (
            <View key={slot} style={[styles.cell, missing && styles.cellMissing]}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{SHORT_LABEL[slot]}</Text>
              {item ? (
                <>
                  <Text style={styles.time}>{formatMinute(item.minute)}</Text>
                  {item.basis === "pending" ? (
                    <Text style={[type.caption, { color: colors.warning }]}>aguarda RH</Text>
                  ) : item.basis === "approved" ? (
                    <Text style={[type.caption, { color: colors.textSecondary }]}>pelo RH</Text>
                  ) : null}
                </>
              ) : missing && onForgot ? (
                <Pressable
                  onPress={() => onForgot(slot)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Esqueci de marcar: ${SHORT_LABEL[slot]}`}
                >
                  <Text style={[styles.time, { color: colors.textMuted }]}>--:--</Text>
                  <Text style={[type.label, { color: colors.primary }]}>Esqueci</Text>
                </Pressable>
              ) : (
                <Text style={[styles.time, { color: colors.controlDisabledText }]}>--:--</Text>
              )}
            </View>
          );
        })}
      </View>
      {extras.length > 0 ? (
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          Extras: {extras.map((item) => formatMinute(item.minute)).join(" · ")}
        </Text>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: space.xs },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  cellMissing: { backgroundColor: colors.surfaceMuted },
  time: {
    ...type.heading,
    color: colors.text,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
