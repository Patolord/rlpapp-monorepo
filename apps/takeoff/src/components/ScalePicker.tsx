import { useState } from "react";
import { pageScale } from "../lib/quantities";
import { metricScale, presetsFor } from "../lib/units";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

export function ScalePicker({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const page = useStore((s) => s.page);
  const { setPageScale, setTool } = useStore.getState();
  const current = pageScale(project, page);
  const [all, setAll] = useState(true);
  const [custom, setCustom] = useState("");
  const which = all ? "all" : "current";

  return (
    <div className="absolute bottom-8 left-24 z-20 w-72 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-neutral-100">Drawing scale</span>
        <label className="flex items-center gap-1 text-neutral-400">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> all
          pages
        </label>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {presetsFor(project.unit).map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setPageScale(p, which);
              onClose();
            }}
            className={`rounded px-1 py-1 font-mono text-[11px] ring-1 ${
              current?.label === p.label
                ? "bg-orange-500/20 text-orange-200 ring-orange-400"
                : "bg-neutral-800 text-neutral-200 ring-neutral-700 hover:bg-neutral-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {project.unit === "m" && (
        <form
          className="mt-2 flex items-center gap-1 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom);
            if (n > 0) {
              setPageScale(metricScale(n), which);
              onClose();
            }
          }}
        >
          <span className="text-neutral-400">Custom 1:</span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="numeric"
            className="h-7 w-16 rounded bg-neutral-800 px-1.5 font-mono ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
          />
          <Button type="submit">Apply</Button>
        </form>
      )}
      <div className="mt-3 flex items-center justify-between">
        <Button
          onClick={() => {
            setTool("calibrate");
            onClose();
          }}
        >
          Calibrate by measuring <Kbd>K</Kbd>
        </Button>
        {current && (
          <button
            type="button"
            className="text-[11px] text-neutral-500 hover:text-red-300"
            onClick={() => {
              setPageScale(null, which);
              onClose();
            }}
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
