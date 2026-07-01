import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { CheckCircle2, CloudOff, Loader2 } from "lucide-react-native";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import {
  EQUIPMENT_STATUS_OPTIONS,
  type EquipmentStatus,
} from "@/lib/equipment-status";
import { addPendingRecord, newPendingId } from "@/lib/offline-queue";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";

interface EquipmentFormProps {
  qrToken: string;
  onSuccess: (equipmentId: string) => void;
}

export function EquipmentForm({ qrToken, onSuccess }: EquipmentFormProps) {
  const createEquipment = useMutation(api.equipment.create);
  const assignQr = useMutation(api.qrCodes.assignEquipment);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();

  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("installing");
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = photos.length > 0 && description.trim().length > 0;

  async function queueOffline() {
    await addPendingRecord({
      id: newPendingId(),
      kind: "equipment",
      qrToken,
      description: description.trim(),
      status,
      photos,
      createdAt: Date.now(),
    });
    setQueued(true);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!online) {
        await queueOffline();
        return;
      }

      const labelPhotoIds = await uploadPhotos(generateUploadUrl, photos);
      const equipmentId = await createEquipment({
        description: description.trim(),
        labelPhotoIds,
        status,
        qrToken,
      });

      await assignQr({ token: qrToken, equipmentId });
      onSuccess(equipmentId as string);
    } catch (err) {
      console.error("Failed to register equipment:", err);
      if (!online) {
        await queueOffline();
      } else {
        setError("Não foi possível registrar. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (queued) {
    return (
      <Card>
        <CardContent className="items-center gap-3 py-6">
          <CheckCircle2 size={48} color="#16a34a" />
          <Text className="text-xl font-bold text-foreground">
            Salvo no aparelho
          </Text>
          <Text className="text-center text-base text-muted-foreground">
            Sem internet agora. O cadastro será enviado automaticamente quando a
            conexão voltar. Você também pode enviar manualmente na tela de
            Registros Pendentes.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <CardTitle>Registrar Equipamento</CardTitle>
          {!online && (
            <View className="flex-row items-center gap-1.5">
              <CloudOff size={16} color="#d97706" />
              <Text className="text-sm text-amber-600">Sem internet</Text>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-5">
        <View className="gap-2">
          <Label className="text-base">Foto da etiqueta *</Label>
          <Text className="text-sm text-muted-foreground">
            Tire uma foto da etiqueta/placa do equipamento.
          </Text>
          <PhotoPicker
            uris={photos}
            onUrisChange={setPhotos}
            label="Foto da etiqueta"
          />
        </View>

        <View className="gap-2">
          <Label className="text-base">Descrição geral *</Label>
          <Textarea
            placeholder="Ex: VRF no bloco A, 3º andar"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="gap-2">
          <Label className="text-base">Situação</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as EquipmentStatus)}
            options={EQUIPMENT_STATUS_OPTIONS}
            className="h-14"
          />
        </View>

        {error && <Text className="text-sm text-destructive">{error}</Text>}

        <Button
          className="h-14 w-full"
          disabled={submitting || !canSubmit}
          onPress={handleSubmit}
        >
          {submitting && <Loader2 size={20} color="#fafafa" />}
          <ButtonText className="text-base">
            {submitting
              ? " Registrando..."
              : online
                ? "Registrar Equipamento"
                : "Salvar no aparelho"}
          </ButtonText>
        </Button>
      </CardContent>
    </Card>
  );
}
