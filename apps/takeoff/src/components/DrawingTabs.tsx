import clsx from "clsx";
import { FileText, Plus, X } from "lucide-react";
import { pickAndOpenPdf, switchDrawing } from "../lib/files";
import { mod } from "../lib/platform";
import { useStore } from "../store";

/** One tab per planta (PDF) of the takeoff; markings and locations belong to the chosen one. */
export function DrawingTabs() {
  const drawings = useStore((s) => s.project.drawings);
  const activeId = useStore((s) => s.project.activeDrawingId);
  const measurements = useStore((s) => s.project.measurements);
  const { removeDrawing } = useStore.getState();
  if (drawings.length === 0) return null;
  const marks = (id: string) => measurements.filter((m) => m.drawingId === id).length;

  return (
    <div
      role="tablist"
      aria-label="Plantas do takeoff"
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-neutral-700 bg-neutral-800 px-2 text-xs"
    >
      {drawings.map((d) => {
        const active = d.id === activeId;
        const n = marks(d.id);
        return (
          <div
            key={d.id}
            className={clsx(
              "group flex h-8 max-w-[16rem] shrink-0 items-center gap-1 rounded-t-md border border-b-0 pl-2.5 pr-1",
              active
                ? "border-neutral-700 bg-neutral-900 font-medium text-neutral-100"
                : "border-transparent text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-100",
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
                if (
                  window.confirm(
                    `Remover a planta "${d.name}" do takeoff?${n ? ` ${n} marcações serão apagadas.` : ""}`,
                  )
                ) {
                  removeDrawing(d.id);
                }
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
