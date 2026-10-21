import { useState } from "react";
import { dist } from "../lib/geom";
import { INPUT_UNITS, type InputUnit, toBaseUnit } from "../lib/units";
import { useStore } from "../store";
import { Button } from "./ui";

export function CalibrateDialog() {
  const calibration = useStore((s) => s.calibration);
  const unit = useStore((s) => s.project.unit);
  const { setCalibration, setPageScale, setTool } = useStore.getState();
  const [value, setValue] = useState("");
  const [inUnit, setInUnit] = useState<InputUnit>(unit === "m" ? "m" : "ft");
  const [all, setAll] = useState(true);
  if (!calibration) return null;

  const pts = dist(calibration.a, calibration.b);
  const apply = () => {
    const n = Number(value.replace(",", "."));
    if (!(n > 0) || pts <= 0) return;
    const real = toBaseUnit(n, inUnit, unit);
    setPageScale(
      { pointsPerUnit: pts / real, unit, label: `calibrated (${n} ${inUnit})` },
      all ? "all" : "current",
    );
    setCalibration(null);
    setTool("select");
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-white">Calibrate scale</h2>
        <p className="mb-3 text-xs text-neutral-400">
          The line you drew is{" "}
          <span className="font-mono text-neutral-200">{pts.toFixed(1)} pt</span> on paper. What is
          its real length?
        </p>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 3.50"
            className="h-9 flex-1 rounded bg-neutral-800 px-2 font-mono text-sm ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
          />
          <select
            value={inUnit}
            onChange={(e) => setInUnit(e.target.value as InputUnit)}
            className="h-9 rounded bg-neutral-800 px-2 text-sm ring-1 ring-neutral-700"
          >
            {INPUT_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Apply to all pages
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setCalibration(null)}>Cancel</Button>
          <Button type="submit" variant="primary">
            Set scale
          </Button>
        </div>
      </form>
    </div>
  );
}
