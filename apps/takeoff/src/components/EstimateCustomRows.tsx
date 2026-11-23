import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { type CatalogEntry, kindForUnit, searchCatalog } from "../lib/catalog";
import { type Estimate, type EstimateSource, rowMeasure } from "../lib/estimate";
import { type Kit, kitMode, kitSummary } from "../lib/kits";
import { newId } from "../lib/types";
import { type Kind, qtyUnit, type Unit } from "../lib/units";
import { Button } from "./ui";

export const estimateInput =
  "h-7 rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none";

/** "por máquina" unit of a row: a length for runs and linear materials, pieces otherwise. */
const perUnitLabel = (kind: Kind, unit: Unit): string =>
  kind === "count" ? "por unid." : `${qtyUnit(kind, unit)} por unid.`;

interface Props {
  value: Estimate;
  onChange(next: Estimate): void;
  kits: readonly Kit[];
  entries: readonly CatalogEntry[];
  unit: Unit;
}

/**
 * The free-form calculator: units times a list of assumptions, each a kit (run length or sets
 * per unit) or a single material (catalog or typed).
 */
export function EstimateCustomRows({ value, onChange, kits, entries, unit }: Props) {
  const [query, setQuery] = useState("");
  const [customKind, setCustomKind] = useState<Kind>("count");
  const matches = useMemo(
    () => (query.trim() ? searchCatalog(entries, query, 8) : []),
    [entries, query],
  );
  const rows = value.rows;
  const setRows = (next: Estimate["rows"]) => onChange({ ...value, rows: next });
  const addRow = (source: EstimateSource, perUnit = 1) => {
    setRows([...rows, { id: newId(), source, perUnit }]);
    setQuery("");
  };
  const addKit = (kitId: string) => {
    const kit = kits.find((k) => k.id === kitId);
    if (kit) addRow({ type: "kit", kitId }, kitMode(kit) === "linear" ? 20 : 1);
  };
  const rowTitle = (source: EstimateSource): { name: string; detail: string } => {
    if (source.type === "material") return { name: source.name, detail: source.sku ?? "material" };
    const kit = kits.find((k) => k.id === source.kitId);
    return kit
      ? { name: kit.name, detail: kitSummary(kit, unit) }
      : { name: "Kit removido do catálogo", detail: "não gera itens" };
  };
  const sortedKits = [...kits].sort((a, b) =>
    kitMode(a) === kitMode(b) ? 0 : kitMode(a) === "linear" ? -1 : 1,
  );

  return (
    <section className="space-y-1.5">
      <label className="flex items-center gap-2">
        <span className="w-48 text-neutral-400">Unidades (máquinas, pontos)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={value.units}
          onChange={(e) => onChange({ ...value, units: Math.max(0, Number(e.target.value) || 0) })}
          className={`${estimateInput} w-24 text-right`}
        />
      </label>
      <h3 className="pt-1 font-semibold text-neutral-200">Premissas por unidade</h3>
      {rows.length === 0 && (
        <p className="text-neutral-500">Nenhuma premissa. Adicione um kit ou material abaixo.</p>
      )}
      <ul className="space-y-1">
        {rows.map((r) => {
          const { name, detail } = rowTitle(r.source);
          return (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-neutral-100">{name}</div>
                <div className="truncate text-[11px] text-neutral-500" title={detail}>
                  {detail}
                </div>
              </div>
              <input
                type="number"
                min={0}
                step="any"
                value={r.perUnit}
                aria-label={`Quantidade por unidade: ${name}`}
                onChange={(e) =>
                  setRows(
                    rows.map((x) =>
                      x.id === r.id
                        ? { ...x, perUnit: Math.max(0, Number(e.target.value) || 0) }
                        : x,
                    ),
                  )
                }
                className={`${estimateInput} w-20 text-right`}
              />
              <span className="w-20 shrink-0 text-neutral-500">
                {perUnitLabel(rowMeasure(r, kits), unit)}
              </span>
              <button
                type="button"
                aria-label="Remover premissa"
                title="Remover premissa"
                onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                className="rounded p-1 text-neutral-500 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <select
          value=""
          onChange={(e) => e.target.value && addKit(e.target.value)}
          className={`${estimateInput} max-w-[16rem]`}
          aria-label="Adicionar kit"
        >
          <option value="">+ Kit…</option>
          {sortedKits.map((k) => (
            <option key={k.id} value={k.id}>
              {kitMode(k) === "linear" ? "Trecho · " : "Clique · "}
              {k.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter adds the typed material instead of submitting the dialog
              e.preventDefault();
              const name = query.trim();
              if (name) addRow({ type: "material", name, kind: customKind });
            }}
            placeholder="+ Material do catálogo ou item livre"
            className={`${estimateInput} w-full`}
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-8 z-10 max-h-56 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 shadow-xl">
              {matches.map((m) => (
                <li key={`${m.source}:${m.name}`}>
                  <button
                    type="button"
                    onClick={() =>
                      addRow({
                        type: "material",
                        name: m.name,
                        kind: kindForUnit(m.unit),
                        sku: m.sku,
                        group: m.group,
                      })
                    }
                    className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-neutral-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-neutral-100">{m.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-500">
                      {m.group} · {m.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select
          value={customKind}
          onChange={(e) => setCustomKind(e.target.value as Kind)}
          title="Unidade de um item livre (fora do catálogo)"
          className={estimateInput}
        >
          <option value="count">un</option>
          <option value="linear">m</option>
          <option value="area">m²</option>
        </select>
        <Button
          disabled={!query.trim()}
          onClick={() => addRow({ type: "material", name: query.trim(), kind: customKind })}
          title="Adicionar o item digitado (Enter)"
        >
          <Plus size={14} />
        </Button>
      </div>
    </section>
  );
}
