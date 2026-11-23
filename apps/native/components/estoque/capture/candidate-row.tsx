import { Image } from "expo-image";
import { Package } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Pill, Surface } from "@/components/ui";
import { PENDING_PREFIX } from "@/lib/capture-queue";
import { formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";
import type { CaptureCandidate } from "@/lib/use-capture-lookup";

const REASON_LABEL: Record<CaptureCandidate["reason"], string> = {
  barcode: "Pelo código de barras",
  sku: "Pela etiqueta (SKU)",
  identity: "Mesmo nome e medida",
  alias: "Pelo apelido",
  similar: "Parecido",
};

/** Material do catálogo encontrado na conferência (certo ou parecido). */
export function CandidateRow({
  candidate,
  onPress,
  actionLabel = "Contar",
  highlight = false,
}: {
  candidate: CaptureCandidate;
  onPress: () => void;
  actionLabel?: string;
  highlight?: boolean;
}) {
  const label = formatMaterialLabel(candidate.name, candidate.variantLabel);
  const meta = [
    candidate.sku,
    candidate.unit,
    candidate.quantityHere !== null ? `${formatQty(candidate.quantityHere, candidate.unit)} aqui` : null,
    candidate.physicalAddress ? `End. ${candidate.physicalAddress}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Surface onPress={onPress} style={highlight ? styles.highlight : undefined} accessibilityLabel={`${label}. ${actionLabel}`}>
      <View style={styles.row}>
        {candidate.imageUrl ? (
          <Image source={{ uri: candidate.imageUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Package size={20} color={colors.icon} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
            {label}
          </Text>
          {meta ? (
            <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.pills}>
            <Pill label={REASON_LABEL[candidate.reason]} tone={candidate.reason === "similar" ? "warning" : "success"} />
            {candidate.status === "draft" ? <Pill label="Em revisão" tone="info" /> : null}
            {candidate.materialId.startsWith(PENDING_PREFIX) ? <Pill label="Na fila do celular" tone="neutral" /> : null}
          </View>
        </View>
        <Text style={[type.label, { color: colors.primary }]}>{actionLabel}</Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  thumbEmpty: { backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  highlight: { borderWidth: 2, borderColor: colors.success },
});
