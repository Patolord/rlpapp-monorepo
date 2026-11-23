import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pill, Surface } from "@/components/ui";
import { listPendingCaptures, subscribeCaptureQueue, type PendingCapture } from "@/lib/capture-queue";
import { formatMaterialLabel, formatQty, formatShortDateTime } from "@/lib/format";
import { colors, space, type, type Tone } from "@/lib/theme";

const OUTCOME: Record<"matched" | "created" | "review", { label: string; tone: Tone }> = {
  matched: { label: "Somado no existente", tone: "success" },
  created: { label: "Item novo", tone: "info" },
  review: { label: "Novo · em revisão", tone: "warning" },
};

/** Itens na fila do celular. */
export function usePendingCaptures(): PendingCapture[] {
  const { userId } = useAuth();
  const [pending, setPending] = useState<PendingCapture[]>([]);
  useEffect(() => {
    if (!userId) return;
    const load = () => void listPendingCaptures(userId).then(setPending);
    load();
    return subscribeCaptureQueue(load);
  }, [userId]);
  return pending;
}

/** Últimos cadastros: primeiro o que está na fila, depois o que já subiu. */
export function RecentCaptures({ online, pending }: { online: boolean; pending: PendingCapture[] }) {
  const recent = useQuery(api.materialCaptures.listMine, online ? { limit: 20 } : "skip");

  if (pending.length === 0 && (!recent || recent.length === 0)) return null;

  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.eyebrow, { color: colors.textSecondaryOnBg }]}>Últimos cadastros</Text>
      {pending.map((item) => (
        <Surface key={item.clientId}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                {[item.locationName, formatShortDateTime(item.capturedAt), item.error ? `Erro: ${item.error}` : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.end}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{formatQty(item.quantity, item.unit ?? null)}</Text>
              <Pill label={item.error ? "Erro no envio" : "Na fila"} tone={item.error ? "danger" : "neutral"} />
            </View>
          </View>
        </Surface>
      ))}
      {(recent ?? []).map((item) => {
        const outcome = item.materialStatus === "draft" ? OUTCOME.review : OUTCOME[item.outcome];
        return (
          <Surface key={item._id}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {formatMaterialLabel(item.name, item.variantLabel)}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.sku, item.locationName, item.physicalAddress ? `End. ${item.physicalAddress}` : null, formatShortDateTime(item.capturedAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View style={styles.end}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {item.quantityMode === "set" ? "= " : "+ "}
                  {formatQty(item.countedQuantity, item.unit)}
                </Text>
                <Pill label={outcome.label} tone={outcome.tone} />
              </View>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  end: { alignItems: "flex-end", gap: 4 },
});
