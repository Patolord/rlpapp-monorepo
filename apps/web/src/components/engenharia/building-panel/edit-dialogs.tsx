import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";
import type {
  HierarchyEnvironment,
  HierarchyFloor,
  HierarchyItem,
  HierarchySystem,
  HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";

function toTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const ts = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

// ---------------------------------------------------------------------------
// Torre
// ---------------------------------------------------------------------------

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
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
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
              <Trash2 className="mr-1.5 size-4" />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Andares
// ---------------------------------------------------------------------------

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
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 size-4" />
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
              <Trash2 className="mr-1.5 size-4" />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !label.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

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
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!floor || !name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        createEnv({
          floorId: floor._id,
          name: name.trim(),
          type: type.trim() || undefined,
        }),
      "Ambiente criado",
      "Não foi possível criar o ambiente"
    );
    setSaving(false);
    if (ok) {
      setName("");
      setType("");
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (environment) {
      setName(environment.name);
      setType(environment.type ?? "");
    }
  }, [environment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!environment || !name.trim()) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        updateEnv({
          environmentId: environment._id,
          name: name.trim(),
          type: type.trim() || null,
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
        `Remover o ambiente "${environment.name}" e TODOS os seus equipamentos? Esta ação não pode ser desfeita.`
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
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="mr-1.5 size-4" />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sistema
// ---------------------------------------------------------------------------

/** Dados mínimos de um sistema para os selects/dialogs (subset estrutural). */
export type SystemOption = Pick<HierarchySystem, "_id" | "name" | "type">;

export function NewSystemDialog({
  projectId,
  open,
  onClose,
  onCreated,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onClose: () => void;
  onCreated?: (systemId: Id<"systems">) => void;
}) {
  const createSystem = useMutation(api.systems.createSystemInProject);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    let systemId: Id<"systems"> | null = null;
    const ok = await runWithToast(
      async () => {
        systemId = await createSystem({
          projectId,
          name: name.trim(),
          type: type.trim() || undefined,
        });
      },
      "Sistema criado",
      "Não foi possível criar o sistema"
    );
    setSaving(false);
    if (ok) {
      setName("");
      setType("");
      onClose();
      if (systemId) onCreated?.(systemId);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo sistema</DialogTitle>
          <DialogDescription>
            O sistema pertence à obra e pode ter equipamentos em vários
            ambientes (ex: condensadora na cobertura e evaporadoras nos
            apartamentos).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-name">Nome do sistema</Label>
            <Input
              id="system-name"
              placeholder="Ex: VRF 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-type">Tipo (opcional)</Label>
            <Input
              id="system-type"
              placeholder="Ex: VRF, Split"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
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
              <Trash2 className="mr-1.5 size-4" />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Equipamento
// ---------------------------------------------------------------------------

/** Valor sentinela do Select que dispara a criação de um novo sistema. */
const NEW_SYSTEM_VALUE = "__new_system__";

function SystemSelect({
  id,
  systems,
  value,
  onChange,
  onRequestNewSystem,
}: {
  id?: string;
  systems: SystemOption[];
  value: Id<"systems"> | null;
  onChange: (systemId: Id<"systems">) => void;
  onRequestNewSystem?: () => void;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => {
        if (v === NEW_SYSTEM_VALUE) {
          onRequestNewSystem?.();
          return;
        }
        onChange(v as Id<"systems">);
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Selecione o sistema" />
      </SelectTrigger>
      <SelectContent>
        {systems.map((s) => (
          <SelectItem key={s._id} value={s._id}>
            {s.name}
            {s.type ? ` · ${s.type}` : ""}
          </SelectItem>
        ))}
        {onRequestNewSystem && (
          <SelectItem value={NEW_SYSTEM_VALUE}>+ Novo sistema</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

export function AddEquipmentDialog({
  environment,
  systems,
  initialSystemId,
  onClose,
  onRequestNewSystem,
}: {
  environment: HierarchyEnvironment | null;
  systems: SystemOption[];
  initialSystemId: Id<"systems"> | null;
  onClose: () => void;
  onRequestNewSystem?: () => void;
}) {
  const upsert = useMutation(api.projectEquipment.upsertInEnvironment);
  const [systemId, setSystemId] = useState<Id<"systems"> | null>(null);
  const [kind, setKind] = useState<"condensadora" | "evaporadora">(
    "evaporadora"
  );
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza o sistema pré-selecionado (grupo clicado ou recém-criado).
  useEffect(() => {
    setSystemId(initialSystemId);
  }, [initialSystemId, environment]);

  function reset() {
    setKind("evaporadora");
    setModelo("");
    setCapacidade("");
    setSerialNumber("");
    setDeadline("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!environment || !systemId) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        upsert({
          environmentId: environment._id,
          systemId,
          kind,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          deadline: toTimestamp(deadline) ?? null,
        }),
      "Equipamento adicionado",
      "Não foi possível adicionar o equipamento"
    );
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    }
  }

  return (
    <Dialog open={environment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar equipamento</DialogTitle>
          <DialogDescription>
            {environment ? `Ambiente ${environment.name}.` : ""} Escolha o
            sistema e preencha os dados do equipamento previsto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="equip-system">Sistema</Label>
              <SystemSelect
                id="equip-system"
                systems={systems}
                value={systemId}
                onChange={setSystemId}
                onRequestNewSystem={onRequestNewSystem}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(v) =>
                  setKind(v as "condensadora" | "evaporadora")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evaporadora">Evaporadora</SelectItem>
                  <SelectItem value="condensadora">Condensadora</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="equip-modelo">Modelo</Label>
              <Input
                id="equip-modelo"
                placeholder="Ex: MSZ-GL12"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="equip-cap">Capacidade</Label>
              <Input
                id="equip-cap"
                placeholder="Ex: 12.000 BTUs"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="equip-serial">Nº de série (opcional)</Label>
              <Input
                id="equip-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="equip-deadline">Prazo (opcional)</Label>
              <Input
                id="equip-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !systemId}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Editar Equipamento
// ---------------------------------------------------------------------------

function toDateInputValue(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

export function EditEquipmentDialog({
  item,
  environmentId,
  systems,
  onClose,
}: {
  item: HierarchyItem | null;
  environmentId: Id<"environments"> | null;
  systems: SystemOption[];
  onClose: () => void;
}) {
  const upsert = useMutation(api.projectEquipment.upsertInEnvironment);
  const [systemId, setSystemId] = useState<Id<"systems"> | null>(null);
  const [kind, setKind] = useState<"condensadora" | "evaporadora">(
    "evaporadora"
  );
  const [modelo, setModelo] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSystemId(item.systemId);
      setKind(item.kind);
      setModelo(item.modelo ?? "");
      setCapacidade(item.capacidade ?? "");
      setSerialNumber(item.serialNumber ?? "");
      setDeadline(toDateInputValue(item.deadline));
    }
  }, [item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !environmentId || !systemId) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        upsert({
          itemId: item._id,
          environmentId,
          systemId,
          kind,
          modelo: modelo.trim() || undefined,
          capacidade: capacidade.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          deadline: toTimestamp(deadline) ?? null,
        }),
      "Equipamento atualizado",
      "Não foi possível atualizar o equipamento"
    );
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar equipamento</DialogTitle>
          <DialogDescription>
            Atualize os dados do equipamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-system">Sistema</Label>
              <SystemSelect
                id="edit-equip-system"
                systems={systems}
                value={systemId}
                onChange={setSystemId}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(v) =>
                  setKind(v as "condensadora" | "evaporadora")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evaporadora">Evaporadora</SelectItem>
                  <SelectItem value="condensadora">Condensadora</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-modelo">Modelo</Label>
              <Input
                id="edit-equip-modelo"
                placeholder="Ex: MSZ-GL12"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-equip-cap">Capacidade</Label>
              <Input
                id="edit-equip-cap"
                placeholder="Ex: 12.000 BTUs"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-equip-serial">Nº de série (opcional)</Label>
              <Input
                id="edit-equip-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-equip-deadline">Prazo (opcional)</Label>
              <Input
                id="edit-equip-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !systemId}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
