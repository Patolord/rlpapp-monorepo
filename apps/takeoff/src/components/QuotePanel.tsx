import { ChevronDown, ChevronUp, Copy, FileSpreadsheet } from "lucide-react";
import { Fragment, useMemo } from "react";
import { exportXlsx } from "../lib/files";
import { mod } from "../lib/platform";
import { buildQuote, quoteCsv, round2, systemSheets } from "../lib/quantities";
import { formatMoney, formatNumber, type Unit } from "../lib/units";
import { isWeightPriced } from "../lib/weights";
import { type ProjectMeta, useStore } from "../store";
import { Button } from "./ui";

/** Mirrors the workbook: one block per discipline (tab), locations or groups as inline headers. */
export function QuotePanel() {
  const project = useStore((s) => s.project);
  const { updateItem, setProjectMeta, setStatus, moveItemInBudget } = useStore.getState();
  const quote = useMemo(() => buildQuote(project), [project]);
  const sheets = useMemo(() => systemSheets(project), [project]);
  const money = (v: number) => formatMoney(v, project.currency);
  const lineTotal = (r: { item: { materialPrice: number; laborPrice: number }; qty: number }) =>
    round2(r.qty * (r.item.materialPrice + r.item.laborPrice));

  const copyCsv = async () => {
    await navigator.clipboard.writeText(quoteCsv(project, quote));
    setStatus("Planilha copiada como CSV (separado por ponto e vírgula)");
  };

  const field = (key: keyof ProjectMeta, label: string, placeholder = "") => (
    <label className="flex min-w-0 items-center gap-1 text-neutral-400">
      <span className="w-14 shrink-0 text-right">{label}</span>
      <input
        value={String(project[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => setProjectMeta({ [key]: e.target.value })}
        className="h-6 min-w-0 flex-1 rounded bg-neutral-800 px-1.5 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
      />
    </label>
  );

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="grid grid-cols-1 gap-1 border-b border-neutral-800 px-2 py-2">
        {field("system", "Disciplina", "SISTEMA DE PRESSURIZAÇÃO DE ESCADAS")}
        {field("client", "Cliente")}
        {field("site", "Obra")}
        <div className="grid grid-cols-2 gap-1">
          {field("proposalNumber", "Proposta")}
          {field("estimator", "Orçam.")}
        </div>
        <div className="flex items-center gap-3 pt-1 text-neutral-400">
          <label className="flex items-center gap-1" title="Como cada aba da planilha é dividida">
            Seções
            <select
              value={project.sectionsBy}
              onChange={(e) => setProjectMeta({ sectionsBy: e.target.value as "local" | "grupo" })}
              className="rounded bg-neutral-800 px-1 py-0.5 ring-1 ring-neutral-700"
            >
              <option value="local">por local</option>
              <option value="grupo">por grupo</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            Moeda
            <select
              value={project.currency}
              onChange={(e) => setProjectMeta({ currency: e.target.value })}
              className="rounded bg-neutral-800 px-1 py-0.5 ring-1 ring-neutral-700"
            >
              {["BRL", "USD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Unidades
            <select
              value={project.unit}
              onChange={(e) => setProjectMeta({ unit: e.target.value as Unit })}
              className="rounded bg-neutral-800 px-1 py-0.5 ring-1 ring-neutral-700"
            >
              <option value="m">métrico (m)</option>
              <option value="ft">imperial (ft)</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 bg-neutral-900 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-2 py-1 text-left">Item</th>
              <th className="w-[4.8rem] px-1 py-1 text-right">Quant.</th>
              <th className="w-[5rem] px-1.5 py-1 text-right">Material</th>
              <th className="w-[5rem] px-1.5 py-1 text-right">M. obra</th>
              <th className="w-[6.6rem] px-2 py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((sheet) => {
              const sheetTotal = sheet.sections.reduce(
                (s, sec) => s + sec.rows.reduce((t, r) => t + lineTotal(r), 0),
                0,
              );
              return (
                <Fragment key={sheet.system}>
                  <tr className="bg-orange-500/10 text-neutral-100">
                    <td className="px-2 py-1.5 text-xs font-semibold uppercase" colSpan={4}>
                      {sheet.system}
                      <span className="ml-2 text-[11px] font-normal normal-case text-neutral-500">
                        aba da planilha
                      </span>
                    </td>
                    <td className="truncate px-2 py-1.5 text-right font-mono font-semibold">
                      {money(sheetTotal)}
                    </td>
                  </tr>
                  {sheet.sections.map((sec, si) => (
                    <Fragment key={`${sheet.system}-${sec.name}`}>
                      <tr className="bg-neutral-800/60 text-neutral-200">
                        <td className="px-2 py-1 font-semibold" colSpan={4}>
                          {si + 1}. {sec.name}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {money(sec.rows.reduce((t, r) => t + lineTotal(r), 0))}
                        </td>
                      </tr>
                      {sec.rows.map((r, ri) => (
                        <tr key={r.item.id} className="border-b border-neutral-800/70">
                          <td className="truncate whitespace-nowrap px-2 py-1" title={r.item.name}>
                            <span className="mr-1 font-mono text-neutral-500">
                              {si + 1}.{ri + 1}
                            </span>
                            <span
                              className="mr-1.5 inline-block h-2 w-2 rounded-full"
                              style={{ background: r.item.color }}
                            />
                            {r.item.name}
                            <span className="ml-1 inline-flex align-middle">
                              <button
                                type="button"
                                title="Subir uma posição no grupo"
                                disabled={ri === 0}
                                onClick={() => moveItemInBudget(r.item.id, -1)}
                                className="rounded p-px text-neutral-600 hover:text-neutral-200 disabled:invisible"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                title="Descer uma posição no grupo"
                                disabled={ri === sec.rows.length - 1}
                                onClick={() => moveItemInBudget(r.item.id, 1)}
                                className="rounded p-px text-neutral-600 hover:text-neutral-200 disabled:invisible"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </span>
                          </td>
                          <td className="px-1 py-1 text-right font-mono whitespace-nowrap">
                            {formatNumber(r.qty, project.currency, r.item.kind === "count" ? 0 : 2)}{" "}
                            {r.unit}
                          </td>
                          <td className="px-1.5 py-1 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={r.item.materialPrice}
                              onChange={(e) =>
                                updateItem(r.item.id, {
                                  materialPrice: Number(e.target.value) || 0,
                                })
                              }
                              className={
                                isWeightPriced(r.item) && r.item.priceSource === "manual"
                                  ? "num-input w-[4rem] ring-1 ring-amber-400/70"
                                  : "num-input w-[4rem]"
                              }
                              title={
                                isWeightPriced(r.item) && r.item.priceSource === "manual"
                                  ? "Preço digitado nesta linha (sobrescreve o preço por peso; ↺ na aba Itens volta)"
                                  : isWeightPriced(r.item)
                                    ? "Preço por peso (R$/kg do insumo no rodapé do Ctrl+K); digite outro para sobrescrever só esta linha"
                                    : "Preço unitário de material"
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={r.item.laborPrice}
                              onChange={(e) =>
                                updateItem(r.item.id, { laborPrice: Number(e.target.value) || 0 })
                              }
                              className="num-input w-[4rem]"
                              title="Preço unitário de mão de obra"
                            />
                          </td>
                          <td className="truncate px-2 py-1 text-right font-mono whitespace-nowrap">
                            {money(lineTotal(r))}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
            {sheets.every((s) => s.sections.length === 0) && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-neutral-500">
                  Nada medido ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t border-neutral-800 px-3 py-2">
        <Row label="Material" value={money(quote.material)} />
        <Row label="Mão de obra" value={money(quote.labor)} />
        <Row
          label={
            <span className="flex items-center gap-1">
              Diversos + Transportes + Supervisão
              <input
                type="number"
                step="0.5"
                min={0}
                value={project.extrasPct}
                onChange={(e) => setProjectMeta({ extrasPct: Number(e.target.value) || 0 })}
                className="num-input w-12"
              />
              %
            </span>
          }
          value={money(quote.extraEach * 3)}
        />
        <Row label="TOTAL GERAL" value={money(quote.totalGeral)} />
        <Row
          label={
            <span className="flex items-center gap-1">
              <span className="font-semibold text-neutral-100">Proposta</span> BDI ×
              <input
                type="number"
                step="0.01"
                min={1}
                value={project.bdi}
                onChange={(e) => setProjectMeta({ bdi: Number(e.target.value) || 1 })}
                className="num-input w-14"
              />
            </span>
          }
          value={money(quote.proposal)}
          strong
        />
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={() => void exportXlsx()} title={mod("E")}>
            <FileSpreadsheet size={16} /> Planilha .xlsx
          </Button>
          <Button onClick={() => void copyCsv()}>
            <Copy size={16} /> Copiar CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-neutral-300">
      <span>{label}</span>
      <span className={strong ? "font-mono text-base font-semibold text-neutral-100" : "font-mono"}>
        {value}
      </span>
    </div>
  );
}
