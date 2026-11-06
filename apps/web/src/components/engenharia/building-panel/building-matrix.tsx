import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BuildingMatrix } from "@/components/engenharia/building-panel/building-matrix-grid";
import { EnvironmentSheet } from "@/components/engenharia/building-panel/environment-sheet";
import { FloorLegend } from "@/components/engenharia/building-panel/floor-grid";
import { FloorListMobile } from "@/components/engenharia/building-panel/floor-list-mobile";
import { TowerSelector } from "@/components/engenharia/building-panel/tower-selector";
import {
  environmentShapeRowSpan,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyItem,
  type HierarchySystem,
  type HierarchyTower,
  type ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";

/** Ações de edição opcionais. Sem elas, o painel é somente-leitura. */
export type BuildingMatrixActions = {
  onAddTower?: () => void;
  onEditTower?: (tower: HierarchyTower) => void;
  onAddFloors?: (tower: HierarchyTower) => void;
  onEditFloor?: (floor: HierarchyFloor) => void;
  /** Replica ambientes/sistemas/equipamentos do andar para outros andares. */
  onReplicateFloor?: (floor: HierarchyFloor) => void;
  onAddEnvironment?: (floor: HierarchyFloor) => void;
  onEditEnvironment?: (env: HierarchyEnvironment) => void;
  onRemoveEnvironment?: (env: HierarchyEnvironment) => void;
  onEditSystem?: (system: HierarchySystem) => void;
  /** Adiciona equipamento no ambiente, com sistema pré-selecionado. */
  onAddEquipment?: (
    env: HierarchyEnvironment,
    system: HierarchySystem | null
  ) => void;
  onEditEquipment?: (item: HierarchyItem, env: HierarchyEnvironment) => void;
  onGenerateQr?: (item: HierarchyItem) => void;
  onLinkQr?: (item: HierarchyItem) => void;
  onUnlinkQr?: (item: HierarchyItem) => void;
  onRemoveEquipment?: (item: HierarchyItem) => void;
};

/**
 * Visualização principal do prédio em matriz (andares nas linhas, ambientes nas
 * colunas) lida da hierarquia Torre → Andar → Ambiente. Cada célula é colorida
 * pelo estado de instalação. Clicar abre o painel lateral com os detalhes.
 *
 * Em `selectionMode` (painel de equipamentos não atribuídos aberto), clicar em
 * uma célula apenas a marca como alvo da atribuição (destacada), sem abrir o
 * sheet de detalhes.
 *
 * Em `multiSelectMode` (painel de cadastro rápido aberto), clicar em células
 * alterna a seleção múltipla de ambientes; clicar no rótulo do andar alterna o
 * andar inteiro.
 */
export function BuildingMatrixPanel({
  projectId,
  now,
  actions,
  selectionMode = false,
  selectedTargetEnvId = null,
  onSelectTarget,
  multiSelectMode = false,
  multiSelectedEnvIds,
  onToggleEnv,
  onToggleFloor,
}: {
  projectId: Id<"projects">;
  now: number;
  actions?: BuildingMatrixActions;
  selectionMode?: boolean;
  selectedTargetEnvId?: string | null;
  onSelectTarget?: (floorLabel: string, env: HierarchyEnvironment) => void;
  multiSelectMode?: boolean;
  multiSelectedEnvIds?: ReadonlySet<string>;
  onToggleEnv?: (env: HierarchyEnvironment) => void;
  onToggleFloor?: (floor: HierarchyFloor) => void;
}) {
  const hierarchy = useQuery(api.projects.getHierarchy, {
    projectId,
  }) as ProjectHierarchy | null | undefined;

  const towers = hierarchy?.towers ?? [];
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<{
    floorLabel: string;
    envId: string;
  } | null>(null);

  useEffect(() => {
    if (towers.length === 0) {
      setSelectedTowerId(null);
      return;
    }
    if (!towers.some((t) => t._id === selectedTowerId)) {
      setSelectedTowerId(towers[0]._id);
    }
  }, [towers, selectedTowerId]);

  const selectedTower = useMemo(
    () => towers.find((t) => t._id === selectedTowerId) ?? null,
    [towers, selectedTowerId]
  );

  // Mantém o painel lateral sincronizado com os dados reativos (ex: após
  // adicionar/remover um equipamento o sheet reflete na hora).
  const selectedEnvData = useMemo(() => {
    if (!selectedEnv || !selectedTower) return null;
    const floors = selectedTower.floors
      .slice()
      .sort((a, b) => b.number - a.number);
    for (let idx = 0; idx < floors.length; idx++) {
      const floor = floors[idx];
      const env = floor.environments.find((e) => e._id === selectedEnv.envId);
      if (!env) continue;
      // Formas com mais de um andar mostram o intervalo de andares ocupados.
      const rowSpan = Math.min(environmentShapeRowSpan(env), idx + 1);
      const floorLabel =
        rowSpan > 1
          ? `${floor.label} – ${floors[idx - (rowSpan - 1)].label}`
          : floor.label;
      return { floorLabel, env };
    }
    return null;
  }, [selectedEnv, selectedTower]);

  const handleSelectEnvironment = (
    floorLabel: string,
    env: HierarchyEnvironment
  ) => {
    if (multiSelectMode && onToggleEnv) {
      onToggleEnv(env);
      return;
    }
    if (selectionMode && onSelectTarget) {
      onSelectTarget(floorLabel, env);
      return;
    }
    setSelectedEnv({ floorLabel, envId: env._id });
  };

  if (hierarchy === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (towers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-muted-foreground">
        <Building2 className="size-10" />
        <p className="max-w-sm text-sm">
          Nenhuma torre cadastrada ainda. Use o Assistente IA ao lado ou crie a
          torre manualmente.
        </p>
        {actions?.onAddTower && (
          <Button variant="outline" size="sm" onClick={actions.onAddTower}>
            <Plus />
            Nova torre
          </Button>
        )}
      </div>
    );
  }

  const singleTower = towers.length === 1;

  return (
    <div className="space-y-4">
      <TowerSelector
        towers={towers}
        selectedTowerId={selectedTowerId}
        onSelect={(id) => setSelectedTowerId(id)}
        onEditTower={actions?.onEditTower}
      />

      {selectedTower && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {singleTower && (
                <>
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{selectedTower.name}</span>
                  {actions?.onEditTower && (
                    <button
                      type="button"
                      onClick={() => actions.onEditTower?.(selectedTower)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Editar torre"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {actions?.onAddTower && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={actions.onAddTower}
                >
                  <Plus />
                  Nova torre
                </Button>
              )}
              {actions?.onAddFloors && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => actions.onAddFloors?.(selectedTower)}
                >
                  <Plus />
                  Andares
                </Button>
              )}
            </div>
          </div>

          {/* Matriz esquemática (md+); no mobile vira lista por andar. */}
          <div className="hidden md:block">
            <BuildingMatrix
              tower={selectedTower}
              now={now}
              actions={actions}
              highlightEnvId={selectionMode ? selectedTargetEnvId : null}
              selectedEnvIds={
                multiSelectMode ? multiSelectedEnvIds : undefined
              }
              onToggleFloor={multiSelectMode ? onToggleFloor : undefined}
              onSelectEnvironment={handleSelectEnvironment}
            />
          </div>
          <div className="md:hidden">
            <FloorListMobile
              tower={selectedTower}
              now={now}
              actions={actions}
              highlightEnvId={selectionMode ? selectedTargetEnvId : null}
              selectedEnvIds={
                multiSelectMode ? multiSelectedEnvIds : undefined
              }
              forceExpanded={selectionMode || multiSelectMode}
              onToggleFloor={multiSelectMode ? onToggleFloor : undefined}
              onSelectEnvironment={handleSelectEnvironment}
            />
          </div>

          <FloorLegend />
        </>
      )}

      <EnvironmentSheet
        data={selectedEnvData}
        systems={hierarchy?.systems ?? []}
        now={now}
        actions={actions}
        onClose={() => setSelectedEnv(null)}
      />
    </div>
  );
}
