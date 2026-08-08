import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";

interface FloorDraft {
  number: number;
  label: string;
}

type ProjectStatus = "planning" | "in_progress" | "completed" | "paused";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planejamento" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluída" },
  { value: "paused", label: "Pausada" },
];

interface ProjectInput {
  _id: Id<"projects">;
  name: string;
  legacyNumber?: number | null;
  floors: { number: number; label: string }[];
  customerId?: Id<"customers"> | null;
  client?: string | null;
  address?: string | null;
  status?: ProjectStatus | null;
  startDate?: number | null;
  endDate?: number | null;
}

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

/** Converte timestamp (ms) para o formato yyyy-mm-dd de um input date. */
function toDateInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Converte yyyy-mm-dd para timestamp (ms) ou null. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
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
  const customers = useQuery(api.customers.list, { activeOnly: true });
  const isEdit = Boolean(project);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [legacyNumber, setLegacyNumber] = useState(
    project?.legacyNumber?.toString() ?? ""
  );
  const [customerId, setCustomerId] = useState<string>(
    project?.customerId ?? ""
  );
  const [address, setAddress] = useState(project?.address ?? "");
  const [status, setStatus] = useState<ProjectStatus>(
    project?.status ?? "planning"
  );
  const [startDate, setStartDate] = useState(toDateInput(project?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(project?.endDate));
  const [floors, setFloors] = useState<FloorDraft[]>(() =>
    initialFloors(project)
  );
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("12");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(project?.name ?? "");
    setLegacyNumber(project?.legacyNumber?.toString() ?? "");
    setCustomerId(project?.customerId ?? "");
    setAddress(project?.address ?? "");
    setStatus(project?.status ?? "planning");
    setStartDate(toDateInput(project?.startDate));
    setEndDate(toDateInput(project?.endDate));
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
    const parsedLegacyNumber = Number(legacyNumber);
    if (
      !name.trim() ||
      !customerId ||
      !Number.isSafeInteger(parsedLegacyNumber) ||
      parsedLegacyNumber <= 0
    ) {
      return;
    }

    const payloadFloors = floors.map((f) => ({
      number: f.number,
      label: f.label.trim() || defaultFloorLabel(f.number),
    }));

    const meta = {
      customerId: customerId
        ? (customerId as Id<"customers">)
        : null,
      address: address.trim() || null,
      status,
      startDate: fromDateInput(startDate),
      endDate: fromDateInput(endDate),
    };

    const customerChanged =
      (meta.customerId ?? null) !== (project?.customerId ?? null);

    setSaving(true);
    const ok = await runWithToast(
      () =>
        isEdit && project
          ? updateProject({
              projectId: project._id,
              name: name.trim(),
              legacyNumber: parsedLegacyNumber,
              floors: payloadFloors,
              ...(customerChanged ? { customerId: meta.customerId! } : {}),
              address: meta.address,
              status: meta.status,
              startDate: meta.startDate,
              endDate: meta.endDate,
            })
          : createProject({
              name: name.trim(),
              legacyNumber: parsedLegacyNumber,
              floors: payloadFloors,
              customerId: meta.customerId!,
              address: meta.address ?? undefined,
              status: meta.status,
              startDate: meta.startDate ?? undefined,
              endDate: meta.endDate ?? undefined,
            }),
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
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
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
            <div className="space-y-2">
              <Label htmlFor="project-number">Número da obra</Label>
              <Input
                id="project-number"
                type="number"
                min={1}
                step={1}
                placeholder="Ex: 1821"
                value={legacyNumber}
                onChange={(e) => setLegacyNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-customer">Cliente</Label>
              <Select
                value={customerId || undefined}
                onValueChange={setCustomerId}
                required
              >
                <SelectTrigger id="project-customer">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProjectStatus)}
              >
                <SelectTrigger id="project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-address">Endereço</Label>
            <Input
              id="project-address"
              placeholder="Ex: Av. Brasil, 1000 - Centro"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-start">Data de início</Label>
              <Input
                id="project-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-end">Previsão de término</Label>
              <Input
                id="project-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
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
            <Button
              type="submit"
              disabled={
                saving ||
                !name.trim() ||
                !customerId ||
                !Number.isSafeInteger(Number(legacyNumber)) ||
                Number(legacyNumber) <= 0
              }
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar obra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
