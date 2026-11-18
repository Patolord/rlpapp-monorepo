import {
  ESTIMATE_TEMPLATES,
  type TemplateValues,
  templateValues,
} from "@rlpapp/shared/takeoff/estimateTemplates";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { mergeCatalog } from "../lib/catalog";
import {
  applyEstimate,
  type Estimate,
  type EstimateLine,
  estimateLines,
  type LinePrice,
  lineKey,
  resultValue,
} from "../lib/estimate";
import { DISCIPLINE_SUGGESTIONS } from "../lib/types";
import { formatMoney } from "../lib/units";
import { syncWeightItems } from "../lib/weights";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { EstimateCustomRows, estimateInput } from "./EstimateCustomRows";
import { EstimateParams } from "./EstimateParams";
import { EstimatePreview } from "./EstimatePreview";
import { Button } from "./ui";

const CUSTOM = "custom";
const EMPTY_CUSTOM: Estimate = { units: 1, rows: [] };

/**
 * Takeoff by estimate: a quick calculator per service (split installation, bathroom exhaust…)
 * or free-form assumptions, priced from the catalog, that adds its lines to the budget as if
 * they were measured (typed quantities, see lib/estimate). One undo step takes it all back.
 */
export function EstimateDialog() {
  const open = useStore((s) => s.estimateOpen);
  const kits = useStore((s) => s.catalog.kits);
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const memory = useStore((s) => s.estimateMemory);
  const { setEstimateOpen, addEstimate, rememberEstimate } = useStore.getState();
  const [calc, setCalc] = useState(ESTIMATE_TEMPLATES[0].id);
  const [values, setValues] = useState<Record<string, TemplateValues>>({});
  const [custom, setCustom] = useState<Estimate>(EMPTY_CUSTOM);
  const [system, setSystem] = useState("");
  /** Unit prices typed in the preview, by line key (kept while the dialog is open). */
  const [prices, setPrices] = useState<Record<string, LinePrice>>({});

  // each opening starts where the last one left off
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    const known =
      memory.templateId === CUSTOM || ESTIMATE_TEMPLATES.some((t) => t.id === memory.templateId);
    setCalc(known ? memory.templateId : ESTIMATE_TEMPLATES[0].id);
    setValues(
      Object.fromEntries(
        ESTIMATE_TEMPLATES.map((t) => [t.id, templateValues(t, memory.values[t.id], kits)]),
      ),
    );
    setCustom(memory.custom ?? EMPTY_CUSTOM);
    setSystem(memory.system);
    setPrices({});
  }, [open]);

  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const template = ESTIMATE_TEMPLATES.find((t) => t.id === calc);
  const lines = useMemo((): EstimateLine[] => {
    const raw = template
      ? template.lines(values[template.id] ?? templateValues(template, undefined, kits), kits)
      : estimateLines(custom, kits);
    return raw.map((l) => {
      const typed = prices[lineKey(l)];
      return typed ? { ...l, price: { ...l.price, ...typed } } : l;
    });
  }, [template, values, custom, kits, prices]);
  const results = useMemo(() => {
    const r = applyEstimate(project, lines, catalog, entries, system);
    // lines priced by weight take their R$/kg price as they will on commit
    const synced = new Map(
      syncWeightItems(r.project, catalog.basePrices).items.map((i) => [i.id, i]),
    );
    return r.results.map((x) => ({ ...x, item: synced.get(x.item.id) ?? x.item }));
  }, [project, lines, catalog, entries, system]);
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

  const close = () => {
    rememberEstimate({ templateId: calc, values, custom, system: system.trim() });
    setEstimateOpen(false);
  };
  const submit = () => {
    if (results.length === 0) return;
    addEstimate(lines, system);
    close();
  };
  const total = results.reduce((v, r) => {
    const x = resultValue(r);
    return v + x.material + x.labor;
  }, 0);
  const tabs = [
    ...ESTIMATE_TEMPLATES.map((t) => ({ id: t.id, label: t.name })),
    { id: CUSTOM, label: "Personalizado (kits e materiais)" },
  ];

  return (
    <Dialog
      title="Takeoff por estimativa"
      onClose={close}
      onSubmit={submit}
      className="h-[min(50rem,100%)] w-[54rem]"
      bodyClassName="flex flex-col gap-3 overflow-y-auto p-4 text-xs text-neutral-300"
    >
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Calculadora">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={calc === t.id}
            onClick={() => {
              setCalc(t.id);
              setPrices({});
            }}
            className={clsx(
              "rounded-full px-3 py-1 ring-1",
              calc === t.id
                ? "bg-orange-500/15 text-orange-200 ring-orange-400/70"
                : "text-neutral-300 ring-neutral-700 hover:bg-neutral-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {template ? (
        <EstimateParams
          template={template}
          values={values[template.id] ?? templateValues(template, undefined, kits)}
          onChange={(next) => setValues((vs) => ({ ...vs, [template.id]: next }))}
          kits={kits}
        />
      ) : (
        <EstimateCustomRows
          value={custom}
          onChange={setCustom}
          kits={kits}
          entries={entries}
          unit={project.unit}
        />
      )}

      <label className="flex items-center gap-3">
        <span className="w-[15rem] shrink-0 text-neutral-300">Disciplina (aba)</span>
        <input
          list="estimate-systems"
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder="A de cada material (kit ou catálogo)"
          className={`${estimateInput} min-w-0 flex-1`}
        />
        <datalist id="estimate-systems">
          {disciplines.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>

      <section className="space-y-1.5 border-t border-neutral-800 pt-3">
        <h3 className="font-semibold text-neutral-200">Itens gerados</h3>
        <EstimatePreview
          results={results}
          currency={project.currency}
          unit={project.unit}
          onPrice={(key, field, value) =>
            setPrices((ps) => ({ ...ps, [key]: { ...ps[key], [field]: value } }))
          }
        />
      </section>

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-neutral-800 pt-3">
        <span className="mr-auto text-[11px] text-neutral-500">
          Preços do catálogo, sem BDI; os itens podem ser ajustados depois na lista.
        </span>
        <Button onClick={close}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={results.length === 0}>
          Adicionar {results.length} {results.length === 1 ? "item" : "itens"} ·{" "}
          {formatMoney(total, project.currency)}
        </Button>
      </div>
    </Dialog>
  );
}
