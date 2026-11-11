import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Building2, CloudOff, QrCode, SearchX, Tag } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Banner, EmptyState, LoadingState, SectionTitle, Surface } from "@/components/ui";
import type { EquipmentStatus } from "@/lib/equipment-status";
import { cacheEquipment, getCachedEquipment, type CachedEquipment } from "@/lib/offline-queue";
import { colors, radius, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

export interface FieldProjectRef {
  _id: Id<"projects">;
  name: string;
}

interface EquipmentTokenViewProps {
  token: string;
  /**
   * Obra aberta no app de campo. Um cadastro novo vincula a etiqueta a ela
   * (a obra aberta vence o destino do lote). Etiqueta de outra obra só avisa.
   */
  project?: FieldProjectRef | null;
}

/**
 * Etiqueta QR (fichas C5, C6 e C7): cadastro do equipamento quando a etiqueta
 * está livre, registro de instalação/manutenção e histórico. Sem sinal, usa o
 * que ficou salvo no aparelho.
 */
export function EquipmentTokenView({ token, project }: EquipmentTokenViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Content token={token} project={project ?? null} />
      </ScrollView>
    </View>
  );
}

function Content({ token, project }: { token: string; project: FieldProjectRef | null }) {
  const online = useOnline();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    if (data === undefined) return;
    void cacheEquipment({
      token,
      cachedAt: Date.now(),
      equipment: data?.equipment
        ? { description: data.equipment.description, status: data.equipment.status, createdAt: data.equipment.createdAt }
        : null,
      project: data?.project ? { projectId: data.project.projectId, projectName: data.project.projectName } : null,
    });
  }, [data, token]);

  if (data === undefined) {
    if (!online) return <OfflineContent token={token} project={project} />;
    return <LoadingState />;
  }

  if (data === null) {
    return (
      <EmptyState
        tone="warning"
        icon={<SearchX size={28} color={colors.warning} />}
        title="Etiqueta não encontrada"
        description={`O código ${token} não está cadastrado. Confira se digitou certo ou escaneie de novo.`}
        style={{ marginTop: space.xxl }}
      />
    );
  }

  const { qrCode, equipment } = data;
  // Válvula de escape: etiqueta de outra obra abre normalmente, só avisa.
  const otherProject = project && data.project && data.project.projectId !== project._id ? data.project : null;

  if (!equipment) {
    return (
      <View style={styles.stack}>
        {otherProject ? <OtherObraNotice name={otherProject.projectName} /> : null}
        <FreeTagHeader token={qrCode.token} />
        <EquipmentForm qrToken={token} project={project} onSuccess={() => {}} />
      </View>
    );
  }

  return (
    <EquipmentDetail
      equipmentId={equipment._id}
      equipment={{ description: equipment.description, status: equipment.status, createdAt: equipment.createdAt }}
      projectName={data.project?.projectName ?? null}
      qrToken={token}
      currentUserName={currentUser?.name}
      otherProjectName={otherProject?.projectName ?? null}
    />
  );
}

function FreeTagHeader({ token }: { token: string }) {
  return (
    <View style={styles.freeHead}>
      <View style={styles.freeIcon}>
        <QrCode size={26} color={colors.primary} />
      </View>
      <Text style={[type.title, { color: colors.text }]}>Etiqueta livre</Text>
      <Text style={[type.bodySm, { color: colors.textSecondaryOnBg, textAlign: "center" }]}>
        Código {token}. Cadastre o equipamento em que ela foi colada.
      </Text>
    </View>
  );
}

function OtherObraNotice({ name }: { name: string }) {
  return (
    <Banner
      tone="info"
      icon={<Building2 size={18} color={colors.info} />}
      title={`Esta etiqueta é da obra ${name}`}
      detail="O cadastro vai vinculá-la à obra que você abriu."
    />
  );
}

function OfflineContent({ token, project }: { token: string; project: FieldProjectRef | null }) {
  const [cached, setCached] = useState<CachedEquipment | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void getCachedEquipment(token).then((entry) => {
      if (alive) setCached(entry);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (cached === undefined) return <LoadingState />;

  const when = cached
    ? new Date(cached.cachedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <View style={styles.stack}>
      <Banner
        tone="warning"
        icon={<CloudOff size={18} color={colors.warning} />}
        title={when ? `Sem conexão · dados de ${when}` : "Sem conexão"}
        detail="O que você registrar fica salvo no aparelho e sobe quando o sinal voltar."
      />
      {cached?.equipment ? (
        <>
          <EquipmentCard description={cached.equipment.description} status={cached.equipment.status} projectName={cached.project?.projectName ?? null} />
          <MaintenanceForm qrToken={token} />
        </>
      ) : (
        <>
          <FreeTagHeader token={token} />
          {cached?.project && project && cached.project.projectId !== project._id ? <OtherObraNotice name={cached.project.projectName} /> : null}
          <EquipmentForm qrToken={token} project={project} onSuccess={() => {}} />
          <Text style={[type.bodySm, { color: colors.textSecondaryOnBg, textAlign: "center" }]}>
            Equipamento já cadastrado? Registre a instalação ou a manutenção:
          </Text>
          <MaintenanceForm qrToken={token} />
        </>
      )}
    </View>
  );
}

function EquipmentCard({
  description,
  status,
  projectName,
  lastService,
}: {
  description?: string;
  status: EquipmentStatus;
  projectName: string | null;
  lastService?: string | null;
}) {
  return (
    <Surface style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.tile}>
          <Tag size={20} color={colors.primary} />
        </View>
        <Text style={[type.heading, { color: colors.text, flex: 1 }]}>{description || "Equipamento"}</Text>
        <StatusBadge status={status} />
      </View>
      {projectName || lastService ? (
        <View style={styles.meta}>
          {projectName ? <Text style={styles.metaText}>Obra {projectName}</Text> : null}
          {lastService ? <Text style={styles.metaText}>Último serviço em {lastService}</Text> : null}
        </View>
      ) : null}
    </Surface>
  );
}

function EquipmentDetail({
  equipmentId,
  equipment,
  projectName,
  qrToken,
  currentUserName,
  otherProjectName,
}: {
  equipmentId: Id<"equipment">;
  equipment: { description?: string; status: EquipmentStatus; createdAt: number };
  projectName: string | null;
  qrToken: string;
  currentUserName?: string;
  otherProjectName: string | null;
}) {
  const logs = useQuery(api.maintenanceLogs.listByEquipment, { equipmentId });
  const last = logs?.[0];
  const lastService = last ? new Date(last.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  return (
    <View style={styles.stack}>
      {otherProjectName ? <OtherObraNotice name={otherProjectName} /> : null}
      <EquipmentCard description={equipment.description} status={equipment.status} projectName={projectName} lastService={lastService} />
      <MaintenanceForm equipmentId={equipmentId} qrToken={qrToken} technicianName={currentUserName} />
      <View style={styles.history}>
        <SectionTitle title={logs && logs.length > 0 ? `Histórico (${logs.length})` : "Histórico"} />
        {logs === undefined ? (
          <LoadingState />
        ) : logs.length > 0 ? (
          logs.map((log) => <MaintenanceLogCard key={log._id} log={log} />)
        ) : (
          <Surface>
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum serviço registrado ainda.</Text>
          </Surface>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.screen, gap: space.lg },
  stack: { gap: space.lg },
  freeHead: { alignItems: "center", gap: space.xs, paddingVertical: space.sm },
  freeIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  card: { gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  meta: { gap: 2, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.md },
  metaText: { ...type.bodySm, color: colors.textSecondary },
  history: { gap: space.sm },
});
