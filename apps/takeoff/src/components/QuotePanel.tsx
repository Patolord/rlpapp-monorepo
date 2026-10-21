import { Copy, FileSpreadsheet } from "lucide-react";
import { Fragment, useMemo } from "react";
import { exportXlsx } from "../lib/files";
import { buildQuote, quoteCsv } from "../lib/quantities";
import { formatMoney, formatNumber, type Unit } from "../lib/units";
import { type ProjectMeta, useStore } from "../store";
import { Button } from "./ui";

export function QuotePanel() {
  const project = useStore((s) => s.project);
  const { updateItem, setProjectMeta, setStatus } = useStore.getState();
  const quote = useMemo(() => buildQuote(project), [project]);
  const money = (v: number) => formatMoney(v, project.currency);

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
        {field("system", "Sistema", "SISTEMA DE PRESSURIZAÇÃO DE ESCADAS")}
        {field("client", "Cliente")}
        {field("site", "Obra")}
        <div className="grid grid-cols-2 gap-1">
          {field("proposalNumber", "Proposta")}
          {field("estimator", "Orçam.")}
        </div>
        <div className="flex items-center gap-3 pt-1 text-neutral-400">
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
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-neutral-900 text-[10px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-2 py-1 text-left">Item</th>
              <th className="px-1 py-1 text-right">Quant.</th>
              <th className="px-1 py-1 text-right">Material</th>
              <th className="px-1 py-1 text-right">M. obra</th>
              <th className="px-2 py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.groups.map((g, gi) => (
              <Fragment key={g.name}>
                <tr className="bg-neutral-800/60 text-neutral-200">
                  <td className="px-2 py-1 font-semibold" colSpan={4}>
                    {gi + 1}. {g.name}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{money(g.total)}</td>
                </tr>
                {g.lines.map((l, li) => (
                  <tr key={l.item.id} className="border-b border-neutral-800/70">
                    <td
                      className="max-w-[11rem] truncate whitespace-nowrap px-2 py-1"
                      title={l.item.name}
                    >
                      <span className="mr-1 font-mono text-neutral-500">
                        {gi + 1}.{li + 1}
                      </span>
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ background: l.item.color }}
                      />
                      {l.item.name}
                    </td>
                    <td className="px-1 py-1 text-right font-mono whitespace-nowrap">
                      {formatNumber(l.qty, project.currency, l.item.kind === "count" ? 0 : 2)}{" "}
                      {l.unit}
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.item.materialPrice}
                        onChange={(e) =>
                          updateItem(l.item.id, { materialPrice: Number(e.target.value) || 0 })
                        }
                        className="num-input w-[3.6rem]"
                        title="Preço unitário de material"
                      />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.item.laborPrice}
                        onChange={(e) =>
                          updateItem(l.item.id, { laborPrice: Number(e.target.value) || 0 })
                        }
                        className="num-input w-[3.6rem]"
                        title="Preço unitário de mão de obra"
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono whitespace-nowrap">
                      {money(l.total)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {quote.groups.length === 0 && (
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
              <span className="font-semibold text-white">Proposta</span> BDI ×
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
          <Button variant="primary" onClick={() => void exportXlsx()} title="Ctrl+E">
            <FileSpreadsheet size={14} /> Planilha .xlsx
          </Button>
          <Button onClick={() => void copyCsv()}>
            <Copy size={14} /> Copiar CSV
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
      <span className={strong ? "font-mono text-base font-semibold text-white" : "font-mono"}>
        {value}
      </span>
    </div>
  );
}
