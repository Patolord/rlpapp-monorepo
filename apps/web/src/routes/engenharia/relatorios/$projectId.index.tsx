import { useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Building2,
  Download,
  Loader2,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { LinkEquipmentDialog } from "@/components/engenharia/link-equipment-dialog";
import { ApartmentPanel } from "@/components/engenharia/apartment-panel";
import { BuildingGrid } from "@/components/engenharia/building-grid";
import {
  BuildingMatrixPanel,
  type BuildingMatrixActions,
} from "@/components/engenharia/building-panel/building-matrix";
import { QuickAddPanel } from "@/components/engenharia/building-panel/quick-add-panel";
import { SystemsPanel } from "@/components/engenharia/building-panel/systems-panel";
import {
  UnassignedEquipmentPanel,
  type AssignTarget,
} from "@/components/engenharia/building-panel/unassigned-equipment-panel";
import {
  AddEnvironmentDialog,
  AddFloorsDialog,
  EditEnvironmentDialog,
  EditEquipmentDialog,
  EditFloorDialog,
  EditSystemDialog,
  EditTowerDialog,
  NewTowerDialog,
} from "@/components/engenharia/building-panel/edit-dialogs";
import type {
  HierarchyEnvironment,
  HierarchyFloor,
  HierarchyItem,
  HierarchySystem,
  HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";
import {
  UNIT_STATE_STYLES,
  TYPE_LABELS,
  type GridUnit,
} from "@/components/engenharia/building";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { runWithToast } from "@/lib/errors";

export const Route = createFileRoute("/engenharia/relatorios/$projectId/")({
  component: () => (
    <AuthShell>
      <BuildingPage />
    </AuthShell>
  ),
});

function BuildingPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId}>
      {(project, now) => <BuildingContent project={project} now={now} />}
    </ProjectShell>
  );
}

