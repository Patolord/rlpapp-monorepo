import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Pill, Surface } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

/** Etapa de um serviço como o backend devolve (`fieldServices.getService` / `listMine`). */
export type StageRow = FunctionReturnType<typeof api.fieldServices.listMine>[number];

/**
 * Uma etapa registrada: o que foi feito, uma linha de apoio (quem e quando, ou
 * de qual serviço) e o selo de conferida. `detailed` mostra também o que falta
 * e as fotos; com `onPress` o cartão abre o serviço.
 */
export function StageCard({
  stage,
  line,
  detailed,
  onPress,
  action,
}: {
  stage: StageRow;
  line: string;
  detailed?: boolean;
  onPress?: () => void;
  /** Ação da própria etapa (ex.: "Apagar"), abaixo do conteúdo. */
  action?: React.ReactNode;
}) {
  const reviewed = stage.reviewedAt !== null;
  const pending = detailed && stage.outcome === "continues" ? stage.pendingNote : null;
  return (
    <Surface
      onPress={onPress}
      style={styles.card}
      accessibilityLabel={onPress ? `${stage.description}. ${line}${reviewed ? ". Conferido" : ""}` : undefined}
    >
      <View style={styles.top}>
        <Text style={[type.bodyStrong, styles.description]} numberOfLines={onPress ? 2 : undefined}>
          {stage.description}
        </Text>
        {reviewed ? <Pill label="Conferido" tone="success" /> : null}
        {onPress ? <ChevronRight size={20} color={colors.icon} /> : null}
      </View>
      <Text style={[type.bodySm, { color: colors.textSecondary }]}>{line}</Text>
      {pending ? <Text style={[type.bodySm, { color: colors.text }]}>Falta: {pending}</Text> : null}
      {detailed && stage.photoUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {stage.photoUrls.map((url, index) => (
            <Image
              key={`${index}:${url}`}
              source={{ uri: url }}
              style={styles.thumb}
              contentFit="cover"
              accessibilityLabel={`Foto ${index + 1} da etapa`}
            />
          ))}
        </ScrollView>
      ) : null}
      {action}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  description: { flex: 1, minWidth: 0, color: colors.text },
  thumbs: { gap: space.sm, paddingTop: space.xs },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
});
