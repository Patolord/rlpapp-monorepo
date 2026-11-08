import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Image } from "expo-image";
import { CheckCircle2, ImagePlus, XCircle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, Pill, Surface } from "@/components/ui";
import type { EquipmentStatus } from "@/lib/equipment-status";
import { getMaintenanceLogTypeLabel, type MaintenanceLogType } from "@/lib/maintenance-log-type";
import { colors, radius, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";

interface MaintenanceLogProps {
  log: {
    _id: string;
    type?: MaintenanceLogType;
    technicianName: string;
    notes?: string;
    tags?: string[];
    status: EquipmentStatus;
    tests?: {
      vacuum: boolean;
      pressure: boolean;
      communication: boolean;
      gas?: boolean;
    };
    photoUrls: string[];
    createdAt: number;
  };
}

function TestItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <View style={styles.test} accessibilityLabel={`${label}: ${passed ? "conforme" : "não conforme"}`}>
      {passed ? <CheckCircle2 size={16} color={colors.success} /> : <XCircle size={16} color={colors.destructive} />}
      <Text style={[type.bodySm, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

/** Um serviço no histórico do equipamento (ficha C5). */
export function MaintenanceLogCard({ log }: MaintenanceLogProps) {
  const [adding, setAdding] = useState(false);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotos = useMutation(api.maintenanceLogs.addPhotos);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);

  const date = new Date(log.createdAt);
  const when = `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  async function savePhotos() {
    if (newPhotos.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoIds = await uploadPhotos(generateUploadUrl, newPhotos);
      await addPhotos({ logId: log._id as Id<"maintenanceLogs">, photoIds });
      setNewPhotos([]);
      setAdding(false);
    } catch (err) {
      console.error("Failed to add photos:", err);
      setError("Não deu para salvar as fotos. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Surface style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{getMaintenanceLogTypeLabel(log.type ?? "maintenance")}</Text>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            {when} · {log.technicianName}
          </Text>
        </View>
        <StatusBadge status={log.status} />
      </View>

      {log.tags && log.tags.length > 0 ? (
        <View style={styles.tags}>
          {log.tags.map((tag) => (
            <Pill key={tag} label={tag} dot={false} />
          ))}
        </View>
      ) : null}

      {log.notes ? <Text style={[type.body, { color: colors.text }]}>{log.notes}</Text> : null}

      {log.tests ? (
        <View style={styles.tests}>
          <TestItem label="Vácuo" passed={log.tests.vacuum} />
          <TestItem label="Pressão" passed={log.tests.pressure} />
          <TestItem label="Comunicação" passed={log.tests.communication} />
          {log.tests.gas !== undefined ? <TestItem label="Carga de gás" passed={log.tests.gas} /> : null}
        </View>
      ) : null}

      {log.photoUrls.length > 0 ? (
        <View style={styles.photos}>
          {log.photoUrls.map((url, index) => (
            <Image key={index} source={{ uri: url }} style={styles.photo} contentFit="cover" accessibilityLabel={`Foto ${index + 1}`} />
          ))}
        </View>
      ) : null}

      {adding ? (
        <View style={styles.add}>
          <PhotoPicker uris={newPhotos} onUrisChange={setNewPhotos} label="Foto" />
          {error ? <Text style={[type.bodySm, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.addActions}>
            <AppButton
              label="Cancelar"
              variant="secondary"
              size="sm"
              disabled={submitting}
              onPress={() => {
                setAdding(false);
                setNewPhotos([]);
                setError(null);
              }}
              style={{ flex: 1 }}
            />
            <AppButton
              label="Salvar fotos"
              size="sm"
              loading={submitting}
              loadingLabel="Enviando…"
              disabled={newPhotos.length === 0}
              onPress={() => void savePhotos()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={styles.addLink} hitSlop={6}>
          <ImagePlus size={16} color={colors.primary} />
          <Text style={[type.label, { color: colors.primary, fontWeight: "600" }]}>Adicionar fotos</Text>
        </Pressable>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tests: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs },
  test: { flexDirection: "row", alignItems: "center", gap: 6 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  photo: { width: "31%", aspectRatio: 1, borderRadius: radius.sm },
  add: { gap: space.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.md },
  addActions: { flexDirection: "row", gap: space.sm },
  addLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36 },
});
