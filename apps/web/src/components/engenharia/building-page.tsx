import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Boxes, Building2, PackagePlus, Zap } from "lucide-react";

import { LinkEquipmentDialog } from "@/components/engenharia/link-equipment-dialog";
import {
  BuildingMatrixPanel,
  type BuildingMatrixActions,
} from "@/components/engenharia/building-panel/building-matrix";
import { QuickAddPanel } from "@/components/engenharia/building-panel/quick-add-panel";
import { ReplicateFloorDialog } from "@/components/engenharia/building-panel/replicate-floor-dialog";
import { SystemsPanel } from "@/components/engenharia/building-panel/systems-panel";
import {
  UnassignedEquipmentPanel,
  type AssignTarget,
} from "@/components/engenharia/building-panel/unassigned-equipment-panel";
import { EditEquipmentDialog } from "@/components/engenharia/building-panel/dialogs/edit-equipment-dialog";
import {
  AddEnvironmentDialog,
  EditEnvironmentDialog,
} from "@/components/engenharia/building-panel/dialogs/environment-dialogs";
import {
  AddFloorsDialog,
  EditFloorDialog,
} from "@/components/engenharia/building-panel/dialogs/floor-dialogs";
import { EditSystemDialog } from "@/components/engenharia/building-panel/dialogs/system-dialogs";
import {
  EditTowerDialog,
  NewTowerDialog,
} from "@/components/engenharia/building-panel/dialogs/tower-dialogs";
import type {
  HierarchyEnvironment,
  HierarchyFloor,
  HierarchyItem,
  HierarchySystem,
  HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";
import { GlobalEquipmentTable } from "@/components/engenharia/global-equipment-table";
import { LegacyBuilding } from "@/components/engenharia/legacy-building";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { runWithToast } from "@/lib/errors";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export function BuildingPage() {
  const projectId = useObraProjectId();
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
  // Andar de origem do diálogo "Replicar andar".
  const [replicateFloorId, setReplicateFloorId] =
    useState<Id<"floors"> | null>(null);
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
    onReplicateFloor: (floor) =>
      setReplicateFloorId(floor._id as Id<"floors">),
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
        <CardContent className="space-y-4">
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
                  <Zap />
                  Cadastro rápido
                </Button>
                <Button
                  variant={poolOpen ? "secondary" : "outline"}
                  size="xs"
                  onClick={togglePool}
                >
                  <PackagePlus />
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
                <Building2 />
                Prédio
              </Button>
              <Button
                variant={view === "sistemas" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setView("sistemas")}
              >
                <Boxes />
                Sistemas
              </Button>
            </div>
          </div>
          {view === "predio" ? (
            poolOpen || quickAddOpen ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
                <div className="min-w-0">
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
                </div>
                {/* No mobile o painel vem antes do prédio para não ficar
                    escondido no fim da página. */}
                <div className="order-first min-w-0 lg:order-none">
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
      <ReplicateFloorDialog
        projectId={projectId}
        sourceFloorId={replicateFloorId}
        onClose={() => setReplicateFloorId(null)}
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
