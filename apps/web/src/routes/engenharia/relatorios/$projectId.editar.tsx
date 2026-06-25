import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import type { GridUnit } from "@/components/engenharia/building";
import { ProjectFormDialog } from "@/components/engenharia/project-form-dialog";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/editar"
)({
  component: () => (
    <AuthShell>
      <EditorPage />
    </AuthShell>
  ),
});

function EditorPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId} tab="editar">
      {(project) => <EditorContent project={project} />}
    </ProjectShell>
  );
}

function EditorContent({ project }: { project: ProjectOverview }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Andares</h2>
        <ProjectFormDialog
          project={{
            _id: project._id,
            name: project.name,
            floors: project.floors,
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 size-4" />
              Editar obra e andares
            </Button>
          }
        />
      </div>

      <PatternGenerator project={project} />

      <UnitsEditor project={project} />
    </div>
  );
}

// --- Gerador por padrão ---

interface SystemDraft {
  name: string;
  evaporadoras: string;
  condModelo: string;
  condCapacidade: string;
}
interface FinalDraft {
  type: "vrf" | "split";
  systems: SystemDraft[];
}

function defaultFinals(): FinalDraft[] {
  return [
    {
      type: "vrf",
      systems: [
        { name: "VRF 1", evaporadoras: "3", condModelo: "", condCapacidade: "" },
        { name: "VRF 2", evaporadoras: "3", condModelo: "", condCapacidade: "" },
      ],
    },
    {
      type: "split",
      systems: [
        { name: "Split", evaporadoras: "2", condModelo: "", condCapacidade: "" },
      ],
    },
  ];
}

