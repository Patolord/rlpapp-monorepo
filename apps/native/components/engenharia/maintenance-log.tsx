import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Calendar,
  CheckCircle2,
  ImagePlus,
  Loader2,
  User,
  XCircle,
} from "lucide-react-native";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import {
  getMaintenanceLogTypeLabel,
  type MaintenanceLogType,
} from "@/lib/maintenance-log-type";
import type { EquipmentStatus } from "@/lib/equipment-status";
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
    <View className="flex-row items-center gap-1.5">
      {passed ? (
        <CheckCircle2 size={16} color="#16a34a" />
      ) : (
        <XCircle size={16} color="#ef4444" />
      )}
      <Text className="text-sm text-foreground">{label}</Text>
    </View>
  );
}

export function MaintenanceLogCard({ log }: MaintenanceLogProps) {
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotosMutation = useMutation(api.maintenanceLogs.addPhotos);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);

  const date = new Date(log.createdAt);
  const formattedDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isInstallation = log.type === "installation";

  async function handleSavePhotos() {
    if (newPhotos.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoIds = await uploadPhotos(generateUploadUrl, newPhotos);
      await addPhotosMutation({
        logId: log._id as Id<"maintenanceLogs">,
        photoIds,
      });
      setNewPhotos([]);
      setAddingPhotos(false);
    } catch (err) {
      console.error("Failed to add photos:", err);
      setError("Não foi possível salvar as fotos. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="gap-3">
        <View className="flex-row items-start justify-between">
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Calendar size={14} color="#737373" />
              <Text className="text-sm text-muted-foreground">
                {formattedDate} {formattedTime}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <User size={14} color="#737373" />
              <Text className="text-sm text-muted-foreground">
                {log.technicianName}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Badge variant={isInstallation ? "default" : "secondary"}>
              {getMaintenanceLogTypeLabel(log.type ?? "maintenance")}
            </Badge>
            <StatusBadge status={log.status} />
          </View>
        </View>

        {log.tags && log.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {log.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </View>
        )}

        {log.notes ? (
          <Text className="text-sm leading-relaxed text-foreground">
            {log.notes}
          </Text>
        ) : null}

        {log.tests && (
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <TestItem label="Vácuo" passed={log.tests.vacuum} />
            <TestItem label="Pressão" passed={log.tests.pressure} />
            <TestItem label="Comunicação" passed={log.tests.communication} />
            {log.tests.gas !== undefined && (
              <TestItem label="Carga de gás" passed={log.tests.gas} />
            )}
          </View>
        )}

        {log.photoUrls.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {log.photoUrls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={{ width: "31%", aspectRatio: 1, borderRadius: 8 }}
                contentFit="cover"
              />
            ))}
          </View>
        )}

        {addingPhotos ? (
          <View className="gap-3 border-t border-border/40 pt-3">
            <PhotoPicker
              uris={newPhotos}
              onUrisChange={setNewPhotos}
              label="Foto"
            />
            {error && <Text className="text-sm text-destructive">{error}</Text>}
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={submitting}
                onPress={() => {
                  setAddingPhotos(false);
                  setNewPhotos([]);
                  setError(null);
                }}
              >
                <ButtonText variant="outline">Cancelar</ButtonText>
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={submitting || newPhotos.length === 0}
                onPress={handleSavePhotos}
              >
                {submitting && <Loader2 size={16} color="#fafafa" />}
                <ButtonText>
                  {submitting ? " Salvando..." : "Salvar Fotos"}
                </ButtonText>
              </Button>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setAddingPhotos(true)}
            className="flex-row items-center justify-center gap-2 py-1.5"
          >
            <ImagePlus size={16} color="#737373" />
            <Text className="text-sm text-muted-foreground">
              Adicionar Fotos
            </Text>
          </Pressable>
        )}
      </CardContent>
    </Card>
  );
}
