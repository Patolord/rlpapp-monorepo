import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDate } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import { Building2, ExternalLink, MapPin, Pencil, UserRound, Users } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { TechniciansSheet } from "@/components/engenharia/predio/technicians-sheet";
import { ProjectFormSheet } from "@/components/engenharia/project-form-sheet";
import { PROJECT_STATUS, type ProjectStatus } from "@/components/engenharia/project-labels";
import { AppButton, EmptyState, ListRow, LoadingState, MetricStrip, Pill, SectionTitle, Surface } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "@/lib/equipment-status";
import { WEB_URL, openUrl } from "@/lib/links";
import { colors, radius, space, type } from "@/lib/theme";

/** Visão geral da obra (ficha O3): situação, andamento, responsável e técnicos. */
export default function ProjectHubScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const id = projectId as Id<"projects">;
  const project = useQuery(api.projects.getOverview, { projectId: id });
  const report = useQuery(api.reports.getProjectReport, { projectId: id, now });
  const technicians = useQuery(api.projects.getAssignedTechnicians, { projectId: id });

  if (project === undefined) return <LoadingState message="Carregando obra…" />;
  if (project === null) {
    return (
      <View style={{ padding: space.screen }}>
        <EmptyState
          icon={<Building2 size={28} color={colors.primary} />}
          title="Este item não está mais disponível"
          description="A obra pode ter sido removida ou arquivada."
          actionLabel="Voltar"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/obras"))}
        />
      </View>
    );
  }

  const progress = report?.progress;
  const status = project.status ? PROJECT_STATUS[project.status as ProjectStatus] : null;
  const dates = [project.startDate ? `Início ${formatDate(project.startDate)}` : null, project.endDate ? `Término ${formatDate(project.endDate)}` : null].filter(Boolean).join(" · ");

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.badges}>
        {status ? <Pill label={status.label} tone={status.tone} /> : null}
        {project.legacyNumber != null ? <Pill label={`Obra ${project.legacyNumber}`} dot={false} /> : null}
      </View>

      <MetricStrip
        items={[
          { label: "Instalados", value: progress ? progress.installed : project.installedItems, hint: progress ? `de ${progress.total}` : `de ${project.totalItems}` },
          { label: "Pendentes", value: progress ? progress.pending : project.totalItems - project.installedItems },
          { label: "Em atraso", value: progress ? progress.overdue : "—" },
        ]}
      />
      {progress ? (
        <View style={{ gap: space.xs }}>
          <View style={styles.track} accessibilityLabel={`Andamento ${progress.pct}%`}>
            <View style={[styles.bar, { width: `${Math.min(100, progress.pct)}%` }]} />
          </View>
          <Text style={[type.caption, { color: colors.textSecondaryOnBg }]}>{progress.pct}% instalado</Text>
        </View>
      ) : null}

      {report ? (
        <View style={styles.badges}>
          {(Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((s) =>
            report.byStatus[s] > 0 ? <Pill key={s} label={`${report.byStatus[s]} ${EQUIPMENT_STATUS_LABELS[s]}`} tone={EQUIPMENT_STATUS_TONE[s]} /> : null
          )}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionTitle title="Obra" action="Editar" onAction={() => setEditing(true)} />
        <ListRow icon={<UserRound size={20} color={colors.primary} />} title={project.responsibleName ?? "Sem engenheiro responsável"} subtitle="Responsável · recebe pedidos e decide exceções" chevron={false} onPress={() => setEditing(true)} />
        <ListRow
          icon={<Users size={20} color={colors.primary} />}
          title={technicians === undefined ? "Técnicos" : technicians.length === 0 ? "Nenhum técnico" : `${technicians.length} ${technicians.length === 1 ? "técnico" : "técnicos"}`}
          subtitle={technicians && technicians.length > 0 ? technicians.map((t) => t.name).join(", ") : "Quem vê a obra no app de campo"}
          onPress={() => setTechOpen(true)}
        />
        {project.address || dates ? (
          <Surface style={styles.info}>
            {project.address ? (
              <View style={styles.infoRow}>
                <MapPin size={16} color={colors.icon} />
                <Text style={[type.bodySm, { color: colors.text, flex: 1 }]}>{project.address}</Text>
              </View>
            ) : null}
            {dates ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{dates}</Text> : null}
          </Surface>
        ) : null}
      </View>

      <View style={styles.actions}>
        <AppButton label="Editar obra" variant="secondary" size="sm" icon={<Pencil size={16} color={colors.text} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
        <AppButton label="Relatório (web)" variant="secondary" size="sm" icon={<ExternalLink size={16} color={colors.text} />} onPress={() => openUrl(`${WEB_URL}/engenharia/obras/${project.slug}/imprimir`)} style={{ flex: 1 }} />
      </View>
      <AppButton label="Abrir o prédio" variant="ghost" block onPress={() => router.replace(`/obra/${projectId}/predio` as Href)} />

      <ProjectFormSheet
        open={editing}
        onClose={() => setEditing(false)}
        project={{
          _id: project._id,
          name: project.name,
          legacyNumber: project.legacyNumber,
          customerId: project.customerId,
          address: project.address,
          status: project.status as ProjectStatus | null,
          responsibleId: project.responsibleId,
          startDate: project.startDate,
          endDate: project.endDate,
        }}
      />
      <TechniciansSheet open={techOpen} onClose={() => setTechOpen(false)} projectId={id} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.lg },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  info: { gap: space.sm },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
});
