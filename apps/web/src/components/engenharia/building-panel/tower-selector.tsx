import { Building2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HierarchyTower } from "@/components/engenharia/building-panel/hierarchy";

export function TowerSelector({
  towers,
  selectedTowerId,
  onSelect,
  onAddTower,
  onEditTower,
}: {
  towers: HierarchyTower[];
  selectedTowerId: string | null;
  onSelect: (towerId: string) => void;
  onAddTower?: () => void;
  onEditTower?: (tower: HierarchyTower) => void;
}) {
  // Com uma única torre não faz sentido mostrar o seletor — só o botão de
  // adicionar (quando editável). Evita a sensação de "muita torre" reportada.
  const showCards = towers.length > 1;

  if (towers.length === 0) {
    return onAddTower ? (
      <Button variant="outline" size="sm" onClick={onAddTower}>
        <Plus className="mr-1.5 size-4" />
        Nova torre
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {showCards &&
        towers.map((tower) => {
          const totalItems = tower.floors.reduce(
            (s, f) => s + f.totalItems,
            0
          );
          const installed = tower.floors.reduce(
            (s, f) => s + f.installedItems,
            0
          );
          const pct =
            totalItems === 0 ? 0 : Math.round((installed / totalItems) * 100);
          const active = tower._id === selectedTowerId;

          return (
            <div
              key={tower._id}
              className={cn(
                "group relative flex min-w-40 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(tower._id)}
                className="absolute inset-0"
                aria-label={`Selecionar ${tower.name}`}
              />
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="font-semibold">{tower.name}</span>
                {onEditTower && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTower(tower);
                    }}
                    className="relative z-10 ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    aria-label={`Editar ${tower.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {tower.floors.length} andar
                  {tower.floors.length === 1 ? "" : "es"}
                </span>
                <span className="font-medium tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

    </div>
  );
}
