import { AirVent, FileSpreadsheet, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { mergeCatalog } from "../lib/catalog";
import { ductBillFor, ductNetworks, ductRunsByNetwork } from "../lib/ductItems";
import {
  DEFAULT_DUCT_SETTINGS,
  type DuctFlange,
  type DuctInner,
  type DuctInsulation,
  type DuctRun,
  type DuctSettings,
  gaugeName,
  LABOR_ROW,
  NORMA_LABELS,
} from "../lib/ducts";
import { exportDuctSheet } from "../lib/files";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";
import { Button } from "./ui";

const input =
  "h-6 rounded bg-neutral-800 px-1 text-right font-mono text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";
const select =
  "h-6 w-full rounded bg-neutral-800 px-0.5 text-[11px] text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/** Short option labels, as the workbook's dropdown codes. */
const INSULATION_SHORT: Record<DuctInsulation, string> = {
  S: "Sem",
  L: "Manta",
  I: "Isopor",
  P: "Placa",
  T: "Pintura",
};
const INNER_SHORT: Record<DuctInner, string> = { S: "Sem", B: "Bidim", F: "Flexiliner" };
const FLANGE_SHORT: Record<DuctFlange, string> = { S: "Sem", P: "Powermatic", C: "Cantoneira" };

/**
 * The duct take-off, one network at a time, laid out like the "Levantamento dutos" sheet: one
 * editable row per measured run (which network it belongs to is chosen here), then the bill of
 * materials with unit prices, labour by weight, totals, parameters and the workbook export.
 */
export function DuctsPanel() {
  const project = useStore((s) => s.project);
  const catalog = useStore((s) => s.catalog);
  const activeItemId = useStore((s) => s.activeItemId);
  const {
    setDuctPrice,
    setDuctSettings,
    updateDuctSpec,
    setSelection,
    setDuctNetwork,
    addDuctNetwork,
    setActiveItem,
  } = useStore.getState();
  const networks = useMemo(() => ductNetworks(project), [project]);
  const byNetwork = useMemo(() => ductRunsByNetwork(project), [project]);
  const [chosen, setChosen] = useState<string | null>(null);
  const network =
    networks.find((n) => n.id === chosen) ??
    networks.find((n) => n.id === activeItemId) ??
    networks[0] ??
    null;
  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const bill = useMemo(
    () =>
      network ? ductBillFor(project, entries, network, byNetwork.get(network.id) ?? []) : null,
    [project, entries, network, byNetwork],
  );
  const [showSettings, setShowSettings] = useState(false);
  const settings: DuctSettings = project.duct ?? DEFAULT_DUCT_SETTINGS;
  const money = (v: number) => formatMoney(v, project.currency);
  const num = (v: string) => Math.max(0, Number(v) || 0);

  if (!network) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-neutral-500">
        <AirVent size={22} className="text-neutral-600" />
        <p>
          Nenhum duto medido. Use a ferramenta <span className="text-neutral-300">Duto (D)</span>:
          clique nos pontos do trecho e informe lado maior × lado menor.
        </p>
        <p>
          Chapa, isolamento, flanges, fitas, suportes e mão de obra são calculados aqui conforme a
          NBR 16401; no orçamento cada rede entra como um único item "Rede de dutos".
        </p>
        <Button onClick={() => addDuctNetwork()}>
          <Plus size={14} /> Criar rede de dutos
        </Button>
      </div>
    );
  }

  const laborRow = bill?.rows.find((r) => r.name === LABOR_ROW);
  const materials = bill?.rows.filter((r) => r.name !== LABOR_ROW) ?? [];
  const runs = bill?.runs ?? [];
  const patchSettings = (p: Partial<DuctSettings>) => setDuctSettings({ ...settings, ...p });
  const patchRun = (r: DuctRun, p: Partial<DuctRun["spec"]>) => {
    if (!r.id) return;
    const spec = { ...r.spec, ...p };
    if (spec.a < spec.b) [spec.a, spec.b] = [spec.b, spec.a];
    updateDuctSpec([r.id], { ...spec, paintRechap: spec.rechapeado && spec.paintRechap });
  };

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        {networks.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              setChosen(n.id);
              setActiveItem(n.id);
            }}
            title={`${n.name}${n.system ? ` · ${n.system}` : ""} · ${byNetwork.get(n.id)?.length ?? 0} trechos`}
            className={
              n.id === network.id
                ? "rounded bg-orange-500/15 px-2 py-0.5 text-orange-300 ring-1 ring-orange-400/60"
                : "rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 ring-1 ring-neutral-700 hover:text-neutral-100"
            }
          >
            {n.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const id = addDuctNetwork();
            setChosen(id);
          }}
          title="Outra rede de dutos (outro item no orçamento)"
          className="rounded px-1.5 py-0.5 text-neutral-400 ring-1 ring-neutral-700 hover:text-neutral-100"
        >
          <Plus size={13} />
        </button>
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
            Trechos medidos · {runs.length}
            {network.system && <span className="normal-case"> · {network.system}</span>}
          </div>
          {runs.length === 0 && (
            <p className="py-2 text-neutral-500">
              Nenhum trecho nesta rede. Meça com a ferramenta Duto (D) ou mova trechos de outra
              rede.
            </p>
          )}
          {runs.length > 0 && (
            <table className="w-full table-fixed">
              <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="pb-0.5 text-left font-medium">
                    {networks.length > 1 ? "Rede" : "Trecho"}
                  </th>
                  <th className="w-[3.2rem] pb-0.5 text-right font-medium" title="Lado maior (cm)">
                    Maior
                  </th>
                  <th className="w-[3.2rem] pb-0.5 text-right font-medium" title="Lado menor (cm)">
                    Menor
                  </th>
                  <th className="w-[3.6rem] pb-0.5 text-right font-medium" title="Comprimento (m)">
                    Compr.
                  </th>
                  <th className="w-[2.2rem] pb-0.5 text-right font-medium" title="Bitola da chapa">
                    #
                  </th>
                  <th
                    className="w-[4.2rem] pb-0.5 pl-1 text-left font-medium"
                    title="Isolamento externo"
                  >
                    Isol.
                  </th>
                  <th
                    className="w-[4.4rem] pb-0.5 pl-1 text-left font-medium"
                    title="Isolamento interno"
                  >
                    Interno
                  </th>
                  <th className="w-[4.8rem] pb-0.5 pl-1 text-left font-medium">Flange</th>
                  <th className="w-[1.4rem] pb-0.5 text-center font-medium" title="Rechapeado">
                    R
                  </th>
                  <th
                    className="w-[1.4rem] pb-0.5 text-center font-medium"
                    title="Pintura no rechapeado"
                  >
                    P
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="text-neutral-200">
                    <td className="truncate py-0.5 pr-1" title={r.tag}>
                      {networks.length > 1 ? (
                        <select
                          value={r.network ?? ""}
                          onChange={(e) => r.id && setDuctNetwork([r.id], e.target.value)}
                          className={select}
                          title={`Rede deste trecho · ${r.tag ?? ""}`}
                        >
                          {networks.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => r.id && setSelection([r.id])}
                          title="Selecionar este trecho no desenho"
                          className="max-w-full truncate text-left hover:text-orange-300"
                        >
                          {r.tag || "trecho"}
                        </button>
                      )}
                    </td>
                    <td className="py-0.5 pl-1">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={r.spec.a}
                        onChange={(e) => patchRun(r, { a: num(e.target.value) })}
                        className={`${input} w-full`}
                      />
                    </td>
                    <td className="py-0.5 pl-1">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={r.spec.b}
                        onChange={(e) => patchRun(r, { b: num(e.target.value) })}
                        className={`${input} w-full`}
                      />
                    </td>
                    <td
                      className="py-0.5 text-right font-mono whitespace-nowrap"
                      title={r.vertical ? `inclui ${r.vertical} m vertical` : undefined}
                    >
                      {r.length.toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono text-neutral-500">
                      {gaugeName(r.spec.a, settings.norma).replace("# ", "")}
                    </td>
                    <td className="py-0.5 pl-1">
                      <select
                        value={r.spec.insulation}
                        onChange={(e) =>
                          patchRun(r, { insulation: e.target.value as DuctInsulation })
                        }
                        className={select}
                      >
                        {(Object.keys(INSULATION_SHORT) as DuctInsulation[]).map((k) => (
                          <option key={k} value={k}>
                            {INSULATION_SHORT[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pl-1">
                      <select
                        value={r.spec.inner}
                        onChange={(e) => patchRun(r, { inner: e.target.value as DuctInner })}
                        className={select}
                      >
                        {(Object.keys(INNER_SHORT) as DuctInner[]).map((k) => (
                          <option key={k} value={k}>
                            {INNER_SHORT[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pl-1">
                      <select
                        value={r.spec.flange}
                        onChange={(e) => patchRun(r, { flange: e.target.value as DuctFlange })}
                        className={select}
                      >
                        {(Object.keys(FLANGE_SHORT) as DuctFlange[]).map((k) => (
                          <option key={k} value={k}>
                            {FLANGE_SHORT[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.spec.rechapeado}
                        onChange={(e) => patchRun(r, { rechapeado: e.target.checked })}
                        title="Rechapeado (# 26)"
                      />
                    </td>
                    <td className="py-0.5 text-center">
                      <input
                        type="checkbox"
                        disabled={!r.spec.rechapeado}
                        checked={r.spec.rechapeado && r.spec.paintRechap}
                        onChange={(e) => patchRun(r, { paintRechap: e.target.checked })}
                        title="Pintura no rechapeado"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
          <span>{network.name}</span>
          <span className="font-mono">
            {money((bill?.totals.material ?? 0) + (bill?.totals.labor ?? 0))}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          No orçamento: este item, 1 cj, com o material e a mão de obra acima.
        </p>
        <Button
          variant="primary"
          className="mt-2 w-full justify-center"
          onClick={() => void exportDuctSheet(network.id)}
          title="Gera a planilha Levantamento Dutos (NBR 16401) desta rede, com trechos e preços preenchidos"
        >
          <FileSpreadsheet size={16} /> Planilha de dutos (.xlsx)
        </Button>
      </div>
    </div>
  );
}
