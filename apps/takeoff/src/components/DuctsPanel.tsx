import { AirVent, FileSpreadsheet, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { mergeCatalog } from "../lib/catalog";
import { ductBillFor, ductRunsBySystem } from "../lib/ductItems";
import {
  DEFAULT_DUCT_SETTINGS,
  type DuctSettings,
  FLANGE_LABELS,
  gaugeName,
  INSULATION_LABELS,
  LABOR_ROW,
  NORMA_LABELS,
} from "../lib/ducts";
import { exportDuctSheet } from "../lib/files";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";
import { Button } from "./ui";

const input =
  "h-6 rounded bg-neutral-800 px-1 text-right font-mono text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/**
 * The duct take-off, per discipline: measured sections, the bill of materials with editable
 * unit prices, labour by weight, totals, calculation parameters and the workbook export.
 */
export function DuctsPanel() {
  const project = useStore((s) => s.project);
  const catalog = useStore((s) => s.catalog);
  const { setDuctPrice, setDuctSettings } = useStore.getState();
  const bySystem = useMemo(() => ductRunsBySystem(project), [project]);
  const systems = [...bySystem.keys()];
  const [chosen, setChosen] = useState<string | null>(null);
  const system = chosen !== null && bySystem.has(chosen) ? chosen : (systems[0] ?? null);
  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const bill = useMemo(
    () => (system === null ? null : ductBillFor(project, entries, system)),
    [project, entries, system],
  );
  const [showSettings, setShowSettings] = useState(false);
  const settings: DuctSettings = project.duct ?? DEFAULT_DUCT_SETTINGS;
  const money = (v: number) => formatMoney(v, project.currency);

  if (systems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-neutral-500">
        <AirVent size={22} className="text-neutral-600" />
        <p>
          Nenhum duto medido. Use a ferramenta <span className="text-neutral-300">Duto (D)</span>:
          clique nos pontos do trecho e informe lado maior × lado menor.
        </p>
        <p>
          Chapa, isolamento, flanges, fitas, suportes e mão de obra são calculados aqui conforme a
          NBR 16401; no orçamento entra um único item "Rede de dutos" por disciplina.
        </p>
      </div>
    );
  }

  // sections summary: per spec, number of runs and metres
  const sections = new Map<string, { label: string; n: number; m: number; gauge: string }>();
  for (const r of bill?.runs ?? []) {
    const key = `${r.spec.a}×${r.spec.b}·${r.spec.insulation}${r.spec.inner}${r.spec.flange}${r.spec.rechapeado ? "R" : ""}`;
    const cur = sections.get(key) ?? {
      label: `${r.spec.a}×${r.spec.b} cm · ${INSULATION_LABELS[r.spec.insulation]} · ${FLANGE_LABELS[r.spec.flange]}${r.spec.rechapeado ? " · rechapeado" : ""}`,
      n: 0,
      m: 0,
      gauge: gaugeName(r.spec.a, settings.norma),
    };
    cur.n += 1;
    cur.m += r.length;
    sections.set(key, cur);
  }
  const laborRow = bill?.rows.find((r) => r.name === LABOR_ROW);
  const materials = bill?.rows.filter((r) => r.name !== LABOR_ROW) ?? [];
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const patchSettings = (p: Partial<DuctSettings>) => setDuctSettings({ ...settings, ...p });

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        {systems.map((s) => (
          <button
            key={s || "_"}
            type="button"
            onClick={() => setChosen(s)}
            className={
              s === system
                ? "rounded bg-orange-500/15 px-2 py-0.5 text-orange-300 ring-1 ring-orange-400/60"
                : "rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 ring-1 ring-neutral-700 hover:text-neutral-100"
            }
          >
            {s || "Sem disciplina"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Norma, espessuras, folgas e mão de obra por kg"
          className="ml-auto flex items-center gap-1 text-neutral-400 hover:text-neutral-100"
        >
          <Settings2 size={13} /> Parâmetros
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {showSettings && (
          <div className="grid grid-cols-3 gap-2 border-b border-neutral-800 bg-neutral-800/40 px-2 py-2 text-[11px] text-neutral-400">
            <label className="col-span-3 block">
              <span className="mb-0.5 block">Norma (bitola da chapa pelo lado maior)</span>
              <select
                value={settings.norma}
                onChange={(e) => patchSettings({ norma: Number(e.target.value) as 1 | 2 | 3 })}
                className="h-6 w-full rounded bg-neutral-800 px-1 text-xs ring-1 ring-neutral-700"
              >
                {([1, 2, 3] as const).map((n) => (
                  <option key={n} value={n}>
                    {NORMA_LABELS[n]}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["insulThickness", "Isolamento (mm)"],
                ["flangeSpacing", "Flange a cada (m)"],
                ["rechapThickness", "Rechapeado (mm)"],
                ["insulSlackPct", "Folga isolamento %"],
                ["supportsPct", "Suportes % do peso"],
                ["laborPerKg", "M. obra R$/kg"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-0.5 block">{label}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={settings[key]}
                  onChange={(e) => patchSettings({ [key]: num(e.target.value) })}
                  className={`${input} w-full`}
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-0.5 block">Folga chapa %</span>
              <input
                type="number"
                min={0}
                step="any"
                value={settings.sheetSlackPct ?? ""}
                placeholder="auto"
                title="Vazio = 20 %, ou 15 % acima de 10 000 kg (regra da planilha)"
                onChange={(e) =>
                  patchSettings({
                    sheetSlackPct: e.target.value === "" ? null : num(e.target.value),
                  })
                }
                className={`${input} w-full`}
              />
            </label>
            <p className="col-span-2 self-end text-neutral-500">
              Mão de obra dobra abaixo de 500 kg, como na planilha.
            </p>
          </div>
        )}

        <div className="border-b border-neutral-800 px-2 py-1.5">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
            Trechos medidos · {bill?.runs.length ?? 0}
          </div>
          <table className="w-full table-fixed">
            <tbody>
              {[...sections.values()].map((s) => (
                <tr key={s.label} className="text-neutral-200">
                  <td className="truncate py-0.5 pr-1" title={s.label}>
                    {s.label}
                  </td>
                  <td className="w-12 py-0.5 text-right font-mono text-neutral-500">{s.gauge}</td>
                  <td className="w-10 py-0.5 text-right font-mono text-neutral-500">{s.n}×</td>
                  <td className="w-[4.6rem] py-0.5 text-right font-mono">{s.m.toFixed(2)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-2 py-1.5">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
            Materiais · preço unitário editável
          </div>
          <table className="w-full table-fixed">
            <tbody>
              {materials.map((r) => {
                const p = bill?.price(r) ?? 0;
                return (
                  <tr key={r.name} className="text-neutral-200">
                    <td className="truncate py-0.5 pr-1" title={r.name}>
                      {r.name}
                    </td>
                    <td className="w-[4.8rem] py-0.5 text-right font-mono whitespace-nowrap">
                      {Number.isInteger(r.qty) ? r.qty : r.qty.toFixed(2)} {r.unit}
                    </td>
                    <td className="w-[4.4rem] py-0.5 pl-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={p}
                        onChange={(e) => setDuctPrice(r.name, num(e.target.value))}
                        className={`${input} w-full`}
                        title={`Preço unitário por ${r.unit}`}
                      />
                    </td>
                    <td className="w-[5.6rem] py-0.5 text-right font-mono whitespace-nowrap">
                      {money(r.qty * p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-neutral-800 px-2 py-1.5 text-neutral-300">
        {laborRow && (
          <div className="flex items-center justify-between">
            <span className="text-neutral-400" title="Calculada em bloco, pelo peso total de chapa">
              Mão de obra · {laborRow.qty} kg × {money(laborRow.labor)}/kg
              {laborRow.qty < 500 ? " (abaixo de 500 kg: dobrada)" : ""}
            </span>
            <span className="font-mono">{money(bill?.totals.labor ?? 0)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Material</span>
          <span className="font-mono">{money(bill?.totals.material ?? 0)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-neutral-800 pt-1 font-semibold text-neutral-100">
          <span>Rede de dutos · {system || "sem disciplina"}</span>
          <span className="font-mono">
            {money((bill?.totals.material ?? 0) + (bill?.totals.labor ?? 0))}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          No orçamento: item "Rede de dutos", 1 cj, material e mão de obra acima.
        </p>
        <Button
          variant="primary"
          className="mt-2 w-full justify-center"
          onClick={() => void exportDuctSheet(system ?? "")}
          title="Gera a planilha Levantamento Dutos (NBR 16401) desta disciplina, com trechos e preços preenchidos"
        >
          <FileSpreadsheet size={16} /> Planilha de dutos (.xlsx)
        </Button>
      </div>
    </div>
  );
}
