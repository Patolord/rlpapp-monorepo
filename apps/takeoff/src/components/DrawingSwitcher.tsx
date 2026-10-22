import { FileText, X } from "lucide-react";
import { pickAndOpenPdf, switchDrawing } from "../lib/files";
import { useStore } from "../store";

/** Which PDF of the project is shown; markings and locations belong to the chosen drawing. */
export function DrawingSwitcher() {
  const drawings = useStore((s) => s.project.drawings);
  const activeId = useStore((s) => s.project.activeDrawingId);
  const { removeDrawing } = useStore.getState();
  const active = drawings.find((d) => d.id === activeId);
  if (drawings.length === 0) return null;
  const marks = (id: string) =>
    useStore.getState().project.measurements.filter((m) => m.drawingId === id).length;
  return (
    <div className="flex items-center gap-1 text-xs">
      <FileText size={15} className="text-neutral-500" />
      <select
        value={activeId ?? ""}
        onChange={(e) => {
          if (e.target.value === "__add__") void pickAndOpenPdf();
          else void switchDrawing(e.target.value);
        }}
        title="Planta em exibição (cada PDF tem suas próprias marcações)"
        className="h-7 max-w-[18rem] truncate rounded bg-neutral-800 px-1.5 text-xs text-neutral-200 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
      >
        {drawings.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({marks(d.id)})
          </option>
        ))}
        <option value="__add__">+ Adicionar PDF…</option>
      </select>
      {active && (
        <button
          type="button"
          title="Remover esta planta do takeoff (apaga suas marcações e locais)"
          onClick={() => {
            const n = marks(active.id);
            if (
              window.confirm(
                `Remover a planta "${active.name}" do takeoff?${n ? ` ${n} marcações serão apagadas.` : ""}`,
              )
            ) {
              removeDrawing(active.id);
            }
          }}
          className="rounded p-1 text-neutral-500 hover:text-red-400"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
