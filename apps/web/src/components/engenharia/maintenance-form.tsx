import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";
import {
  addPendingRecord,
  newPendingId,
  type EquipmentStatus,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import { Loader2, Plus, CloudOff, User } from "lucide-react";

export const OBSERVATION_TAGS = [
  "Posicionada",
  "Instalada",
  "Em manutenção",
  "Esperando cobre",
  "Travado",
] as const;

const TEST_OPTIONS = [
  { key: "vacuum", label: "Vácuo OK" },
  { key: "pressure", label: "Pressão OK" },
  { key: "communication", label: "Comunicação OK" },
  { key: "gas", label: "Carga de gás OK" },
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
  const [type, setType] = useState<"installation" | "maintenance">(
    "maintenance"
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("operational");
  const [tests, setTests] = useState<Record<TestKey, boolean>>({
    vacuum: false,
    pressure: false,
    communication: false,
    gas: false,
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = photos.length > 0;

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function resetForm() {
    setType("maintenance");
    setSelectedTags([]);
    setNotes("");
    setStatus("operational");
    setTests({ vacuum: false, pressure: false, communication: false, gas: false });
    setPhotos([]);
    setError(null);
  }

  async function queueOffline() {
    await addPendingRecord({
      id: newPendingId(),
      kind: "log",
      qrToken,
      logType: type,
      status,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        type,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        status,
        tests,
        photoIds,
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Failed to create maintenance log:", err);
      if (!navigator.onLine) {
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
      <Button
        onClick={() => setOpen(true)}
        className="h-14 w-full text-base"
        size="lg"
      >
        <Plus className="mr-2 h-5 w-5" />
        Registrar Instalação ou Manutenção
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {type === "installation" ? "Nova Instalação" : "Nova Manutenção"}
          {!online && (
            <span className="flex items-center gap-1.5 text-sm font-normal text-amber-600">
              <CloudOff className="h-4 w-4" />
              Sem internet
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base">Tipo de Registro *</Label>
            <Select
              value={type}
              onValueChange={(v) =>
                setType(v as "installation" | "maintenance")
              }
            >
              <SelectTrigger className="h-14 text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="installation">Instalação</SelectItem>
                <SelectItem value="maintenance">Manutenção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {technicianName && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-4 py-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-base">
                Responsável: <strong>{technicianName}</strong>
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base">Status do Equipamento</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as EquipmentStatus)}
            >
              <SelectTrigger className="h-14 text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="installing">Em instalação</SelectItem>
                <SelectItem value="operational">Operacional</SelectItem>
                <SelectItem value="warning">Alerta</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Situação</Label>
            <div className="flex flex-wrap gap-2">
              {OBSERVATION_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-4 py-2.5 text-base transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance-notes" className="text-base">
              Observações adicionais
            </Label>
            <Textarea
              id="maintenance-notes"
              placeholder="Ex: detalhe do serviço realizado (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[90px] text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-base">Testes Realizados</Label>
            <div className="space-y-2.5">
              {TEST_OPTIONS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <Checkbox
                    id={`test-${key}`}
                    checked={tests[key]}
                    onCheckedChange={(v) =>
                      setTests((prev) => ({ ...prev, [key]: v === true }))
                    }
                  />
                  <Label
                    htmlFor={`test-${key}`}
                    className="text-base font-normal"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Fotos *</Label>
            <p className="text-sm text-muted-foreground">
              Pelo menos uma foto é obrigatória.
            </p>
            <PhotoPicker files={photos} onFilesChange={setPhotos} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="h-14 flex-1 text-base"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !canSubmit}
              className="h-14 flex-1 text-base"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitting
                ? "Salvando..."
                : online
                  ? "Salvar"
                  : "Salvar no aparelho"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
