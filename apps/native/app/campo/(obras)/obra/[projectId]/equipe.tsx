import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Users } from "lucide-react-native";
import { ScrollView, StyleSheet } from "react-native";

import { obraSubtitle, useFieldObra } from "@/components/campo/obra";
import { ObraUnavailable, OfflineState } from "@/components/campo/obra-states";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { EmptyState, KeyValueList, ListRow, LoadingState, SectionTitle, screenStyles } from "@/components/ui";
import { colors, space } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

/** Quem está na obra e os dados dela (cliente, endereço, engenharia responsável). */
export default function CampoObraEquipeScreen() {
  const { projectId: identifier } = useLocalSearchParams<{ projectId: string }>();
  const online = useOnline();
  const obra = useFieldObra(identifier);
  // `listTeam` exige atribuição à obra, então só roda com `assigned`.
  const projectId = obra != null && obra.assigned ? obra._id : null;
  const team = useQuery(api.fieldServices.listTeam, projectId ? { projectId } : "skip");

  if (obra == null || !obra.assigned) {
    return (
      <ObraUnavailable
        obra={obra}
        offlineDescription="A equipe da obra precisa de internet para carregar."
        deniedTitle="Sem acesso à equipe"
        deniedDescription="A equipe e os dados desta obra só ficam disponíveis para técnicos atribuídos a ela. Peça à engenharia para liberar."
      />
    );
  }

  if (team === undefined) {
    return online ? (
      <LoadingState message="Carregando equipe..." />
    ) : (
      <OfflineState description="A equipe da obra precisa de internet para carregar." />
    );
  }

  const obraData = [
    { label: "Cliente", value: obraSubtitle(obra) },
    { label: "Endereço", value: obra.address },
    { label: "Engenharia responsável", value: team.responsibleName },
  ];

  return (
    <ScrollView contentContainerStyle={[screenStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
      <OfflineBanner detail="A equipe pode estar desatualizada." />

      <SectionTitle title="Equipe na obra" style={styles.section} />
      {team.members.length === 0 ? (
        <EmptyState
          icon={<Users size={30} color={colors.primary} strokeWidth={1.8} />}
          title="Ninguém atribuído a esta obra"
        />
      ) : (
        team.members.map((member) => (
          <ListRow
            key={member._id}
            title={member.isMe ? `${member.name} (você)` : member.name}
            subtitle={member.leader ? "Técnico líder" : "Ajudante"}
            chevron={false}
          />
        ))
      )}

      {obraData.some((item) => item.value) ? (
        <>
          <SectionTitle title="Obra" style={styles.section} />
          <KeyValueList items={obraData} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm },
  section: { paddingHorizontal: 0, paddingTop: space.md, paddingBottom: 0 },
});
