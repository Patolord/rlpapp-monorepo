import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
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
import { Loader2 } from "lucide-react";

type EquipmentStatus = "installing" | "operational" | "warning" | "error";

interface EquipmentEditFormProps {
  equipmentId: Id<"equipment">;
  initial: {
    tag?: string;
    type?: string;
    location?: string;
    description?: string;
    status: EquipmentStatus;
    notes?: string;
  };
  onClose: () => void;
}

export function EquipmentEditForm({
  equipmentId,
  initial,
  onClose,
}: EquipmentEditFormProps) {
  const updateEquipment = useMutation(api.equipment.update);

  const [tag, setTag] = useState(initial.tag ?? "");
  const [type, setType] = useState(initial.type ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [status, setStatus] = useState<EquipmentStatus>(initial.status);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSubmitting(true);
    try {
      await updateEquipment({
        id: equipmentId,
        tag: tag.trim() || undefined,
        type: type.trim() || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error("Failed to update equipment:", err);
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle>Editar Equipamento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-base">
              Descrição geral
            </Label>
            <Textarea
              id="edit-description"
              placeholder="Ex: VRF no bloco A, 3º andar"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base">Situação</Label>
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
            <Label htmlFor="edit-tag" className="text-base">
              Identificador do equipamento
            </Label>
            <Input
              id="edit-tag"
              placeholder="Ex: VRF-01"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="h-14 text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-type" className="text-base">
              Tipo
            </Label>
            <Input
              id="edit-type"
              placeholder="Ex: VRF, Split, Chiller"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-14 text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location" className="text-base">
              Localização
            </Label>
            <Input
              id="edit-location"
              placeholder="Ex: Bloco A, 3º andar"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-14 text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes" className="text-base">
              Observações
            </Label>
            <Textarea
              id="edit-notes"
              placeholder="Observações opcionais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] text-lg placeholder:text-muted-foreground/50"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-14 flex-1 text-base"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="h-14 flex-1 text-base"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
