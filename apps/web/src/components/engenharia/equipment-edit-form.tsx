import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EquipmentStatusSelect } from "@/components/engenharia/equipment-status-select";
import { Loader2 } from "lucide-react";

type EquipmentStatus = "installing" | "operational" | "warning" | "error";

interface EquipmentEditFormProps {
  equipmentId: Id<"equipment">;
  initial: {
    description?: string;
    status: EquipmentStatus;
  };
  onClose: () => void;
}

export function EquipmentEditForm({
  equipmentId,
  initial,
  onClose,
}: EquipmentEditFormProps) {
  const updateEquipment = useMutation(api.equipment.update);

  const [description, setDescription] = useState(initial.description ?? "");
  const [status, setStatus] = useState<EquipmentStatus>(initial.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSubmitting(true);
    try {
      await updateEquipment({
        id: equipmentId,
        description: description.trim() || undefined,
        status,
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
            <EquipmentStatusSelect
              value={status}
              onValueChange={setStatus}
              triggerClassName="h-14 text-lg"
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
