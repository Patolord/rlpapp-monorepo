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
import { Loader2 } from "lucide-react";

interface EquipmentFormProps {
  qrToken: string;
  onSuccess: (equipmentId: string) => void;
}

export function EquipmentForm({ qrToken, onSuccess }: EquipmentFormProps) {
  const createEquipment = useMutation(api.equipment.create);
  const assignQr = useMutation(api.qrCodes.assignEquipment);

  const [tag, setTag] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<
    "operational" | "warning" | "error"
  >("operational");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tag || !type || !location) return;

    setSubmitting(true);
    try {
      const equipmentId = await createEquipment({
        tag,
        type,
        location,
        status,
        notes: notes || undefined,
      });

      await assignQr({
        token: qrToken,
        equipmentId,
      });

      onSuccess(equipmentId as string);
    } catch (err) {
      console.error("Failed to register equipment:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Equipamento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag">Tag do Equipamento *</Label>
            <Input
              id="tag"
              placeholder="Ex: VRF-01"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo *</Label>
            <Input
              id="type"
              placeholder="Ex: VRF, Split, Chiller"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Localização *</Label>
            <Input
              id="location"
              placeholder="Ex: Bloco A, 3º andar"
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
              onValueChange={(v) =>
                setStatus(v as "operational" | "warning" | "error")
              }
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
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações opcionais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] text-base"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !tag || !type || !location}
            className="h-12 w-full text-base"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {submitting ? "Registrando..." : "Registrar Equipamento"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
