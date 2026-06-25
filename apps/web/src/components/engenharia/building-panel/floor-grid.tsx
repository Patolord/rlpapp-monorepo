import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FLOOR_STATE_STYLES,
  getFloorState,
  type HierarchyFloor,
} from "@/components/engenharia/building-panel/hierarchy";

export function FloorGrid({
  floors,
  now,
  selectedFloorId,
  onSelectFloor,
}: {
  floors: HierarchyFloor[];
  now: number;
  selectedFloorId: string | null;
  onSelectFloor: (floorId: string) => void;
}) {
  if (floors.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        Esta torre ainda não tem andares.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {floors.map((floor) => {
        const state = getFloorState(floor, now);
        const style = state.overdue
          ? FLOOR_STATE_STYLES.overdue
          : FLOOR_STATE_STYLES[state.level];
        const pct =
          state.total === 0
            ? 0
            : Math.round((state.installed / state.total) * 100);
        const selected = floor._id === selectedFloorId;

        return (
          <button
            key={floor._id}
            type="button"
            onClick={() => onSelectFloor(floor._id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-colors",
              style.cell,
              selected && "ring-2 ring-offset-1 ring-primary"
            )}
          >
            <span className={cn("size-3 shrink-0 rounded-full", style.dot)} />
            <span className="w-28 shrink-0 truncate text-sm font-semibold">
              {floor.label}
            </span>
            <span className="flex-1 text-xs text-muted-foreground">
              {floor.environments.length} ambiente
              {floor.environments.length === 1 ? "" : "s"}
            </span>
            {state.overdue && (
              <AlertTriangle className="size-4 shrink-0 text-red-600" />
            )}
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {state.installed}/{state.total}
            </span>
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
              {pct}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Legenda das cores dos andares (🟩 🟨 🟥 ⬜). */
export function FloorLegend() {
  const entries: { key: keyof typeof FLOOR_STATE_STYLES; label: string }[] = [
    { key: "complete", label: "Concluído" },
    { key: "partial", label: "Em andamento" },
    { key: "overdue", label: "Atrasado" },
    { key: "pending", label: "Não iniciado" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {entries.map((e) => (
        <span key={e.key} className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-2.5 rounded-full",
              FLOOR_STATE_STYLES[e.key].dot
            )}
          />
          {e.label}
        </span>
      ))}
    </div>
  );
}
