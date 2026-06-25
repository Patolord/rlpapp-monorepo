import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runWithToast } from "@/lib/errors";

interface FloorDraft {
  number: number;
  label: string;
}

interface ProjectInput {
  _id: Id<"projects">;
  name: string;
  floors: { number: number; label: string }[];
}

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

function initialFloors(project?: ProjectInput): FloorDraft[] {
  if (project && project.floors.length > 0) {
    return project.floors
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((f) => ({ number: f.number, label: f.label }));
  }
  return [
    { number: 1, label: defaultFloorLabel(1) },
    { number: 2, label: defaultFloorLabel(2) },
  ];
}

export function ProjectFormDialog({
  project,
  trigger,
}: {
  project?: ProjectInput;
  trigger: ReactNode;
}) {
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const isEdit = Boolean(project);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [floors, setFloors] = useState<FloorDraft[]>(() =>
    initialFloors(project)
  );
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("12");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(project?.name ?? "");
    setFloors(initialFloors(project));
  }

  function addFloor() {
    setFloors((prev) => {
      const next =
        prev.length === 0 ? 1 : Math.max(...prev.map((f) => f.number)) + 1;
      return [...prev, { number: next, label: defaultFloorLabel(next) }];
    });
  }

  function generateRange() {
    const start = Math.floor(Number(rangeStart));
    const end = Math.floor(Number(rangeEnd));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
    const next: FloorDraft[] = [];
    for (let n = start; n <= end; n++) {
      const existing = floors.find((f) => f.number === n);
      next.push({ number: n, label: existing?.label ?? defaultFloorLabel(n) });
    }
    setFloors(next.sort((a, b) => a.number - b.number));
  }

  function removeFloor(index: number) {
    setFloors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFloor(index: number, label: string) {
    setFloors((prev) =>
      prev.map((f, i) => (i === index ? { ...f, label } : f))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || floors.length === 0) return;

    const payloadFloors = floors.map((f) => ({
      number: f.number,
      label: f.label.trim() || defaultFloorLabel(f.number),
    }));

    setSaving(true);
    const ok = await runWithToast(
      () =>
        isEdit && project
          ? updateProject({
              projectId: project._id,
              name: name.trim(),
              floors: payloadFloors,
            })
          : createProject({ name: name.trim(), floors: payloadFloors }),
      isEdit ? "Obra atualizada" : "Obra criada",
      isEdit
        ? "Não foi possível atualizar a obra"
        : "Não foi possível criar a obra"
    );
    setSaving(false);

    if (ok) {
      setOpen(false);
      if (!isEdit) reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar obra" : "Nova obra"}</DialogTitle>
          <DialogDescription>
            Defina o nome e os andares do prédio. Os apartamentos e equipamentos
            são montados depois no editor de layout ou pelo assistente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="project-name">Nome da obra</Label>
            <Input
              id="project-name"
              placeholder="Ex: Edifício Lorena"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Label className="text-sm">Gerar andares rapidamente</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">De</span>
                <Input
                  type="number"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">Até</span>
                <Input
                  type="number"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" onClick={generateRange}>
                <Wand2 className="mr-1.5 size-4" />
                Gerar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Andares</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {floors.length} andar{floors.length === 1 ? "" : "es"}
              </span>
            </div>

            <div className="space-y-2">
              {floors.map((floor, index) => (
                <div key={floor.number} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                    {floor.number}
                  </span>
                  <Input
                    value={floor.label}
                    onChange={(e) => updateFloor(index, e.target.value)}
                    placeholder={defaultFloorLabel(floor.number)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${floor.label}`}
                    disabled={floors.length === 1}
                    onClick={() => removeFloor(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFloor}
              className="w-full"
            >
              <Plus className="mr-1.5 size-4" />
              Adicionar andar
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar obra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
