import { AirVent, FileSpreadsheet, Plus, Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { exportVrfSheet } from "../lib/files";
import { formatMoney } from "../lib/units";
import {
  DEFAULT_VRF_SETTINGS,
  DIAMETERS,
  type Diameter,
  formatHp,
  LABOR_ROW,
  ROLE_SHORT,
  type SizedRun,
  type VrfRole,
  type VrfSettings,
} from "../lib/vrf";
import { vrfBillFor, vrfPricingOf, vrfRunsBySystem, vrfSystems } from "../lib/vrfItems";
import { useStore } from "../store";
import { Button } from "./ui";
import { VrfSchematic } from "./VrfSchematic";

const input =
  "h-6 rounded bg-neutral-800 px-1 text-right font-mono text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";
const select =
  "h-6 w-full rounded bg-neutral-800 px-0.5 text-[11px] text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/**
 * The VRF take-off, one system at a time, laid out like the workbook's Cálculos block: brand,
 * condenser HP and how many identical systems; one editable row per measured run (role, HP,
 * length, elbows, derived gas/liquid pair); then Y-kits, the bill with unit prices, totals,
 * parameters and the workbook export.
 */
export function VrfPanel() {
  const project = useStore((s) => s.project);
  const catalog = useStore((s) => s.catalog);
  const activeItemId = useStore((s) => s.activeItemId);
  const {
    setVrfPrice,
    setVrfSettings,
    updateVrfSpec,
    setSelection,
    setVrfSystem,
    addVrfSystem,
    setActiveItem,
    updateVrfSystem,
    updateItem,
    setVrfBrandsEditorOpen,
  } = useStore.getState();
  const systems = useMemo(() => vrfSystems(project), [project]);
  const bySystem = useMemo(() => vrfRunsBySystem(project), [project]);
  const [chosen, setChosen] = useState<string | null>(null);
  // the item made active elsewhere (a badge in Itens, a new system) takes over the panel
  useEffect(() => {
    if (systems.some((n) => n.id === activeItemId)) setChosen(null);
  }, [activeItemId, systems]);
  const system =
    systems.find((n) => n.id === chosen) ??
    systems.find((n) => n.id === activeItemId) ??
    systems[0] ??
    null;
  const pricing = useMemo(() => vrfPricingOf(catalog), [catalog]);
  const bill = useMemo(
    () =>
      system
        ? vrfBillFor(project, pricing, catalog.vrfBrands, system, bySystem.get(system.id) ?? [])
        : null,
    [project, pricing, catalog.vrfBrands, system, bySystem],
  );
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"table" | "schematic">("table");
  const settings: VrfSettings = project.vrfSettings ?? DEFAULT_VRF_SETTINGS;
  const money = (v: number) => formatMoney(v, project.currency);
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

  if (!system) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-neutral-500">
        <AirVent size={22} className="text-neutral-600" />
        <p>
          Nenhum trecho VRF medido. Use a ferramenta{" "}
          <span className="text-neutral-300">VRF (Y)</span>: clique nos pontos do trecho e informe
          se é saída da condensadora, trecho intermediário ou ramal de evaporadora, com a
          capacidade.
        </p>
        <p>
          As bitolas vêm das tabelas da marca; cobre, joelhos, isolamento, Y-kits, cabos, suportes e
          mão de obra são calculados aqui. No orçamento cada sistema entra como um único item
          "Sistema VRF".
        </p>
        <div className="flex gap-2">
          <Button onClick={() => addVrfSystem()}>
            <Plus size={14} /> Criar sistema VRF
          </Button>
          <Button onClick={() => setVrfBrandsEditorOpen(true)}>
            <SlidersHorizontal size={14} /> Regras das marcas
          </Button>
        </div>
      </div>
    );
  }

  const laborRow = bill?.rows.find((r) => r.name === LABOR_ROW);
  const materials = bill?.rows.filter((r) => r.name !== LABOR_ROW) ?? [];
  const runs = bill?.sized ?? [];
  const brand = bill?.brand;
  const patchSettings = (p: Partial<VrfSettings>) => setVrfSettings({ ...settings, ...p });
  const patchRun = (r: SizedRun, p: Partial<SizedRun["spec"]>) => {
    if (!r.id) return;
    updateVrfSpec([r.id], { ...r.spec, ...p });
  };
  const count = system.manualQty ?? 1;
  const perSystem = (bill?.totals.material ?? 0) + (bill?.totals.labor ?? 0);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        {systems.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              setChosen(n.id);
              setActiveItem(n.id);
            }}
            title={`${n.name}${n.vrf ? ` · ${formatHp(n.vrf.hp)}` : ""} · ${bySystem.get(n.id)?.length ?? 0} trechos`}
            className={
              n.id === system.id
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
            const id = addVrfSystem();
            setChosen(id);
          }}
          title="Outro sistema VRF (outro item no orçamento)"
          className="rounded px-1.5 py-0.5 text-neutral-400 ring-1 ring-neutral-700 hover:text-neutral-100"
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Folga, joelhos, isolamento e mão de obra por evaporadora"
          className="ml-auto flex items-center gap-1 text-neutral-400 hover:text-neutral-100"
        >
          <Settings2 size={13} /> Parâmetros
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {showSettings && (
          <div className="grid grid-cols-4 gap-2 border-b border-neutral-800 bg-neutral-800/40 px-2 py-2 text-[11px] text-neutral-400">
            <label className="block">
              <span className="mb-0.5 block">Folga %</span>
              <input
                type="number"
                min={0}
                step="any"
                value={settings.slackPct}
                onChange={(e) => patchSettings({ slackPct: num(e.target.value) })}
                className={`${input} w-full`}
                title="Acrescida aos comprimentos e aos joelhos (planilha: 10 %)"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block">Joelhos a partir de</span>
              <select
                value={settings.elbowsFrom}
                onChange={(e) => patchSettings({ elbowsFrom: e.target.value as Diameter })}
                className={select}
                title="Tubos mais finos são curvados na obra, sem joelho"
              >
                {DIAMETERS.map((d) => (
                  <option key={d} value={d}>
                    {d}"
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block">Isolamento (mm)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={settings.insulationMm}
                onChange={(e) => patchSettings({ insulationMm: num(e.target.value) })}
                className={`${input} w-full`}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block">M. obra / evaporadora</span>
              <input
                type="number"
                min={0}
                step="any"
                value={settings.laborPerEvap}
                onChange={(e) => patchSettings({ laborPerEvap: num(e.target.value) })}
                className={`${input} w-full`}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-[1fr_6rem_5rem] items-end gap-2 border-b border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-400">
          <label className="block">
            <span className="mb-0.5 flex items-center gap-1">
              Marca
              <button
                type="button"
                onClick={() => setVrfBrandsEditorOpen(true)}
                className="ml-auto flex items-center gap-1 text-neutral-500 hover:text-neutral-100"
                title="Tabelas de bitola por HP e modelos de Y-kit de cada marca"
              >
                <SlidersHorizontal size={11} /> regras
              </button>
            </span>
            <select
              value={brand?.id ?? ""}
              onChange={(e) => updateVrfSystem(system.id, { brand: e.target.value })}
              className={select}
            >
              {catalog.vrfBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block">Condensadora (HP)</span>
            <input
              type="number"
              min={0}
              step="any"
              value={system.vrf?.hp ?? ""}
              onChange={(e) => updateVrfSystem(system.id, { hp: num(e.target.value) })}
              className={`${input} w-full`}
              title="Capacidade total: dimensiona a saída da condensadora e o primeiro Y-kit"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block">Sistemas iguais</span>
            <input
              type="number"
              min={1}
              step={1}
              value={count}
              onChange={(e) => updateVrfSystem(system.id, { count: Number(e.target.value) || 1 })}
              className={`${input} w-full`}
              title="Quantidade do item no orçamento: sistemas idênticos a este (ex.: 78 apartamentos)"
            />
          </label>
        </div>

        <div className="border-b border-neutral-800 px-2 py-1.5">
          <div className="mb-1 flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
            <span>
              Trechos medidos · {runs.length}
              {bill && (
                <span className="normal-case">
                  {" "}
                  · {bill.summary.evaporators}{" "}
                  {bill.summary.evaporators === 1 ? "evaporadora" : "evaporadoras"} ·{" "}
                  {bill.summary.lineLength.toFixed(1)} m de linha
                </span>
              )}
            </span>
            {runs.length > 0 && (
              <span className="ml-auto flex gap-px normal-case tracking-normal">
                {(
                  [
                    ["table", "Tabela", "Um trecho por linha, editável"],
                    ["schematic", "Esquema", "Condensadora, Y-kits e evaporadoras como no desenho"],
                  ] as const
                ).map(([v, label, title]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    title={title}
                    aria-pressed={view === v}
                    className={
                      view === v
                        ? "rounded bg-orange-500/15 px-1.5 py-px text-orange-300 ring-1 ring-orange-400/60"
                        : "rounded px-1.5 py-px text-neutral-400 hover:text-neutral-100"
                    }
                  >
                    {label}
                  </button>
                ))}
              </span>
            )}
          </div>
          {runs.length > 0 && view === "schematic" && (
            <VrfSchematic
              system={system}
              runs={runs}
              brand={brand}
              systemHp={system.vrf?.hp ?? 0}
            />
          )}
          {runs.length === 0 && (
            <p className="py-2 text-neutral-500">
              Nenhum trecho neste sistema. Meça com a ferramenta VRF (Y) ou mova trechos de outro
              sistema.
            </p>
          )}
          {runs.length > 0 && view === "table" && (
            <table className="w-full table-fixed">
              <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="pb-0.5 text-left font-medium">
                    {systems.length > 1 ? "Sistema" : "Trecho"}
                  </th>
                  <th
                    className="w-[4.6rem] pb-0.5 pl-1 text-left font-medium"
                    title="Tipo do trecho"
                  >
                    Tipo
                  </th>
                  <th
                    className="w-[3.4rem] pb-0.5 text-right font-medium"
                    title="Capacidade que dimensiona o trecho (HP)"
                  >
                    HP
                  </th>
                  <th className="w-[3.6rem] pb-0.5 text-right font-medium" title="Comprimento (m)">
                    Compr.
                  </th>
                  <th className="w-[3rem] pb-0.5 text-right font-medium" title="Curvas (joelhos)">
                    Curv.
                  </th>
                  <th className="w-[3rem] pb-0.5 text-right font-medium" title="Bitola do gás">
                    Gás
                  </th>
                  <th className="w-[3rem] pb-0.5 text-right font-medium" title="Bitola do líquido">
                    Líq.
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="text-neutral-200">
                    <td className="truncate py-0.5 pr-1" title={r.tag}>
                      {systems.length > 1 ? (
                        <select
                          value={r.system ?? ""}
                          onChange={(e) => r.id && setVrfSystem([r.id], e.target.value)}
                          className={select}
                          title={`Sistema deste trecho · ${r.tag ?? ""}`}
                        >
                          {systems.map((n) => (
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
                      <select
                        value={r.spec.role}
                        onChange={(e) => patchRun(r, { role: e.target.value as VrfRole })}
                        className={select}
                      >
                        {(Object.keys(ROLE_SHORT) as VrfRole[]).map((k) => (
                          <option key={k} value={k}>
                            {ROLE_SHORT[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pl-1">
                      {r.derivedHp ? (
                        <span
                          className="block h-6 w-full rounded px-1 text-right font-mono leading-6 text-neutral-300 ring-1 ring-transparent"
                          title="Soma das evaporadoras a jusante, lida do esquema (trechos ligados no desenho)"
                        >
                          {r.hp}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          disabled={r.spec.role === "main"}
                          value={r.spec.role === "main" ? r.hp : r.spec.hp || ""}
                          placeholder={r.spec.role === "trunk" ? "menor" : "0"}
                          onChange={(e) => patchRun(r, { hp: num(e.target.value) })}
                          className={`${input} w-full disabled:opacity-60`}
                          title={
                            r.spec.role === "main"
                              ? "Saída da condensadora: usa a capacidade do sistema"
                              : r.spec.role === "trunk"
                                ? "Soma das evaporadoras a jusante (digitada: o trecho não está ligado no esquema)"
                                : "Capacidade da evaporadora"
                          }
                        />
                      )}
                    </td>
                    <td
                      className="py-0.5 text-right font-mono whitespace-nowrap"
                      title={r.vertical ? `inclui ${r.vertical} m vertical` : undefined}
                    >
                      {r.length.toFixed(2)}
                    </td>
                    <td className="py-0.5 pl-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.spec.curves || ""}
                        placeholder="0"
                        onChange={(e) => patchRun(r, { curves: num(e.target.value) })}
                        className={`${input} w-full`}
                      />
                    </td>
                    <td className="py-0.5 text-right font-mono text-neutral-400">{r.gas}"</td>
                    <td className="py-0.5 text-right font-mono text-neutral-400">{r.liquid}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {bill && bill.summary.ykits.length > 0 && (
          <div className="border-b border-neutral-800 px-2 py-1.5">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
              Y-kits · {bill.summary.ykits.reduce((n, k) => n + k.qty, 0)}{" "}
              <span className="normal-case">
                {bill.summary.ykitsFromTree
                  ? "(derivações do esquema, cada uma pela capacidade ligada a jusante)"
                  : "(evaporadoras − 1, pelas capacidades digitadas: ligue os trechos no desenho para ler do esquema)"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {bill.summary.ykits.map((k) => (
                <span
                  key={k.model}
                  className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200 ring-1 ring-neutral-700"
                  title={`A partir de ${formatHp(k.hp)} a jusante`}
                >
                  {k.qty}× {k.model || "?"}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="px-2 py-1.5">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
            Materiais por sistema · preço unitário editável
          </div>
          <table className="w-full table-fixed">
            <tbody>
              {materials.map((r) => {
                const p = bill?.price(r) ?? 0;
                const own = project.vrfPrices?.[r.name] !== undefined;
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
                        onChange={(e) => setVrfPrice(r.name, num(e.target.value))}
                        className={`${input} w-full ${own ? "ring-amber-400/70" : ""}`}
                        title={
                          own
                            ? `Preço digitado neste takeoff por ${r.unit}`
                            : r.copper
                              ? "Cobre por peso: kg/m do fornecedor × R$/kg (Catálogo e preços); digite para sobrescrever"
                              : `Preço unitário por ${r.unit} (catálogo ou planilha de referência)`
                        }
                      />
                    </td>
                    <td className="w-[5.6rem] py-0.5 text-right font-mono whitespace-nowrap">
                      {money(r.qty * p)}
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr>
                  <td className="py-2 text-neutral-500">Meça trechos para ver os materiais.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-neutral-800 px-2 py-1.5 text-neutral-300">
        {laborRow && (
          <div className="flex items-center justify-between">
            <span className="text-neutral-400" title="Por evaporadora instalada">
              Mão de obra · {laborRow.qty} evap. × {money(laborRow.labor)}
            </span>
            <span className="font-mono">{money(bill?.totals.labor ?? 0)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Material</span>
          <span className="font-mono">{money(bill?.totals.material ?? 0)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-neutral-800 pt-1 font-semibold text-neutral-100">
          <span>
            {system.name}
            {count > 1 && <span className="font-normal text-neutral-400"> · {count} sistemas</span>}
          </span>
          <span className="font-mono">{money(perSystem * count)}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          No orçamento: este item, {count} cj, com {money(perSystem)} de material e mão de obra por
          sistema.
          {brand && ` Marca ${brand.name}.`}
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            variant="primary"
            className="flex-1 justify-center"
            onClick={() => void exportVrfSheet([system.id])}
            title="Planilha Levantamento VRF deste sistema: trechos com bitolas, materiais e preços"
          >
            <FileSpreadsheet size={16} /> Planilha VRF (.xlsx)
          </Button>
          {systems.length > 1 && (
            <Button
              onClick={() => void exportVrfSheet()}
              title="Todos os sistemas VRF do takeoff numa planilha"
            >
              Todos
            </Button>
          )}
          <Button
            onClick={() =>
              system &&
              updateItem(system.id, {
                name: prompt("Nome do sistema", system.name)?.trim() || system.name,
              })
            }
            title="Renomear este sistema (também na aba Itens)"
          >
            Renomear
          </Button>
        </div>
      </div>
    </div>
  );
}
