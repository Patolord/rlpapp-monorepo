import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ClipboardList, Plus } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { StatusPill } from "@/components/campo/field-ui";
import { useFieldObra } from "@/components/campo/obra";
import { ObraUnavailable, OfflineState } from "@/components/campo/obra-states";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { RegisterStageSheet } from "@/components/campo/register-stage-sheet";
import { SERVICE_STATUS, serviceLocationLabel } from "@/components/campo/service-status";
import { StageCard } from "@/components/campo/stage-card";
import { stageDate, stagePeopleLine } from "@/components/campo/stage-people";
import {
  AppButton,
  Banner,
  ConfirmDialog,
  Divider,
  EmptyState,
  LoadingState,
  SectionTitle,
  Surface,
  screenStyles,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatQty } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

/** Um serviço (disciplina + local): situação, etapas registradas e materiais previstos. */
export default function CampoObraServicoScreen() {
  const {
    projectId: identifier,
    disciplineId,
    locationKey,
  } = useLocalSearchParams<{ projectId: string; disciplineId: string; locationKey?: string }>();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const obra = useFieldObra(identifier);
  // `getService` exige atribuição à obra, então só roda com `assigned`.
  const assigned = obra != null && obra.assigned;
  const service = useQuery(
    api.fieldServices.getService,
    assigned && disciplineId
      ? // Sem local ("Geral") a chave é vazia e pode nem vir na URL.
        { disciplineId: disciplineId as Id<"projectDisciplines">, locationKey: locationKey ?? "" }
      : "skip"
  );
  const currentUser = useQuery(api.users.getCurrentUser);
  const removeStage = useMutation(api.fieldServices.removeStage);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [removing, setRemoving] = useState<Id<"serviceStages"> | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeStage({ stageId: removing });
      toast.success("Etapa apagada");
      setRemoving(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível apagar a etapa"));
    } finally {
      setBusy(false);
    }
  }

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

  if (service === undefined) {
    return online ? (
      <LoadingState message="Carregando serviço..." />
    ) : (
      <OfflineState description="As etapas do serviço precisam de internet para carregar." />
    );
  }

  if (service === null) {
    return (
      <View style={styles.centered}>
        <EmptyState
          tone="neutral"
          icon={<ClipboardList size={30} color={colors.textSecondary} strokeWidth={1.8} />}
          title="Serviço não encontrado"
          description="A disciplina foi removida desta obra pela engenharia."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const status = SERVICE_STATUS[service.status];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: service.location ?? service.disciplineName }} />
      <ScrollView contentContainerStyle={[screenStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
        <OfflineBanner detail="As etapas podem estar desatualizadas." />

        <View style={styles.header}>
          {/* Sem local, o título da tela já é a disciplina. */}
          <Text style={[type.bodyStrong, styles.discipline]} numberOfLines={2}>
            {service.location ? service.disciplineName : serviceLocationLabel(null)}
          </Text>
          <StatusPill label={status.label} tone={status.tone} />
        </View>

        {service.status === "waiting" ? (
          <Banner tone="warning" title="Aguardando para continuar" detail={service.pendingNote ?? undefined} />
        ) : null}

        {service.fieldTeam ? (
          <AppButton
            label="Registrar etapa"
            size="lg"
            icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
            onPress={() => setSheetOpen(true)}
          />
        ) : null}

        <SectionTitle title="Etapas" style={styles.section} />
        {service.stages.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={30} color={colors.primary} strokeWidth={1.8} />}
            title="Nenhuma etapa registrada"
          />
        ) : (
          service.stages.map((stage) => {
            const people = stagePeopleLine(stage.participants, currentUser?._id);
            const date = stageDate(stage.createdAt);
            const mine = stage.createdByUserId === currentUser?._id && stage.reviewedAt === null;
            return (
              <StageCard
                key={stage._id}
                stage={stage}
                line={people ? `${people} · ${date}` : date}
                detailed
                action={
                  mine ? (
                    <AppButton
                      label="Apagar"
                      variant="ghost"
                      size="sm"
                      onPress={() => setRemoving(stage._id)}
                      style={styles.remove}
                    />
                  ) : null
                }
              />
            );
          })
        )}

        {service.materials.length > 0 ? (
          <>
            <SectionTitle title="Materiais previstos" style={styles.section} />
            <Surface padded={false}>
              {service.materials.map((material, index) => (
                <View key={`${index}:${material.description}`}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.material}>
                    <Text style={[type.body, styles.materialName]}>{material.description}</Text>
                    <Text style={[type.bodyStrong, { color: colors.text }]}>
                      {material.quantity === null ? "—" : formatQty(material.quantity, material.unit)}
                    </Text>
                  </View>
                </View>
              ))}
            </Surface>
            <AppButton
              label="Pedir material"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/campo/obra/[projectId]/estoque",
                  params: { projectId: identifier! },
                } as Href)
              }
            />
          </>
        ) : null}
      </ScrollView>

      {service.fieldTeam ? (
        <RegisterStageSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          projectId={service.projectId}
          disciplineId={service.disciplineId}
          disciplineName={service.disciplineName}
          location={service.location}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Apagar esta etapa?"
        description="Ela sai do histórico do serviço. Não dá para desfazer."
        confirmLabel="Apagar"
        destructive
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.screen },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  discipline: { flex: 1, minWidth: 0, color: colors.textSecondaryOnBg },
  section: { paddingHorizontal: 0, paddingTop: space.md, paddingBottom: 0 },
  remove: { alignSelf: "flex-start" },
  material: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  materialName: { flex: 1, minWidth: 0, color: colors.text },
});
