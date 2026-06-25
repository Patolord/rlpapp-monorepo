import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Wand2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { BuildingPanel } from "@/components/engenharia/building-panel/building-panel";
import type {
  HierarchyFloor,
  HierarchyTower,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
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

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/torres"
)({
  component: () => (
    <AuthShell>
      <TorresPage />
    </AuthShell>
  ),
});

function TorresPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId} tab="torres">
      {(project, now) => <TorresContent project={project} now={now} />}
    </ProjectShell>
  );
}

function TorresContent({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const hierarchy = useQuery(api.projects.getHierarchy, {
    projectId: project._id,
  }) as ProjectHierarchy | null | undefined;
  const generateQr = useMutation(api.qrCodes.generateForProjectEquipment);

  const [towerDialogOpen, setTowerDialogOpen] = useState(false);
  const [floorTarget, setFloorTarget] = useState<HierarchyTower | null>(null);
  const [envTarget, setEnvTarget] = useState<HierarchyFloor | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Visualize a evolução da obra por torre, andar e ambiente.
        </p>
        <Button size="sm" onClick={() => setTowerDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Nova torre
        </Button>
      </div>

      {hierarchy === undefined ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : hierarchy === null ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Obra não encontrada.
        </p>
      ) : (
        <BuildingPanel
          hierarchy={hierarchy}
          now={now}
          actions={{
            onAddFloors: (tower) => setFloorTarget(tower),
            onAddEnvironment: (floor) => setEnvTarget(floor),
            onGenerateQr: (item) =>
              runWithToast(
                () => generateQr({ itemId: item._id }),
                "QR gerado",
                "Não foi possível gerar o QR"
              ),
          }}
        />
      )}

      <NewTowerDialog
        projectId={project._id}
        open={towerDialogOpen}
        onOpenChange={setTowerDialogOpen}
      />
      <AddFloorsDialog
        tower={floorTarget}
        onClose={() => setFloorTarget(null)}
      />
      <AddEnvironmentDialog
        floor={envTarget}
        onClose={() => setEnvTarget(null)}
      />
    </div>
  );
}

function NewTowerDialog({
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

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

function AddFloorsDialog({
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

function AddEnvironmentDialog({
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
