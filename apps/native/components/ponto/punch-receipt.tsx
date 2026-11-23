import type { api } from "@rlpapp/backend/convex/_generated/api";
import { PUNCH_ROLE_LABEL } from "@rlpapp/shared/rh/pontoDay";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2 } from "lucide-react-native";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/ui";
import { formatDateKey } from "@/lib/brt-date";
import { colors, radius, space, type } from "@/lib/theme";

export type Receipt = FunctionReturnType<typeof api.timeClockPunch.register>;

export const GEOFENCE_LABEL = {
  inside: "Dentro da obra",
  outside: "Fora da obra",
  not_controlled: "Sem cerca",
} as const;

/** "Ponto registrado": nome, horário oficial, o que foi registrado, obra, NSR e hash. */
export function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  return (
    <Modal visible={receipt !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.receipt}>
          <View style={styles.receiptIcon}>
            <CheckCircle2 size={34} color={colors.success} />
          </View>
          <Text style={[type.title, { color: colors.text, textAlign: "center" }]}>
            {receipt ? `${PUNCH_ROLE_LABEL[receipt.kind]} registrada` : "Ponto registrado"}
          </Text>
          {receipt ? (
            <View style={{ gap: space.xs, alignItems: "center" }}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{receipt.personName}</Text>
              <Text style={[type.body, { color: colors.text }]}>
                {formatDateKey(receipt.date)} às {receipt.timeLabel}
              </Text>
              <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                {receipt.worksiteName
                  ? `${GEOFENCE_LABEL[receipt.geofenceStatus]} · ${receipt.worksiteName}`
                  : GEOFENCE_LABEL[receipt.geofenceStatus]}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>NSR {receipt.nsr}</Text>
              <Text selectable style={styles.hash}>
                {receipt.hash}
              </Text>
              {receipt.duplicate ? (
                <Text style={[type.caption, { color: colors.warning }]}>
                  Esta marcação já havia sido registrada.
                </Text>
              ) : null}
            </View>
          ) : null}
          <AppButton label="Ok" onPress={onClose} trailing={null} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  receipt: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.lg,
    alignItems: "stretch",
  },
  receiptIcon: { alignItems: "center" },
  hash: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