function BuildingContent({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const useLegacyGrid =
    project.hierarchyEnvironments === 0 && project.units.length > 0;

  if (useLegacyGrid) {
    return <LegacyBuilding project={project} now={now} />;
  }

  return <HierarchyBuilding project={project} now={now} />;
}

/* ── Hierarquia (torre → andar → ambiente) ── */

const POOL_OPEN_KEY = "engenharia.unassignedPanel.open";

function HierarchyBuilding({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const projectId = project._id as Id<"projects">;
  const generateQr = useMutation(api.qrCodes.generateForProjectEquipment);
  const removeEquipment = useMutation(api.projectEquipment.remove);
  const unlinkEquipment = useMutation(api.projectEquipment.unlinkEquipment);
  const removeEnvironment = useMutation(api.environments.remove);
  const systems =
    useQuery(api.systems.listSystemsByProject, { projectId }) ?? [];

  const [view, setView] = useState<"predio" | "sistemas">("predio");
  // Painel lateral de equipamentos não atribuídos (persistido entre visitas).
  const [poolOpen, setPoolOpen] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(POOL_OPEN_KEY) === "1"
  );
  // Ambiente selecionado na matriz como alvo da atribuição.
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  // Painel de cadastro rápido (multisseleção de ambientes na matriz).
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedEnvIds, setSelectedEnvIds] = useState<
    Set<Id<"environments">>
  >(() => new Set());
  // Sistema pré-ativado no painel (botão "Equipamento" de um grupo).
  const [quickAddSystemId, setQuickAddSystemId] =
    useState<Id<"systems"> | null>(null);
  const [towerDialogOpen, setTowerDialogOpen] = useState(false);
  const [editTowerTarget, setEditTowerTarget] = useState<HierarchyTower | null>(
    null
  );
  const [floorsTarget, setFloorsTarget] = useState<HierarchyTower | null>(null);
  const [editFloorTarget, setEditFloorTarget] = useState<HierarchyFloor | null>(
    null
  );
  const [envTarget, setEnvTarget] = useState<HierarchyFloor | null>(null);
  const [editEnvTarget, setEditEnvTarget] =
    useState<HierarchyEnvironment | null>(null);
  const [editSystemTarget, setEditSystemTarget] =
    useState<HierarchySystem | null>(null);
  const [editEquipTarget, setEditEquipTarget] = useState<{
    item: HierarchyItem;
    env: HierarchyEnvironment;
  } | null>(null);
  const [linkItemId, setLinkItemId] = useState<Id<"projectEquipment"> | null>(
    null
  );

  function closePool() {
    window.localStorage.setItem(POOL_OPEN_KEY, "0");
    setAssignTarget(null);
    setPoolOpen(false);
  }

  function togglePool() {
    const next = !poolOpen;
    window.localStorage.setItem(POOL_OPEN_KEY, next ? "1" : "0");
    if (!next) setAssignTarget(null);
    // Painéis laterais são mutuamente exclusivos.
    if (next) closeQuickAdd();
    setPoolOpen(next);
  }

  function openQuickAdd() {
    if (poolOpen) closePool();
    setView("predio");
    setQuickAddOpen(true);
  }

  function closeQuickAdd() {
    setQuickAddOpen(false);
    setSelectedEnvIds(new Set());
    setQuickAddSystemId(null);
  }

  function toggleEnvSelection(env: HierarchyEnvironment) {
    setSelectedEnvIds((prev) => {
      const next = new Set(prev);
      if (next.has(env._id)) next.delete(env._id);
      else next.add(env._id);
      return next;
    });
  }

  function toggleFloorSelection(floor: HierarchyFloor) {
    setSelectedEnvIds((prev) => {
      const next = new Set(prev);
      const ids = floor.environments.map((e) => e._id);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const actions: BuildingMatrixActions = {
    onAddTower: () => setTowerDialogOpen(true),
    onEditTower: (tower) => setEditTowerTarget(tower),
    onAddFloors: (tower) => setFloorsTarget(tower),
    onEditFloor: (floor) => setEditFloorTarget(floor),
    onAddEnvironment: (floor) => setEnvTarget(floor),
    onEditEnvironment: (env) => setEditEnvTarget(env),
    onRemoveEnvironment: (env) => {
      if (
        !window.confirm(
          `Remover o ambiente "${env.name}" e TODOS os seus equipamentos? Sistemas que ficarem sem equipamentos também serão removidos. Esta ação não pode ser desfeita.`
        )
      )
        return;
      void runWithToast(
        () => removeEnvironment({ environmentId: env._id }),
        "Ambiente removido",
        "Não foi possível remover o ambiente"
      );
    },
    onEditSystem: (system) => setEditSystemTarget(system),
    onAddEquipment: (env, system) => {
      // Abre o cadastro rápido com o ambiente selecionado e o sistema ativo.
      openQuickAdd();
      setSelectedEnvIds((prev) => new Set(prev).add(env._id));
      setQuickAddSystemId(system?._id ?? null);
    },
    onEditEquipment: (item, env) => setEditEquipTarget({ item, env }),
    onGenerateQr: (item) =>
      runWithToast(
        () => generateQr({ itemId: item._id }),
        "QR gerado",
        "Não foi possível gerar o QR"
      ),
    onLinkQr: (item) => setLinkItemId(item._id),
    onUnlinkQr: (item) =>
      runWithToast(
        () => unlinkEquipment({ itemId: item._id }),
        "Equipamento desvinculado",
        "Não foi possível desvincular"
      ),
    onRemoveEquipment: (item) => {
      if (
        !window.confirm(
          `Remover o equipamento "${item.system}"? Esta ação não pode ser desfeita.`
        )
      )
        return;
      void runWithToast(
        () => removeEquipment({ itemId: item._id }),
        "Equipamento removido",
        "Não foi possível remover o equipamento"
      );
    },
  };

  return (
    <>
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {view === "predio" && (
              <>
                <Button
                  variant={quickAddOpen ? "secondary" : "outline"}
                  size="xs"
                  onClick={() =>
                    quickAddOpen ? closeQuickAdd() : openQuickAdd()
                  }
                >
                  <Zap className="mr-1.5 size-3.5" />
                  Cadastro rápido
                </Button>
                <Button
                  variant={poolOpen ? "secondary" : "outline"}
                  size="xs"
                  onClick={togglePool}
                >
                  <PackagePlus className="mr-1.5 size-3.5" />
                  Equipamentos
                </Button>
              </>
            )}
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                variant={view === "predio" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setView("predio")}
              >
                <Building2 className="mr-1.5 size-3.5" />
                Prédio
              </Button>
              <Button
                variant={view === "sistemas" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setView("sistemas")}
              >
                <Boxes className="mr-1.5 size-3.5" />
                Sistemas
              </Button>
            </div>
          </div>
          {view === "predio" ? (
            poolOpen || quickAddOpen ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
                <BuildingMatrixPanel
                  projectId={project._id as Id<"projects">}
                  now={now}
                  actions={actions}
                  selectionMode={poolOpen}
                  selectedTargetEnvId={
                    poolOpen ? assignTarget?.envId ?? null : null
                  }
                  onSelectTarget={(floorLabel, env) =>
                    setAssignTarget({
                      envId: env._id,
                      envName: env.name,
                      floorLabel,
                    })
                  }
                  multiSelectMode={quickAddOpen}
                  multiSelectedEnvIds={selectedEnvIds}
                  onToggleEnv={toggleEnvSelection}
                  onToggleFloor={toggleFloorSelection}
                />
                {poolOpen ? (
                  <UnassignedEquipmentPanel
                    projectId={projectId}
                    systems={systems}
                    target={assignTarget}
                    onClose={togglePool}
                  />
                ) : (
                  <QuickAddPanel
                    projectId={projectId}
                    systems={systems}
                    selectedEnvIds={selectedEnvIds}
                    initialSystemId={quickAddSystemId}
                    onDeselectEnv={(envId) =>
                      setSelectedEnvIds((prev) => {
                        const next = new Set(prev);
                        next.delete(envId);
                        return next;
                      })
                    }
                    onClearSelection={() => setSelectedEnvIds(new Set())}
                    onClose={closeQuickAdd}
                  />
                )}
              </div>
            ) : (
              <BuildingMatrixPanel
                projectId={project._id as Id<"projects">}
                now={now}
                actions={actions}
              />
            )
          ) : (
            <SystemsPanel
              projectId={project._id as Id<"projects">}
              now={now}
              actions={actions}
            />
          )}
        </CardContent>
      </Card>

      <EntregasSection projectId={project._id} />
      <GlobalEquipmentTable project={project} />

      <NewTowerDialog
        projectId={project._id}
        open={towerDialogOpen}
        onOpenChange={setTowerDialogOpen}
      />
      <EditTowerDialog
        tower={editTowerTarget}
        onClose={() => setEditTowerTarget(null)}
      />
      <AddFloorsDialog
        tower={floorsTarget}
        onClose={() => setFloorsTarget(null)}
      />
      <EditFloorDialog
        floor={editFloorTarget}
        onClose={() => setEditFloorTarget(null)}
      />
      <AddEnvironmentDialog
        floor={envTarget}
        onClose={() => setEnvTarget(null)}
      />
      <EditEnvironmentDialog
        environment={editEnvTarget}
        onClose={() => setEditEnvTarget(null)}
      />
      <EditSystemDialog
        system={editSystemTarget}
        onClose={() => setEditSystemTarget(null)}
      />
      <EditEquipmentDialog
        item={editEquipTarget?.item ?? null}
        environmentId={editEquipTarget?.env._id ?? null}
        systems={systems}
        onClose={() => setEditEquipTarget(null)}
      />
      <LinkEquipmentDialog
        itemId={linkItemId}
        onClose={() => setLinkItemId(null)}
      />
    </>
  );
}

/* ── Grid legado (apartamentos) ── */

function LegacyBuilding({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const selectedUnit =
    project.units.find((u) => u._id === selectedUnitId) ?? null;

  return (
    <>
      <Card>
        <CardContent className="py-6">
          <BuildingGrid
            floors={project.floors}
            units={project.units}
            now={now}
            selectedUnitId={selectedUnitId}
            onSelectUnit={(u) => setSelectedUnitId(u._id)}
          />
          <Legend />
        </CardContent>
      </Card>

      <EntregasSection projectId={project._id} />
      <GlobalEquipmentTable project={project} />

      <ApartmentPanel
        projectId={project._id as Id<"projects">}
        unit={selectedUnit}
        onClose={() => setSelectedUnitId(null)}
      />
    </>
  );
}

/* ── Entregas ── */

function EntregasSection({ projectId }: { projectId: Id<"projects"> }) {
  const summary = useQuery(api.deliveries.summary, { projectId });
  const deliveries = useQuery(api.deliveries.list, { projectId });
  const remove = useMutation(api.deliveries.remove);

  return (
    <section className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <h2 className="text-lg font-semibold">Necessário × Entregue × Saldo</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Capacidade</TableHead>
                    <TableHead className="text-right">Necessário</TableHead>
                    <TableHead className="text-right">Instalado</TableHead>
                    <TableHead className="text-right">Entregue</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary === undefined ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center">
                        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : summary.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhum modelo definido nos equipamentos previstos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.map((r) => (
                      <TableRow key={r.modelo}>
                        <TableCell className="font-medium">{r.modelo}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.capacidade ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.needed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-green-700">
                          {r.installed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.delivered}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            r.saldo > 0
                              ? "text-red-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {r.saldo}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <AddDeliveryForm projectId={projectId} />

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Entregas lançadas</h2>
            {deliveries === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : deliveries.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                Nenhuma entrega lançada.
              </p>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div
                    key={d._id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {d.qty > 0 ? "+" : ""}
                        {d.qty} · {d.modelo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.date).toLocaleDateString("pt-BR")}
                        {d.note ? ` · ${d.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Remover entrega"
                      onClick={() =>
                        runWithToast(
                          () => remove({ deliveryId: d._id }),
                          "Entrega removida",
                          "Não foi possível remover"
                        )
                      }
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AddDeliveryForm({ projectId }: { projectId: Id<"projects"> }) {
  const add = useMutation(api.deliveries.add);
  const [modelo, setModelo] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const qtyNum = Math.floor(Number(qty));
    if (!modelo.trim() || !qtyNum) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        add({
          projectId,
          modelo: modelo.trim(),
          qty: qtyNum,
          date: new Date(`${date}T12:00:00`).getTime(),
          note: note.trim() || undefined,
        }),
      "Entrega lançada",
      "Não foi possível lançar a entrega"
    );
    setSaving(false);
    if (ok) {
      setModelo("");
      setQty("");
      setNote("");
    }
  }

  return (
    <Card>
      <CardContent className="py-5">
        <h2 className="mb-3 text-lg font-semibold">Lançar entrega</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="d-modelo">Modelo</Label>
            <Input
              id="d-modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ex: AM040KXMDCH/AZ"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-qty">Quantidade</Label>
              <Input
                id="d-qty"
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Ex: 22"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-date">Data</Label>
              <Input
                id="d-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-note">Observação (opcional)</Label>
            <Input
              id="d-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: 1ª entrega"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={saving || !modelo.trim() || !qty}
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-4" />
            )}
            Lançar entrega
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ── Tabela global de equipamentos ── */

type Row = {
  unidade: string;
  final: number;
  floor: number;
  type: GridUnit["type"];
  system: string;
  ambiente: string;
  kind: "condensadora" | "evaporadora";
  modelo: string;
  capacidade: string;
  status: "installing" | "operational" | "warning" | "error";
  obs: string;
};

const ALL = "__all__";

function GlobalEquipmentTable({ project }: { project: ProjectOverview }) {
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const rows: Row[] = useMemo(
    () =>
      project.units.flatMap((u) =>
        u.equipment.map((e) => ({
          unidade: u.label,
          final: u.final,
          floor: u.floor,
          type: u.type,
          system: e.system,
          ambiente: e.ambiente,
          kind: e.kind,
          modelo: e.modelo,
          capacidade: e.capacidade,
          status: e.status,
          obs: e.obs ?? "",
        }))
      ),
    [project.units]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => floor === ALL || String(r.floor) === floor)
      .filter((r) => type === ALL || r.type === type)
      .filter((r) => status === ALL || r.status === status)
      .filter(
        (r) =>
          !term ||
          r.unidade.toLowerCase().includes(term) ||
          r.modelo.toLowerCase().includes(term) ||
          r.ambiente.toLowerCase().includes(term) ||
          r.system.toLowerCase().includes(term)
      )
      .sort(
        (a, b) =>
          a.floor - b.floor ||
          a.final - b.final ||
          a.system.localeCompare(b.system)
      );
  }, [rows, search, floor, type, status]);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Equipamentos</h2>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar apto, modelo, ambiente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterSelect
            value={floor}
            onChange={setFloor}
            placeholder="Andar"
            options={[
              { value: ALL, label: "Todos os andares" },
              ...project.floors
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((f) => ({
                  value: String(f.number),
                  label: f.label,
                })),
            ]}
          />
          <FilterSelect
            value={type}
            onChange={setType}
            placeholder="Tipo"
            options={[
              { value: ALL, label: "VRF e Split" },
              { value: "vrf", label: "VRF" },
              { value: "split", label: "Split" },
            ]}
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            placeholder="Status"
            options={[
              { value: ALL, label: "Todos os status" },
              { value: "operational", label: "Operacional" },
              { value: "installing", label: "Em instalação" },
              { value: "warning", label: "Alerta" },
              { value: "error", label: "Erro" },
            ]}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => exportCsv(filtered, project.name)}
          disabled={filtered.length === 0}
        >
          <Download className="mr-1.5 size-4" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Capacidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Obs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Nenhum equipamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-semibold tabular-nums">
                      {r.unidade}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.final}</TableCell>
                    <TableCell>{r.system}</TableCell>
                    <TableCell>{r.ambiente}</TableCell>
                    <TableCell>{TYPE_LABELS[r.type]}</TableCell>
                    <TableCell>{r.modelo || "—"}</TableCell>
                    <TableCell>{r.capacidade || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">
                      {r.obs || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-right text-xs text-muted-foreground">
        {filtered.length} de {rows.length} equipamentos
      </p>
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  // `items` faz o trigger exibir o rótulo da opção em vez do valor bruto.
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} items={items} onValueChange={onChange}>
      <SelectTrigger className="sm:w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STATUS_LABELS_CSV: Record<Row["status"], string> = {
  installing: "Em instalação",
  operational: "Operacional",
  warning: "Alerta",
  error: "Erro",
};

function exportCsv(rows: Row[], projectName: string) {
  const header = [
    "Unidade",
    "Final",
    "Sistema",
    "Ambiente",
    "Tipo",
    "Modelo",
    "Capacidade",
    "Status",
    "Obs",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    header.join(";"),
    ...rows.map((r) =>
      [
        r.unidade,
        String(r.final),
        r.system,
        r.ambiente,
        TYPE_LABELS[r.type],
        r.modelo,
        r.capacidade,
        STATUS_LABELS_CSV[r.status],
        r.obs,
      ]
        .map(esc)
        .join(";")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName} - Global.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Legenda ── */

const legendItems: { key: keyof typeof UNIT_STATE_STYLES; label: string }[] = [
  { key: "complete", label: "Concluído" },
  { key: "partial", label: "Parcial" },
  { key: "pending", label: "Pendente" },
  { key: "overdue", label: "Em atraso" },
  { key: "empty", label: "Sem equipamentos" },
];

function Legend() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2">
      {legendItems.map((item) => (
        <span
          key={item.key}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <span
            className={`size-3.5 rounded border-2 ${UNIT_STATE_STYLES[item.key].cell}`}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
