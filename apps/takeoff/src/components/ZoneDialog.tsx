import { useState } from "react";
import { polygonArea } from "../lib/geom";
import { pageScale } from "../lib/quantities";
import { formatArea } from "../lib/units";
import { useStore } from "../store";
import { Button } from "./ui";

const SUGGESTIONS = [
  "Térreo",
  "Subsolo",
  "1º Pavimento",
  "Pavimento Tipo",
  "Cobertura",
  "Casa de Máquinas",
  "Hall",
  "Escada",
];

/** Names a zone that was just drawn. */
export function ZoneDialog() {
  const pending = useStore((s) => s.pendingZone);
  const project = useStore((s) => s.project);
  const { addZone, setPendingZone, setTool } = useStore.getState();
  const [name, setName] = useState("");
  if (!pending) return null;

  const scale = pageScale(project, pending.page);
  const area = polygonArea(pending.points);
  const areaText = scale
    ? formatArea(area / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
    : `${area.toFixed(0)} pt²`;
  const existing = Array.from(new Set(project.zones.map((z) => z.name)));
  const names = Array.from(new Set([...existing, ...SUGGESTIONS]));

  const submit = () => {
    const n = name.trim() || `Local ${project.zones.length + 1}`;
    addZone(n, pending.page, pending.points);
    setName("");
    setTool("select");
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-neutral-100">Nome do local</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Região de <span className="font-mono text-neutral-200">{areaText}</span>. As medições
          dentro dela serão agrupadas por este local.
        </p>
        <input
          autoFocus
          list="zone-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: Térreo, Apto 101, Sala de Pressurização"
          className="h-9 w-full rounded bg-neutral-800 px-2 text-sm ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
        />
        <datalist id="zone-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPendingZone(null)}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Criar local
          </Button>
        </div>
      </form>
    </div>
  );
}
