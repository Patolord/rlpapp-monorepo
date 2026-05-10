import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PhotoUpload } from "@/components/engenharia/photo-upload";
import { Loader2, Plus } from "lucide-react";

interface MaintenanceFormProps {
  equipmentId: Id<"equipment">;
  defaultTechnicianName?: string;
}

export function MaintenanceForm({ equipmentId, defaultTechnicianName }: MaintenanceFormProps) {
  const createLog = useMutation(api.maintenanceLogs.create);

  const [open, setOpen] = useState(false);
  const [technicianName, setTechnicianName] = useState(defaultTechnicianName ?? "");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<
    "operational" | "warning" | "error"
  >("operational");
  const [vacuum, setVacuum] = useState(false);
  const [pressure, setPressure] = useState(false);
  const [communication, setCommunication] = useState(false);
  const [photoIds, setPhotoIds] = useState<Id<"_storage">[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setTechnicianName(defaultTechnicianName ?? "");
    setNotes("");
    setStatus("operational");
    setVacuum(false);
    setPressure(false);
    setCommunication(false);
    setPhotoIds([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!technicianName || !notes) return;

    setSubmitting(true);
    try {
      await createLog({
        equipmentId,
        technicianName,
        notes,
        status,
        tests: {
          vacuum,
          pressure,
          communication,
        },
        photoIds,
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Failed to create maintenance log:", err);
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
        Registrar Manutenção
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle>Nova Manutenção</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technician">Técnico *</Label>
            <Input
              id="technician"
              placeholder="Nome do técnico"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label>Status do Equipamento</Label>
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
            <Label htmlFor="maintenance-notes">Observações *</Label>
            <Textarea
              id="maintenance-notes"
              placeholder="Descreva o serviço realizado..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              className="min-h-[100px] text-base"
            />
          </div>

          <div className="space-y-3">
            <Label>Testes Realizados</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vacuum"
                  checked={vacuum}
                  onCheckedChange={(v) => setVacuum(v === true)}
                />
                <Label htmlFor="vacuum" className="text-base font-normal">
                  Vácuo OK
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="pressure"
                  checked={pressure}
                  onCheckedChange={(v) => setPressure(v === true)}
                />
                <Label htmlFor="pressure" className="text-base font-normal">
                  Pressão OK
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="communication"
                  checked={communication}
                  onCheckedChange={(v) => setCommunication(v === true)}
                />
                <Label
                  htmlFor="communication"
                  className="text-base font-normal"
                >
                  Comunicação OK
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fotos</Label>
            <PhotoUpload photoIds={photoIds} onPhotosChange={setPhotoIds} />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="h-12 flex-1 text-base"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !technicianName || !notes}
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
