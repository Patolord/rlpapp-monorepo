import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { StageCard, type StageRow } from "@/components/campo/stage-card";
import { stageCompanionsLine, stageDate } from "@/components/campo/stage-people";
import { AppButton } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

/** Quantas etapas aparecem antes do "Ver todas": o resto da tela são os outros registros. */
const COLLAPSED = 5;

/**
 * "Etapas de serviço" em Meus registros da obra: as etapas em que o usuário
 * participou, com quem fez junto. Sem totais nem contagem por pessoa.
 */
export function MyStagesBlock({
  stages,
  currentUserId,
  onOpen,
}: {
  stages: StageRow[];
  currentUserId: Id<"users"> | null | undefined;
  onOpen: (stage: StageRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (stages.length === 0) return null;
  const visible = expanded ? stages : stages.slice(0, COLLAPSED);

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        Etapas de serviço
      </Text>
      {visible.map((stage) => {
        const parts = [
          stage.disciplineName,
          stage.location,
          stageCompanionsLine(stage.participants, currentUserId),
          stageDate(stage.createdAt),
        ].filter((part): part is string => Boolean(part));
        return <StageCard key={stage._id} stage={stage} line={parts.join(" · ")} onPress={() => onOpen(stage)} />;
      })}
      {!expanded && stages.length > COLLAPSED ? (
        <AppButton label="Ver todas as etapas" variant="ghost" size="sm" onPress={() => setExpanded(true)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  title: { ...type.eyebrow, color: colors.textSecondaryOnBg, marginTop: space.md, marginBottom: space.xs },
});
