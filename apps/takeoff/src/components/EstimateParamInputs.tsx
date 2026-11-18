import {
  newTableRow,
  type ScalarParam,
  type TableRow,
  type TemplateParam,
  type TemplateValues,
} from "@rlpapp/shared/takeoff/estimateTemplates";
import { Plus, Trash2 } from "lucide-react";
import type { Kit } from "../lib/kits";
import { estimateInput } from "./EstimateCustomRows";
import { Button } from "./ui";

interface ScalarProps {
  param: ScalarParam;
  value: number | string | undefined;
  onChange(v: number | string): void;
  kits: readonly Kit[];
  id?: string;
  /** Accessible name when no <label> points at the field (a table cell). */
  label?: string;
}

/** The field of a number, money or choice parameter (or table cell), with its unit. */
export function ScalarInput({ param: p, value, onChange, kits, id, label }: ScalarProps) {
  if (p.type === "choice") {
    return (
      <select
        id={id}
        aria-label={label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={`${estimateInput} min-w-0 max-w-full`}
      >
        {p.options(kits).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {p.type === "money" && <span className="text-neutral-500">R$</span>}
      <input
        id={id}
        aria-label={label}
        type="number"
        min={0}
        step={p.type === "money" ? "0.01" : (p.step ?? "any")}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`${estimateInput} w-20 text-right`}
      />
      {p.type === "number" && p.unit && <span className="text-neutral-500">{p.unit}</span>}
    </span>
  );
}

interface TableProps {
  param: Extract<TemplateParam, { type: "table" }>;
  rows: readonly TableRow[];
  onChange(rows: TableRow[]): void;
  /** The template's values: they decide which columns show. */
  values: TemplateValues;
  kits: readonly Kit[];
}

/** A table parameter: one row per line of the service (a machine type), a column per value. */
export function TableParam({ param, rows, onChange, values, kits }: TableProps) {
  const columns = param.columns.filter((c) => !c.when || c.when(values));
  const set = (i: number, key: string, v: number | string) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="space-y-1.5">
      <table className="w-full text-[12px]">
        <thead className="text-left text-[11px] text-neutral-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="pb-1 pr-2 font-normal" title={c.hint}>
                {c.label}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // rows have no id: they are only edited in place, added at the end or removed
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className="py-0.5 pr-2">
                  <ScalarInput
                    param={c}
                    value={r[c.key]}
                    onChange={(v) => set(i, c.key, v)}
                    kits={kits}
                    label={`${c.label}, linha ${i + 1}`}
                  />
                </td>
              ))}
              <td className="py-0.5 text-right">
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  disabled={rows.length === 1}
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-300 disabled:opacity-30"
                  title="Remover linha"
                  aria-label={`Remover linha ${i + 1}`}
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button onClick={() => onChange([...rows, newTableRow(param, rows, kits)])}>
        <Plus size={13} /> {param.addLabel}
      </Button>
    </div>
  );
}
