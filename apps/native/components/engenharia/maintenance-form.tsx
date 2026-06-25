import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { CloudOff, Loader2, Plus, User } from "lucide-react-native";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import {
  EQUIPMENT_STATUS_OPTIONS,
  type EquipmentStatus,
} from "@/lib/equipment-status";
import {
  MAINTENANCE_LOG_TYPE_OPTIONS,
  type MaintenanceLogType,
} from "@/lib/maintenance-log-type";
import {
  addPendingRecord,
  newPendingId,
} from "@/lib/offline-queue";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";

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
  { key: "vacuum", label: "Vácuo conforme" },
  { key: "pressure", label: "Pressão conforme" },
  { key: "communication", label: "Comunicação conforme" },
  { key: "gas", label: "Carga de gás conforme" },
] as const;

type TestKey = (typeof TEST_OPTIONS)[number]["key"];

interface MaintenanceFormProps {
  equipmentId?: Id<"equipment">;
  qrToken: string;
  technicianName?: string;
  onQueued?: () => void;
}

export function MaintenanceForm({
  equipmentId,
  qrToken,
  technicianName,
  onQueued,
}: MaintenanceFormProps) {
  const createLog = useMutation(api.maintenanceLogs.create);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MaintenanceLogType | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | null>(null);
  const [tests, setTests] = useState<Record<TestKey, boolean>>({
    vacuum: false,
    pressure: false,
    communication: false,
    gas: false,
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = photos.length > 0 && type !== null && status !== null;

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function resetForm() {
    setType(null);
    setSelectedTags([]);
    setNotes("");
    setStatus(null);
    setTests({ vacuum: false, pressure: false, communication: false, gas: false });
    setPhotos([]);
    setError(null);
  }

  async function queueOffline() {
    await addPendingRecord({
      id: newPendingId(),
      kind: "log",
      qrToken,
      logType: type!,
      status: status!,
      tags: selectedTags,
      notes: notes.trim() || undefined,
      tests,
      photos,
      createdAt: Date.now(),
    });
    resetForm();
    setOpen(false);
    onQueued?.();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
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
        type: type!,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        status: status!,
        tests,
        photoIds,
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Failed to create maintenance log:", err);
      if (!online) {
        await queueOffline();
      } else {
        setError("Não foi possível salvar. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button className="h-14 w-full" size="lg" onPress={() => setOpen(true)}>
        <Plus size={20} color="#fafafa" />
        <ButtonText className="ml-2 text-base">
          Registrar Instalação ou Manutenção
        </ButtonText>
      </Button>
    );
  }

  return (
    <Card className="border border-primary/20">
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <CardTitle>
            {type === "installation"
              ? "Nova Instalação"
              : type === "maintenance"
                ? "Nova Manutenção"
                : "Novo Registro"}
          </CardTitle>
          {!online && (
            <View className="flex-row items-center gap-1.5">
              <CloudOff size={16} color="#d97706" />
              <Text className="text-sm text-amber-600">Sem internet</Text>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-5">
        {technicianName && (
          <View className="flex-row items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-4 py-3">
            <User size={16} color="#737373" />
            <Text className="text-base text-foreground">
              Responsável:{" "}
              <Text className="font-semibold">{technicianName}</Text>
            </Text>
          </View>
        )}

        <View className="gap-2">
          <Label className="text-base">Fotos *</Label>
          <Text className="text-sm text-muted-foreground">
            Pelo menos uma foto é obrigatória.
          </Text>
          <PhotoPicker uris={photos} onUrisChange={setPhotos} />
        </View>

        <View className="gap-2">
          <Label className="text-base">Tipo de Registro *</Label>
          <Select
            value={type ?? ""}
            onValueChange={(v) => setType(v as MaintenanceLogType)}
            options={MAINTENANCE_LOG_TYPE_OPTIONS}
            placeholder="Selecione o tipo"
            className="h-14"
          />
        </View>

        <View className="gap-2">
          <Label className="text-base">Situação do equipamento *</Label>
          <Select
            value={status ?? ""}
            onValueChange={(v) => {
              const next = v as EquipmentStatus;
              setStatus(next);
              if (next === "operational") setSelectedTags([]);
            }}
            options={EQUIPMENT_STATUS_OPTIONS}
            placeholder="Selecione a situação"
            className="h-14"
          />
        </View>

        {status !== null && status !== "operational" && (
          <View className="gap-2">
            <Label className="text-base">Situação</Label>
            <View className="flex-row flex-wrap gap-2">
              {OBSERVATION_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-4 py-2.5",
                      selected
                        ? "border-primary bg-primary"
                        : "border-input bg-card"
                    )}
                  >
                    <Text
                      className={cn(
                        "text-base",
                        selected
                          ? "text-primary-foreground"
                          : "text-foreground"
                      )}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View className="gap-3">
          <Label className="text-base">Testes Realizados</Label>
          <View className="gap-2.5">
            {TEST_OPTIONS.map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() =>
                  setTests((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                className="flex-row items-center gap-3"
              >
                <Checkbox
                  checked={tests[key]}
                  onCheckedChange={(v) =>
                    setTests((prev) => ({ ...prev, [key]: v }))
                  }
                />
                <Text className="text-base text-foreground">{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Label className="text-base">Observações adicionais</Label>
          <Textarea
            placeholder="Ex: detalhe do serviço realizado (opcional)"
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {error && <Text className="text-sm text-destructive">{error}</Text>}

        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="h-14 flex-1"
            disabled={submitting}
            onPress={() => {
              resetForm();
              setOpen(false);
            }}
          >
            <ButtonText variant="outline" className="text-base">
              Cancelar
            </ButtonText>
          </Button>
          <Button
            className="h-14 flex-1"
            disabled={submitting || !canSubmit}
            onPress={handleSubmit}
          >
            {submitting && <Loader2 size={16} color="#fafafa" />}
            <ButtonText className="text-base">
              {submitting
                ? " Salvando..."
                : online
                  ? "Salvar"
                  : "Salvar no aparelho"}
            </ButtonText>
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}
