import clsx from "clsx";
import { FileText, Plus, X } from "lucide-react";
import { useState } from "react";
import { confirmDialog } from "../lib/dialogs";
import { pickAndOpenPdf, switchDrawing } from "../lib/files";
import { mod } from "../lib/platform";
import { dropDoc } from "../lib/session";
import { useStore } from "../store";

/** Where a dragged tab would land: before or after the tab under the pointer. */
interface DropSpot {
  id: string;
  side: "before" | "after";
}

/**
 * One tab per planta (PDF) of the takeoff; markings and locations belong to the chosen one.
 * Tabs can be dragged to reorder the plantas (the order is saved with the takeoff).
 */
export function DrawingTabs() {
  const drawings = useStore((s) => s.project.drawings);
  const activeId = useStore((s) => s.project.activeDrawingId);
  const measurements = useStore((s) => s.project.measurements);
  const { removeDrawing, moveDrawing } = useStore.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropSpot | null>(null);
  if (drawings.length === 0) return null;
  const marks = (id: string) => measurements.filter((m) => m.drawingId === id).length;

  const spotFor = (e: React.DragEvent<HTMLDivElement>, id: string): DropSpot => {
    const r = e.currentTarget.getBoundingClientRect();
    return { id, side: e.clientX < r.left + r.width / 2 ? "before" : "after" };
  };
  const finishDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const dropAt = (spot: DropSpot) => {
    if (!dragId || spot.id === dragId) return;
    const ids = drawings.map((d) => d.id);
    const i = ids.indexOf(spot.id);
    const beforeId = spot.side === "before" ? spot.id : (ids[i + 1] ?? null);
    moveDrawing(dragId, beforeId);
  };

  return (
    <div
      role="tablist"
      aria-label="Plantas do takeoff"
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-neutral-700 bg-neutral-800 px-2 text-xs"
    >
      {drawings.map((d) => {
        const active = d.id === activeId;
        const n = marks(d.id);
        const over = drop?.id === d.id && dragId !== d.id ? drop.side : null;
        return (
          <div
            key={d.id}
            draggable={drawings.length > 1}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", d.id);
              setDragId(d.id);
            }}
            onDragEnd={finishDrag}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const spot = spotFor(e, d.id);
              if (drop?.id !== spot.id || drop.side !== spot.side) setDrop(spot);
            }}
            onDragLeave={() => {
              if (drop?.id === d.id) setDrop(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dropAt(spotFor(e, d.id));
              finishDrag();
            }}
            title={drawings.length > 1 ? "Arraste para reordenar as plantas" : undefined}
            className={clsx(
              "group relative flex h-8 max-w-[16rem] shrink-0 items-center gap-1 rounded-t-md border border-b-0 pl-2.5 pr-1",
              active
                ? "border-neutral-700 bg-neutral-900 font-medium text-neutral-100"
                : "border-transparent text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-100",
              dragId === d.id && "opacity-40",
              // insertion marker on the side the tab would land
              over === "before" && "shadow-[-2px_0_0_0_#fb923c]",
              over === "after" && "shadow-[2px_0_0_0_#fb923c]",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={`${d.name} · ${n} ${n === 1 ? "marcação" : "marcações"}`}
              onClick={() => {
                if (!active) void switchDrawing(d.id);
              }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <FileText size={14} className={active ? "text-orange-400" : "text-neutral-500"} />
              <span className="truncate">{d.name}</span>
              <span className="font-mono text-[11px] text-neutral-500">{n}</span>
            </button>
            <button
              type="button"
              aria-label={`Remover a planta ${d.name}`}
              title="Remover esta planta do takeoff (apaga suas marcações e locais)"
              onClick={(e) => {
                e.stopPropagation();
                void confirmDialog(
                  `Remover a planta "${d.name}" do takeoff?${n ? ` ${n} marcações serão apagadas.` : ""}`,
                ).then((ok) => {
                  if (ok) {
                    removeDrawing(d.id);
                    if (d.path) dropDoc(d.path);
                  }
                });
              }}
              className={clsx(
                "rounded p-0.5 text-neutral-500 hover:text-red-400 focus:opacity-100 group-hover:opacity-100",
                active ? "opacity-70" : "opacity-0",
              )}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => void pickAndOpenPdf()}
        title={`Adicionar planta (${mod("O")})`}
        className="mb-1 ml-1 flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
      >
        <Plus size={14} /> planta
      </button>
    </div>
  );
}
