import { type Kit, kitSlugId } from "@rlpapp/shared/takeoff/kits";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { kindForUnit, mergeCatalog, searchCatalog } from "../lib/catalog";
import {
  applyEstimate,
  type Estimate,
  type EstimateRow,
  type EstimateSource,
  estimateLines,
  rowMeasure,
} from "../lib/estimate";
import { kitMode, kitSummary } from "../lib/kits";
import { formatItemQty } from "../lib/quantities";
import { DISCIPLINE_SUGGESTIONS, newId } from "../lib/types";
import { type Kind, qtyUnit, type Unit } from "../lib/units";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

/** A first estimate when none was made on this machine: a 12.000 split, 20 m of line set. */
function starterEstimate(kits: readonly Kit[]): Estimate {
  const rows: EstimateRow[] = [];
  const lineSet = kits.find((k) => k.id === kitSlugId("12.000 Inverter"));
  if (lineSet) rows.push({ id: newId(), source: { type: "kit", kitId: lineSet.id }, perUnit: 20 });
  const equip = kits.find((k) => k.id === "kit-split-12000-equip");
  if (equip) rows.push({ id: newId(), source: { type: "kit", kitId: equip.id }, perUnit: 1 });
  return { units: 1, rows };
}

/** "por máquina" unit of a row: a length for runs and linear materials, pieces otherwise. */
function perUnitLabel(kind: Kind, unit: Unit): string {
  return kind === "count" ? "por unid." : `${qtyUnit(kind, unit)} por unid.`;
}

/**
 * Takeoff by estimate: the budget generated from assumptions per machine (or point) instead of
 * the drawing. The lines are the ones a drawn kit would use, their quantities typed (see
 * lib/estimate); one undo step takes the whole estimate back.
 */
