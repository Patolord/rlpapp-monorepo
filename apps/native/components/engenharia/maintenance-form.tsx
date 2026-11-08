import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { CloudOff, Plus, User } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { AppButton, Banner, ChoiceChips, ChoiceGroup, Field, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "@/lib/equipment-status";
import { MAINTENANCE_LOG_TYPE_OPTIONS, type MaintenanceLogType } from "@/lib/maintenance-log-type";
import { addPendingRecord, newPendingId } from "@/lib/offline-queue";
import { colors, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";

export const OBSERVATION_TAGS = [
  "Posicionada",
  "Instalada",
  "Em manutenção",
  "Esperando Material",
  "Sem Energia",
  "Sem Frente de Trabalho",
  "Aguardando Startup",
] as const;

const TEST_OPTIONS = [
  { value: "vacuum", label: "Vácuo conforme" },
  { value: "pressure", label: "Pressão conforme" },
  { value: "communication", label: "Comunicação conforme" },
  { value: "gas", label: "Carga de gás conforme" },
] as const;

type TestKey = (typeof TEST_OPTIONS)[number]["value"];

const STATUS_OPTIONS = (Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((value) => ({
  value,
  label: EQUIPMENT_STATUS_LABELS[value],
  tone: EQUIPMENT_STATUS_TONE[value],
}));

interface MaintenanceFormProps {
  equipmentId?: Id<"equipment">;
  qrToken: string;
  technicianName?: string;
  onQueued?: () => void;
}

/** Registrar instalação ou manutenção (ficha C7). Sem sinal, vai para a fila. */
export function MaintenanceForm({ equipmentId, qrToken, technicianName, onQueued }: MaintenanceFormProps) {
  const createLog = useMutation(api.maintenanceLogs.create);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [logType, setLogType] = useState<MaintenanceLogType | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | null>(null);
  const [tests, setTests] = useState<TestKey[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = {
    photos: photos.length === 0 ? "Tire ou escolha pelo menos uma foto" : undefined,
    type: logType === null ? "Escolha o tipo de registro" : undefined,
    status: status === null ? "Escolha a situação do equipamento" : undefined,
  };
  const valid = !missing.photos && !missing.type && !missing.status;

  function testsRecord(): Record<TestKey, boolean> {
    return {
      vacuum: tests.includes("vacuum"),
      pressure: tests.includes("pressure"),
      communication: tests.includes("communication"),
      gas: tests.includes("gas"),
    };
  }

  function reset() {
    setLogType(null);
    setTags([]);
    setNotes("");
    setStatus(null);
    setTests([]);
    setPhotos([]);
    setError(null);
    setTried(false);
  }

  async function queueOffline() {
    await addPendingRecord({
      id: newPendingId(),
      kind: "log",
      qrToken,
      logType: logType!,
      status: status!,
      tags,
      notes: notes.trim() || undefined,
      tests: testsRecord(),
      photos,
      createdAt: Date.now(),
    });
    reset();
    setOpen(false);
    toast.offline();
    onQueued?.();
  }

  async function submit() {
    setTried(true);
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!online || !equipmentId) {
        await queueOffline();
        return;
      }
      const photoIds = await uploadPhotos(generateUploadUrl, photos);
      await createLog({
        equipmentId,
        type: logType!,
        notes: notes.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        status: status!,
        tests: testsRecord(),
        photoIds,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      reset();
      setOpen(false);
      toast.success("Registro enviado");
    } catch (err) {
      console.error("Failed to create maintenance log:", err);
      if (!online) {
        await queueOffline();
      } else {
        setError(err instanceof Error && err.message ? err.message : "Não deu para salvar. Tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <AppButton
        label="Registrar instalação ou manutenção"
        block
        icon={<Plus size={20} color={colors.onPrimary} />}
        onPress={() => setOpen(true)}
      />
    );
  }

  const title = logType === "installation" ? "Nova instalação" : logType === "maintenance" ? "Nova manutenção" : "Novo registro";

  return (
    <Surface style={styles.card}>
      <View style={styles.head}>
        <Text style={[type.heading, { color: colors.text, flex: 1 }]}>{title}</Text>
        {!online ? (
          <View style={styles.offline}>
            <CloudOff size={16} color={colors.warning} />
            <Text style={[type.label, { color: colors.warning }]}>Sem internet</Text>
          </View>
        ) : null}
      </View>

      {technicianName ? (
        <View style={styles.responsible}>
          <User size={16} color={colors.icon} />
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Responsável: <Text style={{ color: colors.text, fontWeight: "600" }}>{technicianName}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.label}>Fotos</Text>
        <PhotoPicker uris={photos} onUrisChange={setPhotos} />
        {tried && missing.photos ? <Text style={styles.error}>{missing.photos}</Text> : null}
      </View>

      <ChoiceGroup
        label="Tipo de registro"
        value={logType}
        options={MAINTENANCE_LOG_TYPE_OPTIONS}
        onChange={setLogType}
        error={tried ? missing.type : undefined}
      />

      <ChoiceGroup
        label="Situação do equipamento"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(next) => {
          setStatus(next);
          if (next === "operational") setTags([]);
        }}
        error={tried ? missing.status : undefined}
      />

      {status !== null && status !== "operational" ? (
        <ChoiceChips
          label="O que está acontecendo"
          values={tags}
          options={OBSERVATION_TAGS.map((tag) => ({ value: tag, label: tag }))}
          onChange={setTags}
        />
      ) : null}

      <ChoiceChips label="Testes realizados" values={tests} options={[...TEST_OPTIONS]} onChange={setTests} />

      <Field
        label="Observações (opcional)"
        placeholder="Detalhe do serviço realizado"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {error ? <Banner tone="danger" title={error} actionLabel="Tentar de novo" onAction={() => void submit()} /> : null}

      <View style={styles.actions}>
        <AppButton
          label="Cancelar"
          variant="secondary"
          disabled={submitting}
          onPress={() => {
            reset();
            setOpen(false);
          }}
          style={{ flex: 1 }}
        />
        <AppButton
          label={online ? "Enviar" : "Salvar no aparelho"}
          loading={submitting}
          loadingLabel="Enviando…"
          onPress={() => void submit()}
          style={{ flex: 1 }}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xl, borderColor: colors.primary },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  offline: { flexDirection: "row", alignItems: "center", gap: 6 },
  responsible: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: -space.sm },
  block: { gap: 6 },
  label: { ...type.label, color: colors.text },
  error: { ...type.bodySm, color: colors.destructive },
  actions: { flexDirection: "row", gap: space.sm },
});
