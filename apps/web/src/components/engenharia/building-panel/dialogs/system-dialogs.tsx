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
import type { SystemOption } from "@/components/engenharia/building-panel/system-option";

export function NewSystemDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSystem = useMutation(api.systems.createSystemInProject);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        createSystem({
          projectId,
          name: name.trim(),
          type: type.trim() || undefined,
        }),
      "Sistema criado",
      "Não foi possível criar o sistema"
    );
    setSaving(false);
    if (ok) {
      setName("");
      setType("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo sistema</DialogTitle>
          <DialogDescription>
            Cadastre um sistema da obra (ex: VRF Torre A, Split aptos).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-system-name">Nome do sistema</Label>
            <Input
              id="new-system-name"
              placeholder="Ex: VRF Torre A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-system-type">Tipo (opcional)</Label>
            <Input
              id="new-system-type"
              placeholder="Ex: VRF, Split"
              value={type}
              onChange={(e) => setType(e.target.value)}
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
              Criar sistema
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditSystemDialog({
  system,
  onClose,
}: {
  system: SystemOption | null;
  onClose: () => void;
}) {
  const updateSystem = useMutation(api.systems.updateSystemDetails);
  const removeSystem = useMutation(api.systems.removeSystemFromProject);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (system) {
      setName(system.name);
      setType(system.type ?? "");
    }
  }, [system]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!system || !name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        updateSystem({
          systemId: system._id,
          name: name.trim(),
          type: type.trim() || null,
        }),
      "Sistema atualizado",
      "Não foi possível atualizar o sistema"
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleRemove() {
    if (!system) return;
    if (
      !window.confirm(
        `Remover o sistema "${system.name}" da obra? Sistemas com equipamentos não podem ser removidos.`
      )
    )
      return;
    const ok = await runWithToast(
      () => removeSystem({ systemId: system._id }),
      "Sistema removido",
      "Não foi possível remover o sistema"
    );
    if (ok) onClose();
  }

  return (
    <Dialog open={system !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar sistema</DialogTitle>
          <DialogDescription>
            Renomear atualiza todos os equipamentos do sistema nesta obra.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-system-name">Nome do sistema</Label>
            <Input
              id="edit-system-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-system-type">Tipo (opcional)</Label>
            <Input
              id="edit-system-type"
              placeholder="Ex: VRF, Split"
              value={type}
              onChange={(e) => setType(e.target.value)}
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