export function EstimateDialog() {
  const open = useStore((s) => s.estimateOpen);
  const kits = useStore((s) => s.catalog.kits);
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const last = useStore((s) => s.lastEstimate);
  const { setEstimateOpen, addEstimate } = useStore.getState();
  const [units, setUnits] = useState(1);
  const [system, setSystem] = useState("");
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [query, setQuery] = useState("");
  const [customKind, setCustomKind] = useState<Kind>("count");

  // each opening starts from the assumptions last used (or a split as an example)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    const start = last ?? starterEstimate(kits);
    setUnits(start.units);
    setSystem(start.system ?? "");
    setRows(start.rows.map((r) => ({ ...r })));
    setQuery("");
  }, [open]);

  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const estimate: Estimate = { units, rows, system: system.trim() || undefined };
  const preview = useMemo(() => {
    const lines = estimateLines({ units, rows }, kits);
    return applyEstimate(project, lines, catalog, entries, system).results;
  }, [units, rows, system, kits, project, catalog, entries]);
  const matches = useMemo(
    () => (query.trim() ? searchCatalog(entries, query, 8) : []),
    [entries, query],
  );
  const disciplines = useMemo(
    () =>
      Array.from(
        new Set([
          ...project.items.map((i) => i.system ?? "").filter(Boolean),
          ...DISCIPLINE_SUGGESTIONS,
        ]),
      ),
    [project.items],
  );
  if (!open) return null;

  const close = () => setEstimateOpen(false);
  const addRow = (source: EstimateSource, perUnit = 1) => {
    setRows((rs) => [...rs, { id: newId(), source, perUnit }]);
    setQuery("");
  };
  const addKit = (kitId: string) => {
    const kit = kits.find((k) => k.id === kitId);
    if (kit) addRow({ type: "kit", kitId }, kitMode(kit) === "linear" ? 20 : 1);
  };
  const update = (id: string, perUnit: number) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, perUnit } : r)));
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const submit = () => {
    if (preview.length === 0) return;
    addEstimate(estimate);
    close();
  };

  const rowTitle = (r: EstimateRow): { name: string; detail: string } => {
    if (r.source.type === "material") {
      return { name: r.source.name, detail: r.source.sku ?? "material" };
    }
    const kitId = r.source.kitId;
    const kit = kits.find((k) => k.id === kitId);
    return kit
      ? { name: kit.name, detail: kitSummary(kit, project.unit) }
      : { name: "Kit removido do catálogo", detail: "não gera itens" };
  };
  const input =
    "h-7 rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none";
  const sortedKits = [...kits].sort((a, b) =>
    kitMode(a) === kitMode(b) ? 0 : kitMode(a) === "linear" ? -1 : 1,
  );

  return (
    <Dialog
      title="Takeoff por estimativa"
      onClose={close}
      onSubmit={submit}
      className="h-[min(44rem,100%)] w-[44rem]"
      bodyClassName="flex flex-col gap-3 overflow-y-auto p-4 text-xs text-neutral-300"
    >
      <p className="text-neutral-400">
        Gere os itens a partir de premissas, sem medir na planta: o que cada máquina (ou ponto)
        leva, vezes quantas são. Os itens entram na lista como se tivessem sido medidos, com a
        quantidade digitada.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-400">Máquinas / pontos</span>
          <input
            type="number"
            min={0}
            step={1}
            value={units}
            autoFocus
            onChange={(e) => setUnits(Math.max(0, Number(e.target.value) || 0))}
            className={`${input} w-24`}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-neutral-400">Disciplina (aba)</span>
          <input
            list="estimate-systems"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="A de cada material (kit ou catálogo)"
            className={input}
          />
          <datalist id="estimate-systems">
            {disciplines.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
      </div>

      <section className="space-y-1.5">
        <h3 className="font-semibold text-neutral-200">Premissas por máquina</h3>
        {rows.length === 0 && (
          <p className="text-neutral-500">Nenhuma premissa. Adicione um kit ou material abaixo.</p>
        )}
        <ul className="space-y-1">
          {rows.map((r) => {
            const { name, detail } = rowTitle(r);
            const kind = rowMeasure(r, kits);
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
                  aria-label={`Quantidade por máquina: ${name}`}
                  onChange={(e) => update(r.id, Math.max(0, Number(e.target.value) || 0))}
                  className={`${input} w-20 text-right`}
                />
                <span className="w-20 shrink-0 text-neutral-500">
                  {perUnitLabel(kind, project.unit)}
                </span>
                <button
                  type="button"
                  aria-label="Remover premissa"
                  title="Remover premissa"
                  onClick={() => remove(r.id)}
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
            className={`${input} max-w-[16rem]`}
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
              placeholder="+ Material do catálogo ou item livre (ex.: Instalação de split)"
              className={`${input} w-full`}
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
            className={input}
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

      <section className="min-h-0 space-y-1.5">
        <h3 className="font-semibold text-neutral-200">
          Itens gerados {units > 0 && `(${units} × premissas)`}
        </h3>
        {preview.length === 0 ? (
          <p className="text-neutral-500">Nada a gerar ainda.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {preview.map(({ item, added, created }) => (
                <tr key={item.id} className="border-b border-neutral-800/70">
                  <td className="py-1 pr-2">
                    <span className="text-neutral-100">{item.name}</span>
                    <span className="ml-2 text-[11px] text-neutral-500">
                      {item.group}
                      {item.system ? ` · ${item.system}` : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right font-mono text-neutral-200">
                    + {formatItemQty(item, added, project.unit)}
                  </td>
                  <td className="w-16 py-1 text-right text-[11px]">
                    {created ? (
                      <span className="text-orange-300">novo</span>
                    ) : (
                      <span className="text-neutral-500" title="Soma ao item que já está na lista">
                        soma
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-neutral-800 pt-3">
        <span className="mr-auto text-[11px] text-neutral-500">
          Os preços vêm do catálogo; ajuste na lista de itens.
        </span>
        <Button onClick={close}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={preview.length === 0}>
          Adicionar {preview.length} {preview.length === 1 ? "item" : "itens"} ao orçamento
        </Button>
      </div>
    </Dialog>
  );
}
