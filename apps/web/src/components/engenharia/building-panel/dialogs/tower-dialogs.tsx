import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
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
import type { HierarchyTower } from "@/components/engenharia/building-panel/hierarchy";

export function NewTowerDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createTower = useMutation(api.towers.create);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () => createTower({ projectId, name: name.trim() }),
      "Torre criada",
      "Não foi possível criar a torre"
    );
    setSaving(false);
    if (ok) {
      setName("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova torre</DialogTitle>
          <DialogDescription>
            Crie uma torre ou bloco da obra (ex: "Torre A").
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tower-name">Nome da torre</Label>
            <Input
              id="tower-name"
              placeholder="Ex: Torre A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              Criar torre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditTowerDialog({
  tower,
  onClose,
}: {
  tower: HierarchyTower | null;
  onClose: () => void;
}) {
  const updateTower = useMutation(api.towers.update);
  const removeTower = useMutation(api.towers.remove);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tower) setName(tower.name);
  }, [tower]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tower || !name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () => updateTower({ towerId: tower._id, name: name.trim() }),
      "Torre atualizada",
      "Não foi possível atualizar a torre"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleRemove() {
    if (!tower) return;
    if (
      !window.confirm(
        `Remover a torre "${tower.name}" e TODOS os seus andares, ambientes e equipamentos? Esta ação não pode ser desfeita.`
      )
    )
      return;
    const ok = await runWithToast(
      () => removeTower({ towerId: tower._id }),
      "Torre removida",
      "Não foi possível remover a torre"
    );
    if (ok) onClose();
  }

  return (
    <Dialog open={tower !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar torre</DialogTitle>
          <DialogDescription>Renomeie ou remova a torre.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-tower-name">Nome da torre</Label>
            <Input
              id="edit-tower-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
