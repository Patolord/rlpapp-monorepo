import { ChevronLeft, ChevronRight } from "lucide-react";
import { mod } from "../lib/platform";
import { useStore } from "../store";

/** Edge of the side panel: drag to resize it, click the chevron to collapse or expand it. */
export function PanelDivider() {
  const open = useStore((s) => s.sidebarOpen);
  const { setSidebarOpen, setSidebarWidth } = useStore.getState();

  const startResize = (e: React.PointerEvent) => {
    if (!open || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = useStore.getState().sidebarWidth;
    const move = (ev: PointerEvent) => setSidebarWidth(startW + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      onPointerDown={startResize}
      className={
        open
          ? "relative w-1.5 shrink-0 cursor-col-resize bg-neutral-800 hover:bg-orange-400/50"
          : "relative w-1.5 shrink-0 bg-neutral-800"
      }
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setSidebarOpen(!open)}
        title={open ? `Recolher o painel (${mod("B")})` : `Mostrar o painel (${mod("B")})`}
        aria-label={open ? "Recolher o painel" : "Mostrar o painel"}
        className="absolute left-1/2 top-2 z-10 flex h-8 w-5 -translate-x-1/2 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-400 shadow hover:text-neutral-100"
      >
        {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
}