function PatternGenerator({ project }: { project: ProjectOverview }) {
  const generate = useMutation(api.projects.generateLayout);
  const [selectedFloors, setSelectedFloors] = useState<number[]>([]);
  const [finals, setFinals] = useState<FinalDraft[]>(defaultFinals);
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);

  const allFloors = project.floors.slice().sort((a, b) => a.number - b.number);

  function toggleFloor(n: number) {
    setSelectedFloors((prev) =>
      prev.includes(n) ? prev.filter((f) => f !== n) : [...prev, n]
    );
  }

  function updateFinal(i: number, patch: Partial<FinalDraft>) {
    setFinals((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function updateSystem(fi: number, si: number, patch: Partial<SystemDraft>) {
    setFinals((prev) =>
      prev.map((f, idx) =>
        idx === fi
          ? {
              ...f,
              systems: f.systems.map((s, sIdx) =>
                sIdx === si ? { ...s, ...patch } : s
              ),
            }
          : f
      )
    );
  }
  function addSystem(fi: number) {
    setFinals((prev) =>
      prev.map((f, idx) =>
        idx === fi
          ? {
              ...f,
              systems: [
                ...f.systems,
                {
                  name: f.type === "vrf" ? `VRF ${f.systems.length + 1}` : "Split",
                  evaporadoras: "1",
                  condModelo: "",
                  condCapacidade: "",
                },
              ],
            }
          : f
      )
    );
  }
  function removeSystem(fi: number, si: number) {
    setFinals((prev) =>
      prev.map((f, idx) =>
        idx === fi
          ? { ...f, systems: f.systems.filter((_, sIdx) => sIdx !== si) }
          : f
      )
    );
  }
  function addFinal() {
    setFinals((prev) => [
      ...prev,
      {
        type: "split",
        systems: [
          { name: "Split", evaporadoras: "2", condModelo: "", condCapacidade: "" },
        ],
      },
    ]);
  }
  function removeFinal(i: number) {
    setFinals((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleGenerate() {
    if (selectedFloors.length === 0 || finals.length === 0) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        generate({
          projectId: project._id,
          floors: selectedFloors,
          replace,
          finals: finals.map((f) => ({
            type: f.type,
            systems: f.systems.map((s) => ({
              name: s.name.trim() || "Split",
              evaporadoras: Math.max(0, Math.floor(Number(s.evaporadoras) || 0)),
              condensadoraModelo: s.condModelo.trim() || undefined,
              condensadoraCapacidade: s.condCapacidade.trim() || undefined,
            })),
          })),
        }),
      "Layout gerado",
      "Não foi possível gerar o layout"
    );
    setSaving(false);
    if (ok) setSelectedFloors([]);
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <h2 className="text-lg font-semibold">Gerador por padrão</h2>
          <p className="text-sm text-muted-foreground">
            Defina os apartamentos (finais) e aplique o mesmo padrão a vários
            andares de uma vez. Refine modelos e ambientes depois.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Aplicar nos andares</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                setSelectedFloors(
                  selectedFloors.length === allFloors.length
                    ? []
                    : allFloors.map((f) => f.number)
                )
              }
            >
              {selectedFloors.length === allFloors.length
                ? "Limpar"
                : "Selecionar todos"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allFloors.map((f) => {
              const on = selectedFloors.includes(f.number);
              return (
                <button
                  key={f.number}
                  type="button"
                  onClick={() => toggleFloor(f.number)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Apartamentos por andar (finais)</Label>
          {finals.map((final, fi) => (
            <div key={fi} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Final {fi + 1}</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={final.type}
                    onValueChange={(v) =>
                      updateFinal(fi, { type: v as "vrf" | "split" })
                    }
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vrf">VRF</SelectItem>
                      <SelectItem value="split">Split</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={finals.length === 1}
                    onClick={() => removeFinal(fi)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {final.systems.map((system, si) => (
                <div key={si} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4 space-y-1">
                    <span className="text-xs text-muted-foreground">Sistema</span>
                    <Input
                      value={system.name}
                      onChange={(e) =>
                        updateSystem(fi, si, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <span className="text-xs text-muted-foreground">Evap.</span>
                    <Input
                      type="number"
                      min={0}
                      value={system.evaporadoras}
                      onChange={(e) =>
                        updateSystem(fi, si, { evaporadoras: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Cond. modelo
                    </span>
                    <Input
                      value={system.condModelo}
                      onChange={(e) =>
                        updateSystem(fi, si, { condModelo: e.target.value })
                      }
                      placeholder="AM040"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <span className="text-xs text-muted-foreground">Cap.</span>
                    <Input
                      value={system.condCapacidade}
                      onChange={(e) =>
                        updateSystem(fi, si, { condCapacidade: e.target.value })
                      }
                      placeholder="4HP"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={final.systems.length === 1}
                      onClick={() => removeSystem(fi, si)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addSystem(fi)}
              >
                <Plus className="mr-1.5 size-4" />
                Adicionar sistema
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addFinal}>
            <Plus className="mr-1.5 size-4" />
            Adicionar apartamento (final)
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={replace}
            onCheckedChange={(c) => setReplace(c === true)}
          />
          Substituir apartamentos existentes nesses andares
        </label>

        <Button
          onClick={handleGenerate}
          disabled={saving || selectedFloors.length === 0}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 size-4" />
          )}
          Gerar {selectedFloors.length > 0 ? `em ${selectedFloors.length} andar(es)` : ""}
        </Button>
      </CardContent>
    </Card>
  );
}

// --- Edição manual de apartamentos ---

function UnitsEditor({ project }: { project: ProjectOverview }) {
  const floors = project.floors.slice().sort((a, b) => b.number - a.number);
  const unitsByFloor = new Map<number, GridUnit[]>();
  for (const u of project.units) {
    const list = unitsByFloor.get(u.floor) ?? [];
    list.push(u);
    unitsByFloor.set(u.floor, list);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Apartamentos</h2>
      {floors.map((floor) => {
        const units = (unitsByFloor.get(floor.number) ?? []).sort(
          (a, b) => a.final - b.final
        );
        return (
          <Card key={floor.number}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{floor.label}</h3>
                <AddUnitButton
                  projectId={project._id}
                  floor={floor.number}
                  nextFinal={
                    units.length === 0
                      ? 1
                      : Math.max(...units.map((u) => u.final)) + 1
                  }
                />
              </div>
              {units.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum apartamento neste andar.
                </p>
              ) : (
                units.map((unit) => (
                  <UnitRow key={unit._id} projectId={project._id} unit={unit} />
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AddUnitButton({
  projectId,
  floor,
  nextFinal,
}: {
  projectId: Id<"projects">;
  floor: number;
  nextFinal: number;
}) {
  const upsert = useMutation(api.projectUnits.upsert);
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    await runWithToast(
      () =>
        upsert({
          projectId,
          floor,
          final: nextFinal,
          type: "split",
        }),
      "Apartamento adicionado",
      "Não foi possível adicionar"
    );
    setSaving(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleAdd} disabled={saving}>
      {saving ? (
        <Loader2 className="mr-1.5 size-4 animate-spin" />
      ) : (
        <Plus className="mr-1.5 size-4" />
      )}
      Apartamento
    </Button>
  );
}

function UnitRow({
  projectId,
  unit,
}: {
  projectId: Id<"projects">;
  unit: GridUnit;
}) {
  const upsert = useMutation(api.projectUnits.upsert);
  const remove = useMutation(api.projectUnits.remove);
  const [label, setLabel] = useState(unit.label);
  const [type, setType] = useState(unit.type);
  const [span, setSpan] = useState(String(unit.floorSpan));
  const [saving, setSaving] = useState(false);

  const dirty =
    label !== unit.label ||
    type !== unit.type ||
    span !== String(unit.floorSpan);

  async function handleSave() {
    setSaving(true);
    await runWithToast(
      () =>
        upsert({
          unitId: unit._id,
          projectId,
          floor: unit.floor,
          final: unit.final,
          label,
          type,
          floorSpan: Math.max(1, Math.floor(Number(span) || 1)),
        }),
      "Apartamento salvo",
      "Não foi possível salvar"
    );
    setSaving(false);
  }

  async function handleRemove() {
    if (!window.confirm(`Remover o apartamento ${unit.label}?`)) return;
    await runWithToast(
      () => remove({ unitId: unit._id }),
      "Apartamento removido",
      "Não foi possível remover"
    );
  }

  return (
    <div className="grid grid-cols-12 items-end gap-2 rounded-lg border p-2">
      <div className="col-span-3 space-y-1">
        <span className="text-xs text-muted-foreground">Apto (Final {unit.final})</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="col-span-3 space-y-1">
        <span className="text-xs text-muted-foreground">Tipo</span>
        <Select value={type} onValueChange={(v) => setType(v as GridUnit["type"])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vrf">VRF</SelectItem>
            <SelectItem value="split">Split</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3 space-y-1">
        <span className="text-xs text-muted-foreground">Andares (span)</span>
        <Select value={span} onValueChange={setSpan}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 — Normal</SelectItem>
            <SelectItem value="2">2 — Duplex</SelectItem>
            <SelectItem value="3">3 — Triplex</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3 flex items-center justify-end gap-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Salvar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remover"
          onClick={handleRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
