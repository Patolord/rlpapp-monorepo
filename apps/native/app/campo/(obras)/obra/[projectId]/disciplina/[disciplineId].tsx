import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ClipboardList, Plus } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BigRow, StatusPill } from "@/components/campo/field-ui";
import { useFieldObra } from "@/components/campo/obra";
import { ObraUnavailable, OfflineState } from "@/components/campo/obra-states";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { RegisterStageSheet } from "@/components/campo/register-stage-sheet";
import { SERVICE_STATUS, serviceLocationLabel } from "@/components/campo/service-status";
import { AppButton, Banner, Chips, EmptyState, LoadingState, screenStyles, type ChipItem } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

type Filter = "all" | "open" | "concluded";

const FILTERS: ChipItem<Filter>[] = [
  { key: "all", label: "Todos" },
  { key: "open", label: "A fazer" },
  { key: "concluded", label: "Concluídos" },
];

/** Uma disciplina da obra: os serviços dela (um por local) e o registro de etapa. */
export default function CampoObraDisciplinaScreen() {
  const { projectId: identifier, disciplineId } = useLocalSearchParams<{ projectId: string; disciplineId: string }>();
  const router = useRouter();
  const online = useOnline();
  const obra = useFieldObra(identifier);
  // `getDiscipline` exige atribuição à obra, então só roda com `assigned`.
  const assigned = obra != null && obra.assigned;
  const discipline = useQuery(
    api.fieldServices.getDiscipline,
    assigned && disciplineId ? { disciplineId: disciplineId as Id<"projectDisciplines"> } : "skip"
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

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

  if (discipline === undefined) {
    return online ? (
      <LoadingState message="Carregando disciplina..." />
    ) : (
      <OfflineState description="Os serviços da disciplina precisam de internet para carregar." />
    );
  }

  if (discipline === null) {
    return (
      <View style={styles.centered}>
        <EmptyState
          tone="neutral"
          icon={<ClipboardList size={30} color={colors.textSecondary} strokeWidth={1.8} />}
          title="Disciplina não encontrada"
          description="Ela foi removida desta obra pela engenharia."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const services = discipline.services.filter((service) => {
    if (filter === "all") return true;
    return filter === "concluded" ? service.status === "concluded" : service.status !== "concluded";
  });

  function openService(locationKey: string) {
    router.push({
      pathname: "/campo/obra/[projectId]/servico",
      params: { projectId: identifier!, disciplineId: disciplineId!, locationKey },
    } as Href);
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: discipline.name }} />
      <ScrollView contentContainerStyle={[screenStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
        <OfflineBanner detail="A lista pode estar desatualizada." />

        {discipline.fieldTeam ? (
          <AppButton
            label="Registrar etapa"
            size="lg"
            icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
            onPress={() => setSheetOpen(true)}
          />
        ) : (
          <Banner tone="info" title="Disciplina de outra equipe" detail="Aqui você só acompanha o andamento." />
        )}

        {discipline.services.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={30} color={colors.primary} strokeWidth={1.8} />}
            title="Nenhum serviço ainda"
            description={discipline.fieldTeam ? "Registre a primeira etapa desta disciplina." : undefined}
          />
        ) : (
          <>
            <Chips<Filter> items={FILTERS} active={filter} onChange={setFilter} style={styles.chips} />
            {services.length === 0 ? (
              <Text style={[type.bodySm, styles.noMatch]}>Nenhum serviço neste filtro.</Text>
            ) : null}
            {services.map((service) => {
              const status = SERVICE_STATUS[service.status];
              return (
                <BigRow
                  key={service.locationKey}
                  title={serviceLocationLabel(service.location)}
                  subtitle={
                    service.status === "waiting" && service.pendingNote ? `Aguarda: ${service.pendingNote}` : null
                  }
                  trailing={<StatusPill label={status.label} tone={status.tone} />}
                  onPress={() => openService(service.locationKey)}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      {discipline.fieldTeam ? (
        <RegisterStageSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          projectId={discipline.projectId}
          disciplineId={discipline._id}
          disciplineName={discipline.name}
          location={null}
          allowLocationEdit
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.screen },
  chips: { paddingHorizontal: 0 },
  noMatch: { color: colors.textSecondaryOnBg, paddingVertical: space.md },
});
