import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, Trash2, Wand2 } from "lucide-react";

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
import type {
  HierarchyFloor,
  HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

export function AddFloorsDialog({
  tower,
  onClose,
}: {
  tower: HierarchyTower | null;
  onClose: () => void;
}) {
  const createFloors = useMutation(api.floors.create);
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState("12");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tower) return;
    const s = Math.floor(Number(start));
    const en = Math.floor(Number(end));
    if (!Number.isFinite(s) || !Number.isFinite(en) || en < s) return;

    const floors: { number: number; label: string }[] = [];
    for (let n = s; n <= en; n++) {
      floors.push({ number: n, label: defaultFloorLabel(n) });
    }

    setSaving(true);
    const ok = await runWithToast(
      () => createFloors({ towerId: tower._id, floors }),
      "Andares adicionados",
      "Não foi possível adicionar os andares"
    );
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={tower !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar andares</DialogTitle>
          <DialogDescription>
            {tower ? `Torre ${tower.name}.` : ""} Andares já existentes são
            ignorados.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">De</Label>
              <Input
                type="number"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Até</Label>
              <Input
                type="number"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wand2 />
              )}
              Gerar andares
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditFloorDialog({
  floor,
  onClose,
}: {
  floor: HierarchyFloor | null;
  onClose: () => void;
}) {
  const updateFloor = useMutation(api.floors.update);
  const removeFloor = useMutation(api.floors.remove);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (floor) setLabel(floor.label);
  }, [floor]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!floor || !label.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () => updateFloor({ floorId: floor._id, label: label.trim() }),
      "Andar atualizado",
      "Não foi possível atualizar o andar"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleRemove() {
    if (!floor) return;
    if (
      !window.confirm(
        `Remover o andar "${floor.label}" e todos os seus ambientes e equipamentos? Esta ação não pode ser desfeita.`
      )
    )
      return;
    const ok = await runWithToast(
      () => removeFloor({ floorId: floor._id }),
      "Andar removido",
      "Não foi possível remover o andar"
    );
    if (ok) onClose();
  }

  return (
    <Dialog open={floor !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar andar</DialogTitle>
          <DialogDescription>Renomeie ou remova o andar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-floor-label">Nome do andar</Label>
            <Input
              id="edit-floor-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </div>
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
              <Button type="submit" disabled={saving || !label.trim()}>
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
