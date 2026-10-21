import { ChevronLeft, ChevronRight, Ruler } from "lucide-react";
import { useEffect, useState } from "react";
import { pageScale } from "../lib/quantities";
import { useDoc } from "../lib/session";
import { useStore } from "../store";
import { useViewport } from "../viewport";
import { ScalePicker } from "./ScalePicker";
import { Kbd } from "./ui";

const HINTS: Record<string, React.ReactNode> = {
  select: (
    <>
      Click to select · drag to move · drag empty space to box-select · <Kbd>Del</Kbd> removes
    </>
  ),
  pan: "Drag to pan · wheel to zoom",
  count: "Click to place a count mark",
  linear: (
    <>
      Click points · <Kbd>Enter</Kbd> / double-click / right-click to finish · <Kbd>Backspace</Kbd>{" "}
      undoes a point
    </>
  ),
  area: (
    <>
      Click points · click the first point or press <Kbd>Enter</Kbd> to close
    </>
  ),
  rect: "Drag a rectangle",
  magic: "Click inside an enclosed room to detect its outline",
  calibrate: "Click two points of a known distance",
};

export function StatusBar() {
  const page = useStore((s) => s.page);
  const tool = useStore((s) => s.tool);
  const snap = useStore((s) => s.snap);
  const ortho = useStore((s) => s.ortho);
  const status = useStore((s) => s.status);
  const scale = useStore((s) => pageScale(s.project, s.page));
  const selCount = useStore((s) => s.selection.length);
  const open = useStore((s) => s.scalePickerOpen);
  const numPages = useDoc((s) => s.numPages);
  const { setPage, setScalePickerOpen } = useStore.getState();
  const [zoom, setZoom] = useState(useViewport.getState().zoom);
  useEffect(() => useViewport.subscribe((v) => setZoom(v.zoom)), []);

  return (
    <div className="relative flex h-7 items-center gap-3 border-t border-neutral-800 bg-neutral-900 px-2 text-[11px] text-neutral-400">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-neutral-700 disabled:opacity-30"
          disabled={page <= 0}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-mono text-neutral-200">
          {numPages ? page + 1 : 0} / {numPages}
        </span>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-neutral-700 disabled:opacity-30"
          disabled={page >= numPages - 1}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <span className="font-mono">{(zoom * 100).toFixed(0)}%</span>
      <button
        type="button"
        onClick={() => setScalePickerOpen(!open)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ring-1 ${
          scale
            ? "ring-neutral-700 text-neutral-200 hover:bg-neutral-700"
            : "bg-amber-500/15 text-amber-300 ring-amber-500/50"
        }`}
        title="Page scale"
      >
        <Ruler size={12} />
        {scale ? scale.label : "Set scale"}
      </button>
      <span className={snap ? "text-orange-300" : ""}>snap {snap ? "on" : "off"}</span>
      <span className={ortho ? "text-orange-300" : ""}>ortho {ortho ? "on" : "off"}</span>
      {selCount > 0 && <span className="text-neutral-200">{selCount} selected</span>}
      <span className="ml-auto truncate text-neutral-500">{status ?? HINTS[tool]}</span>
      {open && <ScalePicker onClose={() => setScalePickerOpen(false)} />}
    </div>
  );
}
