import clsx from "clsx";
import { FileText, FileUp, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { confirmDialog } from "../lib/dialogs";
import { pickAndOpenPdf, replaceDrawingPdf, switchDrawing } from "../lib/files";
import { mod } from "../lib/platform";
import { dropDoc } from "../lib/session";
import { useStore } from "../store";

/** Where a dragged tab would land: before or after the tab under the pointer. */
interface DropSpot {
  id: string;
  side: "before" | "after";
}

/** Pixels the pointer must travel before a press on a tab becomes a drag (a click otherwise). */
const DRAG_THRESHOLD = 5;

/**
 * One tab per planta (PDF) of the takeoff; markings and locations belong to the chosen one.
 * Tabs can be dragged to reorder the plantas (the order is saved with the takeoff). Dragging
 * uses pointer events, not HTML5 drag and drop: Tauri's window drop handler (dragDropEnabled,
 * which opens PDFs dropped on the window) swallows HTML5 drag events inside the webview.
 */
export function DrawingTabs() {
  const drawings = useStore((s) => s.project.drawings);
  const activeId = useStore((s) => s.project.activeDrawingId);
  const measurements = useStore((s) => s.project.measurements);
  const { removeDrawing, moveDrawing } = useStore.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropSpot | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Press in progress: which tab, where it started, and whether it turned into a drag. */
  const press = useRef<{ id: string; x: number; dragging: boolean } | null>(null);
  if (drawings.length === 0) return null;
  const marks = (id: string) => measurements.filter((m) => m.drawingId === id).length;

  /** Tab under the pointer and the side of it the pointer is on. */
  const spotAt = (clientX: number): DropSpot | null => {
    const tabs = listRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [];
    for (const el of tabs) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) {
        return {
          id: el.dataset.tabId ?? "",
          side: clientX < r.left + r.width / 2 ? "before" : "after",
        };
      }
    }
    // past the last tab: append
    const last = tabs[tabs.length - 1];
    if (last && clientX > last.getBoundingClientRect().right) {
      return { id: last.dataset.tabId ?? "", side: "after" };
    }
    return null;
  };
  const dropAt = (from: string, spot: DropSpot) => {
    if (spot.id === from) return;
    const ids = drawings.map((d) => d.id);
    const i = ids.indexOf(spot.id);
    const beforeId = spot.side === "before" ? spot.id : (ids[i + 1] ?? null);
    moveDrawing(from, beforeId);
  };

  // The whole tab is the press target: a release without movement switches drawing, a press
  // that moves past the threshold drags the tab.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-no-drag]")) return;
    press.current = { id, x: e.clientX, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging) {
      if (Math.abs(e.clientX - p.x) < DRAG_THRESHOLD) return;
      p.dragging = true;
      setDragId(p.id);
    }
    const spot = spotAt(e.clientX);
    if (spot?.id !== drop?.id || spot?.side !== drop?.side) setDrop(spot);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.dragging) {
      const spot = spotAt(e.clientX);
      if (spot) dropAt(p.id, spot);
    } else if (p.id !== activeId) {
      void switchDrawing(p.id);
    }
    setDragId(null);
    setDrop(null);
  };
  const onPointerCancel = () => {
    press.current = null;
    setDragId(null);
    setDrop(null);
  };

  return (
    <div
      ref={listRef}
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
            data-tab-id={d.id}
            onPointerDown={(e) => onPointerDown(e, d.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            title={drawings.length > 1 ? "Arraste para reordenar as plantas" : undefined}
            className={clsx(
              "group relative flex h-8 max-w-[16rem] shrink-0 touch-none select-none items-center gap-1 rounded-t-md border border-b-0 pl-2.5 pr-1",
              active
                ? "border-neutral-700 bg-neutral-900 font-medium text-neutral-100"
                : "border-transparent text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-100",
              dragId === d.id && "cursor-grabbing opacity-40",
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
              onClick={(e) => {
                // mouse presses are handled on the tab (pointer up); this covers the keyboard
                if (e.detail === 0 && !active) void switchDrawing(d.id);
              }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <FileText size={14} className={active ? "text-orange-400" : "text-neutral-500"} />
              <span className="truncate">{d.name}</span>
              <span className="font-mono text-[11px] text-neutral-500">{n}</span>
            </button>
            <button
              type="button"
              data-no-drag
              aria-label={`Substituir a planta ${d.name} por nova revisão`}
              title={`Substituir por nova revisão… (mantém as marcações${d.revisions?.length ? `; ${d.revisions.length} revisão(ões) anterior(es)` : ""})`}
              onClick={(e) => {
                e.stopPropagation();
                void replaceDrawingPdf(d.id);
              }}
              className={clsx(
                "rounded p-0.5 text-neutral-500 hover:text-orange-300 focus:opacity-100 group-hover:opacity-100",
                active ? "opacity-70" : "opacity-0",
              )}
            >
              <FileUp size={13} />
            </button>
            <button
              type="button"
              data-no-drag
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
        title={`Adicionar plantas (${mod("O")})`}
        className="mb-1 ml-1 flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
      >
        <Plus size={14} /> planta
      </button>
    </div>
  );
}
