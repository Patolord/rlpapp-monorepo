import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Building2, CheckCircle2, CloudOff } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { AppButton, Banner, ChoiceGroup, EmptyState, Field, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "@/lib/equipment-status";
import { addPendingRecord, newPendingId } from "@/lib/offline-queue";
import { colors, radius, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";

const STATUS_OPTIONS = (Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((value) => ({
  value,
  label: EQUIPMENT_STATUS_LABELS[value],
  tone: EQUIPMENT_STATUS_TONE[value],
}));

interface EquipmentFormProps {
  qrToken: string;
  /** Obra aberta no app de campo: a etiqueta passa a pertencer a ela. */
  project?: { _id: Id<"projects">; name: string } | null;
  onSuccess: (equipmentId: string) => void;
}

/** Cadastrar equipamento numa etiqueta livre (ficha C6). Sem sinal, vai para a fila. */
export function EquipmentForm({ qrToken, project, onSuccess }: EquipmentFormProps) {
  const registerForQr = useMutation(api.qrCodes.registerForQr);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();
  const toast = useToast();

  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("installing");
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingPhoto = photos.length === 0 ? "Tire uma foto da etiqueta ou placa do equipamento" : undefined;
  const missingDescription = description.trim().length === 0 ? "Descreva o equipamento e onde ele fica" : undefined;

  async function queueOffline() {
    await addPendingRecord({
      id: newPendingId(),
      kind: "equipment",
      qrToken,
      description: description.trim(),
      status,
      photos,
      projectId: project?._id,
      projectName: project?.name,
      createdAt: Date.now(),
    });
    toast.offline();
    setQueued(true);
  }

  async function submit() {
    setTried(true);
    if (missingPhoto || missingDescription) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!online) {
        await queueOffline();
        return;
      }
      const labelPhotoIds = await uploadPhotos(generateUploadUrl, photos);
      const equipmentId = await registerForQr({
        token: qrToken,
        description: description.trim(),
        labelPhotoIds,
        status,
        projectId: project?._id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast.success("Equipamento cadastrado");
      onSuccess(equipmentId as string);
    } catch (err) {
      console.error("Failed to register equipment:", err);
      if (!online) {
        await queueOffline();
      } else {
        setError(err instanceof Error && err.message ? err.message : "Não deu para cadastrar. Tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (queued) {
    return (
      <EmptyState
        tone="success"
        icon={<CheckCircle2 size={28} color={colors.success} />}
        title="Salvo no aparelho"
        description="O cadastro sobe sozinho quando o sinal voltar. Dá para acompanhar em Pendentes."
      />
    );
  }

  return (
    <Surface style={styles.card}>
      <View style={styles.head}>
        <Text style={[type.heading, { color: colors.text, flex: 1 }]}>Cadastrar equipamento</Text>
        {!online ? (
          <View style={styles.offline}>
            <CloudOff size={16} color={colors.warning} />
            <Text style={[type.label, { color: colors.warning }]}>Sem internet</Text>
          </View>
        ) : null}
      </View>

      {project ? (
        <View style={styles.note}>
          <Building2 size={16} color={colors.icon} />
          <Text style={[type.bodySm, { color: colors.textSecondary, flex: 1 }]}>
            A etiqueta fica vinculada à obra <Text style={{ color: colors.text, fontWeight: "600" }}>{project.name}</Text>.
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.label}>Foto da etiqueta</Text>
        <PhotoPicker uris={photos} onUrisChange={setPhotos} label="Foto da etiqueta" />
        {tried && missingPhoto ? <Text style={styles.error}>{missingPhoto}</Text> : null}
      </View>

      <Field
        label="Descrição"
        placeholder="Ex.: Evaporadora 12.000, sala do apto 121"
        value={description}
        onChangeText={setDescription}
        multiline
        error={tried ? missingDescription : undefined}
      />

      <ChoiceGroup label="Situação" value={status} options={STATUS_OPTIONS} onChange={setStatus} />

      {error ? <Banner tone="danger" title={error} actionLabel="Tentar de novo" onAction={() => void submit()} /> : null}

      <AppButton
        label={online ? "Cadastrar equipamento" : "Salvar no aparelho"}
        block
        loading={submitting}
        loadingLabel="Enviando…"
        onPress={() => void submit()}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xl },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  offline: { flexDirection: "row", alignItems: "center", gap: 6 },
  note: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.md },
  block: { gap: 6 },
  label: { ...type.label, color: colors.text },
  error: { ...type.bodySm, color: colors.destructive },
});
