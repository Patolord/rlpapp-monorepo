import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runWithToast } from "@/lib/errors";
import {
  MatrixPositionFields,
  parseGridField,
  parseSegments,
  type SegmentDraft,
} from "@/components/engenharia/building-panel/dialogs/matrix-position-fields";
import type {
  HierarchyEnvironment,
  HierarchyFloor,
} from "@/components/engenharia/building-panel/hierarchy";

export function AddEnvironmentDialog({
  floor,
  onClose,
}: {
  floor: HierarchyFloor | null;
  onClose: () => void;
}) {
  const createEnv = useMutation(api.environments.create);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [col, setCol] = useState("");
  const [colSpan, setColSpan] = useState("");
  const [rowSpan, setRowSpan] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!floor || !name.trim()) return;
    setSaving(true);
    const parsedSegments = parseSegments(segments);
    const ok = await runWithToast(
      () =>
        createEnv({
          floorId: floor._id,
          name: name.trim(),
          type: type.trim() || undefined,
          col: parseGridField(col),
          colSpan: parseGridField(colSpan),
          rowSpan: parseGridField(rowSpan),
          segments: parsedSegments.length > 0 ? parsedSegments : undefined,
        }),
      "Ambiente criado",
      "Não foi possível criar o ambiente"
    );
    setSaving(false);
    if (ok) {
      setName("");
      setType("");
      setCol("");
      setColSpan("");
      setRowSpan("");
      setSegments([]);
      onClose();
    }
  }

  return (
    <Dialog open={floor !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo ambiente</DialogTitle>
          <DialogDescription>
            {floor ? `Andar ${floor.label}.` : ""} Ex: "Sala", "Suíte 1", "Apto
            201".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="env-name">Nome do ambiente</Label>
            <Input
              id="env-name"
              placeholder="Ex: Sala de Estar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="env-type">Tipo (opcional)</Label>
            <Input
              id="env-type"
              placeholder="Ex: Apartamento, Área Técnica"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>
          <MatrixPositionFields
            idPrefix="env"
            col={col}
            colSpan={colSpan}
            rowSpan={rowSpan}
            segments={segments}
            onColChange={setCol}
            onColSpanChange={setColSpan}
            onRowSpanChange={setRowSpan}
            onSegmentsChange={setSegments}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              Criar ambiente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditEnvironmentDialog({
  environment,
  onClose,
}: {
  environment: HierarchyEnvironment | null;
  onClose: () => void;
}) {
  const updateEnv = useMutation(api.environments.update);
  const removeEnv = useMutation(api.environments.remove);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [col, setCol] = useState("");
  const [colSpan, setColSpan] = useState("");
  const [rowSpan, setRowSpan] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (environment) {
      setName(environment.name);
      setType(environment.type ?? "");
      setCol(environment.col !== null ? String(environment.col) : "");
      setColSpan(
        environment.colSpan !== null ? String(environment.colSpan) : ""
      );
      setRowSpan(
        environment.rowSpan !== null ? String(environment.rowSpan) : ""
      );
      setSegments(
        (environment.segments ?? []).map((seg) => ({
          colOffset: String(seg.colOffset),
          colSpan: seg.colSpan !== null ? String(seg.colSpan) : "",
          rowOffset: seg.rowOffset !== null ? String(seg.rowOffset) : "",
          rowSpan: seg.rowSpan !== null ? String(seg.rowSpan) : "",
        }))
      );
    }
  }, [environment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!environment || !name.trim()) return;
    setSaving(true);
    const parsedSegments = parseSegments(segments);
    const ok = await runWithToast(
      () =>
        updateEnv({
          environmentId: environment._id,
          name: name.trim(),
          type: type.trim() || null,
          col: parseGridField(col) ?? null,
          colSpan: parseGridField(colSpan) ?? null,
          rowSpan: parseGridField(rowSpan) ?? null,
          segments: parsedSegments.length > 0 ? parsedSegments : null,
        }),
      "Ambiente atualizado",
      "Não foi possível atualizar o ambiente"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleRemove() {
    if (!environment) return;
    if (
      !window.confirm(
        `Remover o ambiente "${environment.name}" e TODOS os seus equipamentos? Sistemas que ficarem sem equipamentos também serão removidos. Esta ação não pode ser desfeita.`
      )
    )
      return;
    const ok = await runWithToast(
      () => removeEnv({ environmentId: environment._id }),
      "Ambiente removido",
      "Não foi possível remover o ambiente"
    );
    if (ok) onClose();
  }

  return (
    <Dialog open={environment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar ambiente</DialogTitle>
          <DialogDescription>
            Renomeie ou remova o ambiente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-env-name">Nome do ambiente</Label>
            <Input
              id="edit-env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-env-type">Tipo (opcional)</Label>
            <Input
              id="edit-env-type"
              placeholder="Ex: Apartamento, Área Técnica"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>
          <MatrixPositionFields
            idPrefix="edit-env"
            col={col}
            colSpan={colSpan}
            rowSpan={rowSpan}
            segments={segments}
            onColChange={setCol}
            onColSpanChange={setColSpan}
            onRowSpanChange={setRowSpan}
            onSegmentsChange={setSegments}
          />
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
