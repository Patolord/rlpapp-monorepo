import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { EquipmentStatusSelect } from "@/components/engenharia/equipment-status-select";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";
import {
  addPendingRecord,
  newPendingId,
  type EquipmentStatus,
} from "@/lib/offline-queue";
import { Loader2, CloudOff, CheckCircle2, Building2 } from "lucide-react";

interface EquipmentFormProps {
  qrToken: string;
  onSuccess: (equipmentId: string) => void;
  /** Obra de destino herdada do lote do QR (exibida como badge informativo). */
  destinationProjectName?: string | null;
  /**
   * Obra aberta no app de campo: a etiqueta passa a pertencer a ela no
   * cadastro (vence o destino do lote). Sem isso, vale só o lote.
   */
  project?: { _id: Id<"projects">; name: string } | null;
}

export function EquipmentForm({
  qrToken,
  onSuccess,
  destinationProjectName,
  project,
}: EquipmentFormProps) {
  const registerForQr = useMutation(api.qrCodes.registerForQr);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();

  const [photos, setPhotos] = useState<File[]>([]);
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
      projectId: project?._id,
      projectName: project?.name,
      createdAt: Date.now(),
    });
    setQueued(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

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

      onSuccess(equipmentId as string);
    } catch (err) {
      console.error("Failed to register equipment:", err);
      if (!navigator.onLine) {
        // Conexão caiu no meio do envio: guarda para sincronizar depois.
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
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
        <h2 className="text-xl font-bold">Salvo no aparelho</h2>
        <p className="text-base text-muted-foreground">
          Sem internet agora. O cadastro será enviado automaticamente quando
          a conexão voltar. Você também pode enviar manualmente na tela de
          Registros Pendentes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Registrar equipamento</h1>
        {!online && (
          <span className="flex items-center gap-1.5 text-sm font-normal text-amber-600">
            <CloudOff className="h-4 w-4" />
            Sem internet
          </span>
        )}
      </div>

      {project ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span>
            A etiqueta será vinculada à obra{" "}
            <span className="font-semibold">{project.name}</span>.
          </span>
        </div>
      ) : destinationProjectName ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Obra de destino:{" "}
            <span className="font-semibold">{destinationProjectName}</span>
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-base">Foto da etiqueta *</Label>
        <p className="text-sm text-muted-foreground">
          Tire uma foto da etiqueta/placa do equipamento.
        </p>
        <PhotoPicker
          files={photos}
          onFilesChange={setPhotos}
          label="Tirar foto da etiqueta"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-base">
          Descrição geral *
        </Label>
        <Textarea
          id="description"
          placeholder="Ex: VRF no bloco A, 3º andar"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className="min-h-[90px] text-lg placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-base">Situação</Label>
        <EquipmentStatusSelect
          value={status}
          onValueChange={setStatus}
          triggerClassName="h-14 text-lg"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={submitting || !canSubmit}
        size="xl"
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="animate-spin" />
        ) : null}
        {submitting
          ? "Registrando..."
          : online
            ? "Registrar Equipamento"
            : "Salvar no aparelho"}
      </Button>
    </form>
  );
}
