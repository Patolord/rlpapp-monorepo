import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Building2,
  Clock,
  CloudOff,
  QrCode,
  Tag,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, CardContent } from "@/components/ui/card";
import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { COLORS } from "@/lib/colors";
import type { EquipmentStatus } from "@/lib/equipment-status";
import {
  cacheEquipment,
  getCachedEquipment,
  type CachedEquipment,
} from "@/lib/offline-queue";
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
 * Tela de uma etiqueta QR: cadastro do equipamento (se ainda não existe),
 * registro de instalação/manutenção e histórico. Funciona offline a partir
 * do cache local.
 */
export function EquipmentTokenView({ token, project }: EquipmentTokenViewProps) {
  const insets = useSafeAreaInsets();
  const bg = COLORS.background;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Content token={token} project={project ?? null} />
      </ScrollView>
    </View>
  );
}

function Content({
  token,
  project,
}: {
  token: string;
  project: FieldProjectRef | null;
}) {
  const online = useOnline();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    if (data === undefined) return;
    void cacheEquipment({
      token,
      cachedAt: Date.now(),
      equipment: data?.equipment
        ? {
            description: data.equipment.description,
            status: data.equipment.status,
            createdAt: data.equipment.createdAt,
          }
        : null,
      project: data?.project
        ? {
            projectId: data.project.projectId,
            projectName: data.project.projectName,
          }
        : null,
    });
  }, [data, token]);

  if (data === undefined) {
    if (!online) return <OfflineContent token={token} project={project} />;
    return (
      <View className="items-center justify-center py-24">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (data === null) {
    return (
      <View className="items-center gap-4 py-16">
        <AlertTriangle size={48} color="#eab308" />
        <Text className="text-center text-2xl font-bold text-foreground">
          Código QR não encontrado
        </Text>
        <Text className="text-center text-muted-foreground">
          Este código QR ({token}) não está registrado no sistema.
        </Text>
      </View>
    );
  }

  const { qrCode, equipment } = data;

  // Válvula de escape: etiqueta de outra obra abre normalmente, só avisa.
  const otherProject =
    project && data.project && data.project.projectId !== project._id
      ? data.project
      : null;

  if (!equipment) {
    return (
      <View className="gap-4">
        {otherProject ? <OtherObraNotice name={otherProject.projectName} /> : null}
        <View className="items-center gap-2">
          <QrCode size={40} color="#737373" />
          <Text className="text-xl font-bold text-foreground">
            Novo Equipamento
          </Text>
          <Text className="text-sm text-muted-foreground">
            Código QR: {qrCode.token}
          </Text>
        </View>
        <EquipmentForm
          qrToken={token}
          project={project}
          onSuccess={() => {}}
        />
      </View>
    );
  }

  return (
    <EquipmentDetail
      equipmentId={equipment._id}
      equipment={{
        description: equipment.description,
        status: equipment.status,
        createdAt: equipment.createdAt,
      }}
      qrToken={token}
      currentUserName={currentUser?.name}
      otherProjectName={otherProject?.projectName ?? null}
    />
  );
}

function OtherObraNotice({ name }: { name: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3">
      <Building2 size={18} color="#2563eb" />
      <Text className="flex-1 text-sm text-blue-900">
        Esta etiqueta pertence à obra{" "}
        <Text className="font-semibold">{name}</Text>. O cadastro vai
        vinculá-la à obra que você abriu.
      </Text>
    </View>
  );
}

function OfflineContent({
  token,
  project,
}: {
  token: string;
  project: FieldProjectRef | null;
}) {
  const [cached, setCached] = useState<CachedEquipment | null | undefined>(
    undefined
  );

  useEffect(() => {
    let alive = true;
    void getCachedEquipment(token).then((entry) => {
      if (alive) setCached(entry);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (cached === undefined) {
    return (
      <View className="items-center justify-center py-24">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <CloudOff size={20} color="#92400e" />
        <Text className="flex-1 text-sm text-amber-800">
          Sem internet. Os registros serão salvos no aparelho e enviados quando a
          conexão voltar.
        </Text>
      </View>

      {cached?.equipment ? (
        <>
          <EquipmentCard
            description={cached.equipment.description}
            status={cached.equipment.status}
          />
          <MaintenanceForm qrToken={token} />
        </>
      ) : (
        <>
          <View className="items-center gap-2">
            <QrCode size={40} color="#737373" />
            <Text className="text-xl font-bold text-foreground">
              Código QR: {token}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              Se este equipamento ainda não foi cadastrado, registre abaixo.
            </Text>
          </View>
          {cached?.project &&
          project &&
          cached.project.projectId !== project._id ? (
            <OtherObraNotice name={cached.project.projectName} />
          ) : null}
          <EquipmentForm qrToken={token} project={project} onSuccess={() => {}} />
          <Text className="text-center text-sm text-muted-foreground">
            Equipamento já cadastrado? Registre a instalação ou manutenção:
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
  lastMaintenanceDate,
}: {
  description?: string;
  status: EquipmentStatus;
  lastMaintenanceDate?: string | null;
}) {
  return (
    <Card>
      <CardContent>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 flex-row items-center gap-2 pr-2">
            <Tag size={16} color="#737373" />
            <Text className="text-xl font-bold text-foreground">
              {description ?? "Equipamento"}
            </Text>
          </View>
          <StatusBadge status={status} />
        </View>
        {lastMaintenanceDate ? (
          <View className="mt-3 flex-row items-center gap-2 border-t border-border/40 pt-3">
            <Clock size={14} color="#737373" />
            <Text className="text-sm text-muted-foreground">
              Último registro: {lastMaintenanceDate}
            </Text>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EquipmentDetail({
  equipmentId,
  equipment,
  qrToken,
  currentUserName,
  otherProjectName,
}: {
  equipmentId: Id<"equipment">;
  equipment: { description?: string; status: EquipmentStatus; createdAt: number };
  qrToken: string;
  currentUserName?: string;
  otherProjectName: string | null;
}) {
  const logs = useQuery(api.maintenanceLogs.listByEquipment, { equipmentId });

  const lastMaintenance = logs?.[0];
  const lastMaintenanceDate = lastMaintenance
    ? new Date(lastMaintenance.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <View className="gap-4">
      {otherProjectName ? <OtherObraNotice name={otherProjectName} /> : null}

      <EquipmentCard
        description={equipment.description}
        status={equipment.status}
        lastMaintenanceDate={lastMaintenanceDate}
      />

      <MaintenanceForm
        equipmentId={equipmentId}
        qrToken={qrToken}
        technicianName={currentUserName}
      />

      {logs === undefined ? (
        <View className="items-center justify-center py-8">
          <ActivityIndicator />
        </View>
      ) : logs.length > 0 ? (
        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">
            Histórico ({logs.length})
          </Text>
          {logs.map((log) => (
            <MaintenanceLogCard key={log._id} log={log} />
          ))}
        </View>
      ) : (
        <Text className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro de manutenção encontrado.
        </Text>
      )}
    </View>
  );
}
