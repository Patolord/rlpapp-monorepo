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

type EquipmentStatus = "operational" | "warning" | "error";

interface EquipmentEditFormProps {
  equipmentId: Id<"equipment">;
  initial: {
    tag: string;
    type: string;
    location: string;
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

  const [tag, setTag] = useState(initial.tag);
  const [type, setType] = useState(initial.type);
  const [location, setLocation] = useState(initial.location);
  const [status, setStatus] = useState<EquipmentStatus>(initial.status);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tag || !type || !location) return;

    setError("");
    setSubmitting(true);
    try {
      await updateEquipment({
        id: equipmentId,
        tag,
        type,
        location,
        status,
        notes: notes || undefined,
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
            <Label htmlFor="edit-tag">Tag do Equipamento *</Label>
            <Input
              id="edit-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-type">Tipo *</Label>
            <Input
              id="edit-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location">Localização *</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as EquipmentStatus)}
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operational">Operacional</SelectItem>
                <SelectItem value="warning">Alerta</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] text-base"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-12 flex-1 text-base"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !tag || !type || !location}
              className="h-12 flex-1 text-base"
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
