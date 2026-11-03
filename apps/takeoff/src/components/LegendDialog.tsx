import { useEffect, useState } from "react";
import { DEFAULT_GROUP, DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS } from "../lib/types";
import type { Kind } from "../lib/units";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

interface Row {
  text: string;
  kind: Kind;
  on: boolean;
}

const guessKind = (text: string): Kind => {
  if (/\bduto|tubo|tubula|cabo|eletroduto|linha|rede\b/i.test(text)) return "linear";
  if (/isolamento|manta|forro|piso|m²|m2/i.test(text)) return "area";
  return "count";
};

/** Turns the text lines captured from a legend / material list into items. */
export function LegendDialog() {
  const lines = useStore((s) => s.legendCandidates);
  const { setLegendCandidates, addItemsBulk } = useStore.getState();
  const [rows, setRows] = useState<Row[]>([]);
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const project = useStore((s) => s.project);
  const activeItemId = useStore((s) => s.activeItemId);
  const [system, setSystem] = useState<string | null>(null);
  const defaultSystem =
    project.items.find((i) => i.id === activeItemId)?.system ?? project.system ?? "";
  const systems = Array.from(
    new Set(
      [
        project.system,
        ...project.items.map((i) => i.system ?? ""),
        ...DISCIPLINE_SUGGESTIONS,
      ].filter(Boolean),
    ),
  );
  useEffect(() => {
    if (lines) setRows(lines.map((text) => ({ text, kind: guessKind(text), on: true })));
  }, [lines]);
  if (!lines) return null;

  const create = () => {
    const chosen = rows.filter((r) => r.on && r.text.trim());
    addItemsBulk(
      chosen.map((r) => ({
        name: r.text.trim(),
        kind: r.kind,
        group,
        system: system ?? defaultSystem,
      })),
    );
    setLegendCandidates(null);
  };

  return (
    <Dialog
      title="Criar itens a partir do texto"
      onClose={() => setLegendCandidates(null)}
      className="max-h-[80vh] w-[34rem]"
      bodyClassName="flex flex-col p-4"
    >
      <p className="mt-1 text-xs text-neutral-400">
        Cada linha capturada vira um item. Ajuste o texto e o tipo, desmarque o que não é material.
      </p>
      <label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
        Disciplina (aba)
        <input
          list="legend-systems"
          value={system ?? defaultSystem}
          onChange={(e) => setSystem(e.target.value)}
          className="h-7 flex-1 rounded bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
        />
        <datalist id="legend-systems">
          {systems.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
        Grupo da planilha
        <input
          list="legend-groups"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="h-7 flex-1 rounded bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
        />
        <datalist id="legend-groups">
          {GROUP_SUGGESTIONS.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <li key={`${i}-${lines[i]}`} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={r.on}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
              }
            />
            <input
              value={r.text}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
              className="h-7 min-w-0 flex-1 rounded bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
            />
            <select
              value={r.kind}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, kind: e.target.value as Kind } : x)),
                )
              }
              className="h-7 rounded bg-neutral-800 px-1 text-xs ring-1 ring-neutral-700"
            >
              <option value="count">Contagem</option>
              <option value="linear">Linear</option>
              <option value="area">Área</option>
            </select>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[12px] text-neutral-500">
          {rows.filter((r) => r.on).length} de {rows.length} selecionados
        </span>
        <Button onClick={() => setLegendCandidates(null)}>Cancelar</Button>
        <Button variant="primary" onClick={create} disabled={!rows.some((r) => r.on)}>
          Criar itens
        </Button>
      </div>
    </Dialog>
  );
}
