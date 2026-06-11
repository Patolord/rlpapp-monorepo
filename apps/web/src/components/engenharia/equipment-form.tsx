import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, ChevronDown, ChevronUp, CloudOff, CheckCircle2 } from "lucide-react";

interface EquipmentFormProps {
  qrToken: string;
  onSuccess: (equipmentId: string) => void;
}

export function EquipmentForm({ qrToken, onSuccess }: EquipmentFormProps) {
  const createEquipment = useMutation(api.equipment.create);
  const assignQr = useMutation(api.qrCodes.assignEquipment);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const online = useOnline();

  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("installing");
  const [showDetails, setShowDetails] = useState(false);
  const [tag, setTag] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
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
      tag: tag.trim() || undefined,
      type: type.trim() || undefined,
      location: location.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
      photos,
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
      const equipmentId = await createEquipment({
        description: description.trim(),
        labelPhotoIds,
        tag: tag.trim() || undefined,
        type: type.trim() || undefined,
        location: location.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
        qrToken,
      });

      await assignQr({
        token: qrToken,
        equipmentId,
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6 pb-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <h2 className="text-xl font-bold">Salvo no aparelho</h2>
          <p className="text-base text-muted-foreground">
            Sem internet agora. O cadastro será enviado automaticamente quando
            a conexão voltar. Você também pode enviar manualmente na tela de
            Registros Pendentes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Registrar Equipamento
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
            <Label className="text-base">Status</Label>
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

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border px-4 py-3 text-base text-muted-foreground hover:bg-accent"
          >
            Mais detalhes (opcional)
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showDetails && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="space-y-2">
                <Label htmlFor="tag" className="text-base">
                  Tag do Equipamento
                </Label>
                <Input
                  id="tag"
                  placeholder="Ex: VRF-01"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="h-14 text-lg placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type" className="text-base">
                  Tipo
                </Label>
                <Input
                  id="type"
                  placeholder="Ex: VRF, Split, Chiller"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-14 text-lg placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" className="text-base">
                  Localização
                </Label>
                <Input
                  id="location"
                  placeholder="Ex: Bloco A, 3º andar"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-14 text-lg placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base">
                  Observações
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Observações opcionais..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[80px] text-lg placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={submitting || !canSubmit}
            className="h-14 w-full text-lg"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            {submitting
              ? "Registrando..."
              : online
                ? "Registrar Equipamento"
                : "Salvar no aparelho"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
