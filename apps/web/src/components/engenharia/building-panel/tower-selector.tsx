import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { HierarchyTower } from "@/components/engenharia/building-panel/hierarchy";

export function TowerSelector({
  towers,
  selectedTowerId,
  onSelect,
}: {
  towers: HierarchyTower[];
  selectedTowerId: string | null;
  onSelect: (towerId: string) => void;
}) {
  if (towers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {towers.map((tower) => {
        const totalItems = tower.floors.reduce((s, f) => s + f.totalItems, 0);
        const installed = tower.floors.reduce(
          (s, f) => s + f.installedItems,
          0
        );
        const pct =
          totalItems === 0 ? 0 : Math.round((installed / totalItems) * 100);
        const active = tower._id === selectedTowerId;

        return (
          <button
            key={tower._id}
            type="button"
            onClick={() => onSelect(tower._id)}
            className={cn(
              "flex min-w-40 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="font-semibold">{tower.name}</span>
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
          </button>
        );
      })}
    </div>
  );
}
