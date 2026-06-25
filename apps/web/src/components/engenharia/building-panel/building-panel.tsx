import { useEffect, useMemo, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TowerSelector } from "@/components/engenharia/building-panel/tower-selector";
import {
  FloorGrid,
  FloorLegend,
} from "@/components/engenharia/building-panel/floor-grid";
import { FloorDetail } from "@/components/engenharia/building-panel/floor-detail";
import type {
  HierarchyFloor,
  HierarchyItem,
  HierarchyTower,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";

/** Ações de edição opcionais. Quando ausentes, o painel é somente-leitura. */
export type BuildingPanelActions = {
  onAddFloors?: (tower: HierarchyTower) => void;
  onAddEnvironment?: (floor: HierarchyFloor) => void;
  onGenerateQr?: (item: HierarchyItem) => void;
};

export function BuildingPanel({
  hierarchy,
  now,
  actions,
}: {
  hierarchy: ProjectHierarchy;
  now: number;
  actions?: BuildingPanelActions;
}) {
  const towers = hierarchy.towers;
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(
    towers[0]?._id ?? null
  );
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  // Garante uma torre selecionada quando os dados chegam/mudam.
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

  const selectedFloor = useMemo(
    () =>
      selectedTower?.floors.find((f) => f._id === selectedFloorId) ?? null,
    [selectedTower, selectedFloorId]
  );

  if (towers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <Building2 className="size-10" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Nenhuma torre cadastrada
          </p>
          <p className="max-w-sm text-sm">
            Crie torres, andares e ambientes para visualizar a evolução da obra.
            Você pode usar o assistente de IA para montar tudo rapidamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TowerSelector
        towers={towers}
        selectedTowerId={selectedTowerId}
        onSelect={(id) => {
          setSelectedTowerId(id);
          setSelectedFloorId(null);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <FloorLegend />
            {actions?.onAddFloors && selectedTower && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => actions.onAddFloors?.(selectedTower)}
              >
                <Plus className="mr-1 size-3.5" />
                Andares
              </Button>
            )}
          </div>
          <FloorGrid
            floors={selectedTower?.floors ?? []}
            now={now}
            selectedFloorId={selectedFloorId}
            onSelectFloor={setSelectedFloorId}
          />
        </div>
        <div className="space-y-2">
          {actions?.onAddEnvironment && selectedFloor && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="xs"
                onClick={() => actions.onAddEnvironment?.(selectedFloor)}
              >
                <Plus className="mr-1 size-3.5" />
                Ambiente
              </Button>
            </div>
          )}
          <FloorDetail
            floor={selectedFloor}
            now={now}
            onGenerateQr={actions?.onGenerateQr}
          />
        </div>
      </div>
    </div>
  );
}
