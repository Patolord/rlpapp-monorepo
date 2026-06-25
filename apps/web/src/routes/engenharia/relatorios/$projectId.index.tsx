import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";

import { AuthShell } from "@/components/auth-shell";
import { ApartmentPanel } from "@/components/engenharia/apartment-panel";
import { BuildingGrid } from "@/components/engenharia/building-grid";
import {
  BuildingMatrixPanel,
  type BuildingMatrixActions,
} from "@/components/engenharia/building-panel/building-matrix";
import {
  AddEnvironmentDialog,
  AddEquipmentDialog,
  AddFloorsDialog,
  EditFloorDialog,
  EditTowerDialog,
  NewTowerDialog,
} from "@/components/engenharia/building-panel/edit-dialogs";
import type {
  HierarchyEnvironment,
  HierarchyFloor,
  HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";
import { UNIT_STATE_STYLES } from "@/components/engenharia/building";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Card, CardContent } from "@/components/ui/card";
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
    <ProjectShell projectId={projectId} tab="building">
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
  // Prioriza a hierarquia (torre → andar → ambiente). O grid legado de
  // apartamentos só aparece em obras antigas sem hierarquia migrada.
  const useLegacyGrid =
    project.hierarchyEnvironments === 0 && project.units.length > 0;

  if (useLegacyGrid) {
    return <LegacyBuilding project={project} now={now} />;
  }

  return <HierarchyBuilding project={project} now={now} />;
}

function HierarchyBuilding({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const generateQr = useMutation(api.qrCodes.generateForProjectEquipment);
  const removeEquipment = useMutation(api.projectEquipment.remove);

  const [towerDialogOpen, setTowerDialogOpen] = useState(false);
  const [editTowerTarget, setEditTowerTarget] = useState<HierarchyTower | null>(
    null
  );
  const [floorsTarget, setFloorsTarget] = useState<HierarchyTower | null>(null);
  const [editFloorTarget, setEditFloorTarget] = useState<HierarchyFloor | null>(
    null
  );
  const [envTarget, setEnvTarget] = useState<HierarchyFloor | null>(null);
  const [equipTarget, setEquipTarget] = useState<HierarchyEnvironment | null>(
    null
  );

  const actions: BuildingMatrixActions = {
    onAddTower: () => setTowerDialogOpen(true),
    onEditTower: (tower) => setEditTowerTarget(tower),
    onAddFloors: (tower) => setFloorsTarget(tower),
    onEditFloor: (floor) => setEditFloorTarget(floor),
    onAddEnvironment: (floor) => setEnvTarget(floor),
    onAddEquipment: (env) => setEquipTarget(env),
    onGenerateQr: (item) =>
      runWithToast(
        () => generateQr({ itemId: item._id }),
        "QR gerado",
        "Não foi possível gerar o QR"
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
        <CardContent className="py-6">
          <BuildingMatrixPanel
            projectId={project._id as Id<"projects">}
            now={now}
            actions={actions}
          />
        </CardContent>
      </Card>

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
      <AddEquipmentDialog
        environment={equipTarget}
        onClose={() => setEquipTarget(null)}
      />
    </>
  );
}

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

      <ApartmentPanel
        projectId={project._id as Id<"projects">}
        unit={selectedUnit}
        onClose={() => setSelectedUnitId(null)}
      />
    </>
  );
}

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
