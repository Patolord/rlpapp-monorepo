import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { UnitCell } from "@/components/engenharia/unit-cell";
import type { GridFloor, GridUnit } from "@/components/engenharia/building";

export function BuildingGrid({
  floors,
  units,
  now,
  selectedUnitId,
  onSelectUnit,
  compact = false,
  className,
}: {
  floors: GridFloor[];
  units: GridUnit[];
  now: number;
  selectedUnitId?: string | null;
  onSelectUnit?: (unit: GridUnit) => void;
  compact?: boolean;
  className?: string;
}) {
  const { displayFloors, rowIndex, maxFinal } = useMemo(() => {
    const sorted = floors.slice().sort((a, b) => b.number - a.number);
    const idx = new Map<number, number>();
    sorted.forEach((f, i) => idx.set(f.number, i));
    const max = units.reduce((m, u) => Math.max(m, u.final), 1);
    return { displayFloors: sorted, rowIndex: idx, maxFinal: max };
  }, [floors, units]);

  function placement(unit: GridUnit): { rowStart: number; span: number } {
    const covered: number[] = [];
    for (let s = 0; s < Math.max(1, unit.floorSpan); s++) {
      const fn = unit.floor + s;
      const r = rowIndex.get(fn);
      if (r !== undefined) covered.push(r);
    }
    if (covered.length === 0) {
      const r = rowIndex.get(unit.floor) ?? 0;
      return { rowStart: r + 2, span: 1 };
    }
    return { rowStart: Math.min(...covered) + 2, span: covered.length };
  }

  if (displayFloors.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Esta obra ainda não tem andares.
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div
        className="grid min-w-fit gap-1.5"
        style={{
          gridTemplateColumns: `minmax(3.5rem, auto) repeat(${maxFinal}, minmax(6.5rem, 1fr))`,
          gridTemplateRows: `auto repeat(${displayFloors.length}, minmax(4.5rem, auto))`,
        }}
      >
        {/* Cabeçalho de colunas (Finais) */}
        <div
          className="flex items-center justify-center text-xs font-medium text-muted-foreground"
          style={{ gridColumn: 1, gridRow: 1 }}
        >
          Andar
        </div>
        {Array.from({ length: maxFinal }).map((_, c) => (
          <div
            key={`h-${c}`}
            className="flex items-center justify-center text-xs font-medium text-muted-foreground"
            style={{ gridColumn: c + 2, gridRow: 1 }}
          >
            Final {c + 1}
          </div>
        ))}

        {/* Rótulos dos andares */}
        {displayFloors.map((floor, i) => (
          <div
            key={`f-${floor.number}`}
            className="flex items-center justify-end pr-2 text-sm font-semibold text-muted-foreground"
            style={{ gridColumn: 1, gridRow: i + 2 }}
          >
            {floor.label}
          </div>
        ))}

        {/* Apartamentos */}
        {units.map((unit) => {
          const { rowStart, span } = placement(unit);
          return (
            <div
              key={unit._id}
              style={{
                gridColumn: unit.final + 1,
                gridRow: `${rowStart} / span ${span}`,
              }}
            >
              <UnitCell
                unit={unit}
                now={now}
                compact={compact}
                selected={selectedUnitId === unit._id}
                onSelect={onSelectUnit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
