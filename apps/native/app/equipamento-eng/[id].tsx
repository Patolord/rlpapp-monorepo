import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Pencil, QrCode } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, ChoiceGroup, EmptyState, Field, KeyValueList, LoadingState, SectionTitle, Sheet, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "@/lib/equipment-status";
import { getErrorMessage } from "@/lib/errors";
import { formatShortDateTime } from "@/lib/format";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, space, type } from "@/lib/theme";

const STATUS_OPTIONS = (Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((value) => ({ value, label: EQUIPMENT_STATUS_LABELS[value], tone: EQUIPMENT_STATUS_TONE[value] }));

/** Equipamento na engenharia (ficha G3): dados, etiqueta, histórico e editar. */
export default function EquipamentoEngScreen() {
  const header = useNativeHeaderOptions();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const equipmentId = id as Id<"equipment">;
  const equipment = useQuery(api.equipment.getForEngineering, { id: equipmentId });
  const qr = useQuery(api.qrCodes.getByEquipmentId, { equipmentId });
  const logs = useQuery(api.maintenanceLogs.listByEquipment, { equipmentId });
  const update = useMutation(api.equipment.update);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("installing");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!equipment) return;
    setDescription(equipment.description ?? "");
    setStatus(equipment.status);
  }, [equipment, editing]);

  async function save() {
    setSaving(true);
    try {
      await update({ id: equipmentId, description: description.trim() || undefined, status });
      toast.success("Equipamento salvo");
      setEditing(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar"));
    } finally {
      setSaving(false);
    }
  }

  if (equipment === undefined) return <LoadingState />;
  if (equipment === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.screen }}>
        <Stack.Screen options={{ ...header, title: "Equipamento" }} />
        <EmptyState title="Este item não está mais disponível" description="O equipamento pode ter sido removido." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ ...header, title: "Equipamento" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={{ gap: space.sm }}>
          <View style={styles.row}>
            <Text style={[type.heading, { color: colors.text, flex: 1 }]}>{equipment.description || "Equipamento sem descrição"}</Text>
            <StatusBadge status={equipment.status} />
          </View>
          <Text style={[type.caption, { color: colors.textSecondary }]}>Cadastrado {formatShortDateTime(equipment.createdAt)}</Text>
        </Surface>
        <KeyValueList
          items={[
            { label: "Etiqueta", value: qr?.token ?? (qr === null ? "Sem etiqueta" : null) },
            { label: "Tipo", value: equipment.type },
            { label: "Tag", value: equipment.tag },
            { label: "Observações", value: equipment.notes },
          ]}
        />
        <View style={styles.actions}>
          <AppButton label="Editar" variant="secondary" size="sm" icon={<Pencil size={16} color={colors.text} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
          {qr?.token ? (
            <AppButton label="Abrir etiqueta" variant="secondary" size="sm" icon={<QrCode size={16} color={colors.text} />} onPress={() => router.push(`/equipamento/${qr.token}` as Href)} style={{ flex: 1 }} />
          ) : null}
        </View>
        <View style={{ gap: space.sm }}>
          <SectionTitle title={logs && logs.length > 0 ? `Histórico (${logs.length})` : "Histórico"} />
          {logs === undefined ? <LoadingState /> : logs.length === 0 ? <Surface><Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum serviço registrado.</Text></Surface> : logs.map((log) => <MaintenanceLogCard key={log._id} log={log} />)}
        </View>
      </ScrollView>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar equipamento" footer={<AppButton label="Salvar" block loading={saving} onPress={() => void save()} />}>
        <View style={{ gap: space.lg }}>
          <Field label="Descrição" value={description} onChangeText={setDescription} multiline />
          <ChoiceGroup<EquipmentStatus> label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  actions: { flexDirection: "row", gap: space.sm },
});
