import type { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pill, Surface } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

import { FRESHNESS, PRICE_SOURCE, REVIEW_STATUS } from "./labels";

export type PriceEvent = FunctionReturnType<typeof api.priceEvents.list>[number];

/** Linha de evento de preço (histórico e fila de revisão). */
export function PriceEventRow({ event, children, onPress }: { event: PriceEvent; children?: React.ReactNode; onPress?: () => void }) {
  const fresh = FRESHNESS[event.freshness] ?? { label: event.freshness, tone: "neutral" as const };
  return (
    <Surface onPress={onPress} style={{ gap: space.sm }}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
            {event.materialName ?? event.rawDescription ?? "Material não identificado"}
          </Text>
          <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
            {event.supplierName}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.heading, { color: colors.text }]}>{formatCurrency(event.unitPriceCents)}</Text>
          {event.unit ? <Text style={[type.caption, { color: colors.textMuted }]}>por {event.unit}</Text> : null}
        </View>
      </View>
      <View style={styles.meta}>
        <Pill label={fresh.label} tone={fresh.tone} />
        <Pill label={PRICE_SOURCE[event.source] ?? event.source} tone="neutral" />
        {event.needsReview ? <Pill label={REVIEW_STATUS[event.reviewStatus ?? "unreviewed"]?.label ?? "Revisar"} tone="warning" icon={<AlertTriangle size={11} color={colors.warning} />} /> : null}
        <Text style={[type.caption, { color: colors.textMuted }]}>{formatDate(event.occurredAt)}</Text>
      </View>
      {event.warnings.length > 0 ? (
        <Text style={[type.caption, { color: colors.warning }]} numberOfLines={2}>
          {event.warnings.join(" · ")}
        </Text>
      ) : null}
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
