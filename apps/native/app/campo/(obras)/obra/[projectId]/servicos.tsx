import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { ScrollView, StyleSheet, Text } from "react-native";

import { BigRow, StatusPill } from "@/components/campo/field-ui";
import { obraTitle, useFieldObra } from "@/components/campo/obra";
import { ObraUnavailable, OfflineState } from "@/components/campo/obra-states";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { disciplineStatus } from "@/components/campo/service-status";
import { EmptyState, ListRow, LoadingState, SectionTitle, screenStyles } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

function lastStageLine(lastStage: { description: string; location: string | null } | null): string {
  if (!lastStage) return "Nenhuma etapa registrada";
  // O local vem antes: a linha corta no fim e a descrição pode ser longa.
  return lastStage.location
    ? `Última etapa: ${lastStage.location} · ${lastStage.description}`
    : `Última etapa: ${lastStage.description}`;
}

/** Serviços da obra: as disciplinas da equipe e, à parte, as de outras equipes. */
export default function CampoObraServicosScreen() {
  const { projectId: identifier } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const online = useOnline();
  const obra = useFieldObra(identifier);
  // As queries de serviços exigem atribuição à obra (lançam "acesso negado"
  // para quem só está de passagem), então só rodam com `assigned`.
  const projectId = obra != null && obra.assigned ? obra._id : null;
  const disciplines = useQuery(api.fieldServices.listDisciplines, projectId ? { projectId } : "skip");

  if (obra == null || !obra.assigned) {
    return (
      <ObraUnavailable
        obra={obra}
        offlineDescription="Os serviços da obra precisam de internet para carregar."
        deniedTitle="Sem acesso aos serviços"
        deniedDescription="Os serviços desta obra só ficam disponíveis para técnicos atribuídos a ela. Peça à engenharia para liberar."
      />
    );
  }

  if (disciplines === undefined) {
    return online ? (
      <LoadingState message="Carregando serviços..." />
    ) : (
      <OfflineState description="Os serviços da obra precisam de internet para carregar." />
    );
  }

  function openDiscipline(disciplineId: Id<"projectDisciplines">) {
    router.push({
      pathname: "/campo/obra/[projectId]/disciplina/[disciplineId]",
      params: { projectId: identifier!, disciplineId },
    } as Href);
  }

  const team = disciplines.filter((discipline) => discipline.fieldTeam);
  const others = disciplines.filter((discipline) => !discipline.fieldTeam);

  return (
    <ScrollView contentContainerStyle={[screenStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
      <OfflineBanner detail="A lista pode estar desatualizada." />
      <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
        {obraTitle(obra)}
      </Text>

      {disciplines.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={30} color={colors.primary} strokeWidth={1.8} />}
          title="Nenhuma disciplina definida"
          description="A engenharia define as disciplinas desta obra."
        />
      ) : null}

      {team.length > 0 ? <SectionTitle title="Disciplinas da equipe" style={styles.section} /> : null}
      {team.map((discipline) => {
        const status = disciplineStatus(discipline.stageCount);
        return (
          <BigRow
            key={discipline._id}
            title={discipline.name}
            subtitle={lastStageLine(discipline.lastStage)}
            trailing={<StatusPill label={status.label} tone={status.tone} />}
            onPress={() => openDiscipline(discipline._id)}
          />
        );
      })}

      {others.length > 0 ? <SectionTitle title="Outras disciplinas da obra" style={styles.section} /> : null}
      {others.map((discipline) => (
        <ListRow
          key={discipline._id}
          title={discipline.name}
          subtitle="Outra equipe · só para acompanhar"
          onPress={() => openDiscipline(discipline._id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg },
  section: { paddingHorizontal: 0, paddingTop: space.md, paddingBottom: 0 },
});
