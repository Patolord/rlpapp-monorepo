import { PUNCH_ROLE_LABEL } from "@rlpapp/shared/rh/pontoDay";
import { CloudOff, CloudUpload, RefreshCw, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GEOFENCE_LABEL } from "@/components/ponto/punch-receipt";
import { ConfirmDialog, Divider, Pill, SectionTitle, Surface } from "@/components/ui";
import { formatDateKey, toBrtDateKey, toBrtTimeLabel } from "@/lib/brt-date";
import type { PunchContext } from "@/lib/punch-plan";
import {
  removePendingPunch,
  requestPunchSync,
  type PendingPunch,
} from "@/lib/punch-queue";
import { colors, space, type } from "@/lib/theme";

/** Marcações guardadas no aparelho, esperando conexão. */
export function PendingPunchList({ pending, online }: { pending: PendingPunch[]; online: boolean }) {
  const [discard, setDiscard] = useState<PendingPunch | null>(null);
  if (pending.length === 0) return null;
  return (
    <>
      <ConfirmDialog
        open={discard !== null}
        title="Descartar esta marcação?"
        description={
          discard
            ? `A marcação de ${formatDateKey(toBrtDateKey(discard.capturedAt))} às ${toBrtTimeLabel(discard.capturedAt)} sai do aparelho e não será enviada. Não dá para desfazer.`
            : undefined
        }
        confirmLabel="Descartar"
        destructive
        onConfirm={() => {
          if (discard) void removePendingPunch(discard.clientPunchId);
          setDiscard(null);
        }}
        onCancel={() => setDiscard(null)}
      />
      <SectionTitle title="Aguardando envio" style={{ paddingHorizontal: 0 }} />
      <Surface padded={false}>
        {pending.map((item, index) => (
          <View key={item.clientPunchId}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row}>
              {item.error ? (
                <CloudOff size={18} color={colors.danger} />
              ) : (
                <CloudUpload size={18} color={colors.warning} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {formatDateKey(toBrtDateKey(item.capturedAt))} às {toBrtTimeLabel(item.capturedAt)}
                </Text>
                <Text style={[type.caption, { color: item.error ? colors.danger : colors.textSecondary }]}>
                  {item.error ?? (online ? "Enviando…" : "Aguardando conexão")}
                </Text>
              </View>
              {item.error ? (
                <Pressable
                  onPress={() => setDiscard(item)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Descartar marcação pendente"
                >
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              ) : (
                <Pressable onPress={requestPunchSync} hitSlop={8} accessibilityRole="button">
                  <RefreshCw size={18} color={colors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </Surface>
    </>
  );
}

/** Marcações registradas hoje, com o que cada uma é, a obra e o NSR. */
export function TodayPunchList({
  punches,
  onOpenHistory,
}: {
  punches: PunchContext["punches"];
  onOpenHistory: () => void;
}) {
  return (
    <>
      <SectionTitle
        title="Marcações de hoje"
        action="Minhas marcações"
        onAction={onOpenHistory}
        style={{ paddingHorizontal: 0 }}
      />
      {punches.length === 0 ? (
        <Surface>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Nenhuma marcação registrada hoje.
          </Text>
        </Surface>
      ) : (
        <Surface padded={false}>
          {punches.map((punch, index) => (
            <View key={punch._id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <Text style={styles.time}>{punch.timeLabel}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>
                    {PUNCH_ROLE_LABEL[punch.kind]}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {punch.worksiteName ?? "Sem obra"}
                    {punch.offline ? " · offline" : ""}
                    {` · NSR ${punch.nsr}`}
                  </Text>
                </View>
                <Pill
                  label={GEOFENCE_LABEL[punch.geofenceStatus]}
                  tone={
                    punch.geofenceStatus === "inside"
                      ? "success"
                      : punch.geofenceStatus === "outside"
                        ? "warning"
                        : "neutral"
                  }
                />
              </View>
            </View>
          ))}
        </Surface>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  time: { ...type.heading, color: colors.text, width: 56, fontVariant: ["tabular-nums"] },
});
