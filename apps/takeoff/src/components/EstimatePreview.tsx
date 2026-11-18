import clsx from "clsx";
import { type EstimateResult, type LinePrice, lineKey, resultValue } from "../lib/estimate";
import { formatItemQty } from "../lib/quantities";
import { formatMoney, type Unit } from "../lib/units";

interface Props {
  results: readonly EstimateResult[];
  currency: string;
  unit: Unit;
  /** Type a unit price of a new line (by line key), over the catalog's. */
  onPrice(key: string, field: keyof LinePrice, value: number): void;
}

const priceInput =
  "h-6 w-20 rounded bg-neutral-800 px-1 text-right font-mono text-[12px] ring-1 outline-none focus:ring-orange-400";

/**
 * What the estimate adds to the budget, priced: each line's quantity, unit prices (typed here
 * for a new line, the line's own for one already in the takeoff) and value, and the totals.
 */
export function EstimatePreview({ results, currency, unit, onPrice }: Props) {
  if (results.length === 0) return <p className="text-neutral-500">Nada a gerar ainda.</p>;
  const money = (v: number) => formatMoney(v, currency);
  const totals = results.reduce(
    (t, r) => {
      const v = resultValue(r);
      return { material: t.material + v.material, labor: t.labor + v.labor };
    },
    { material: 0, labor: 0 },
  );
  const unpriced = results.filter((r) => r.item.materialPrice === 0 && r.item.laborPrice === 0);

  const priceCell = (r: EstimateResult, field: keyof LinePrice) => {
    const value = field === "material" ? r.item.materialPrice : r.item.laborPrice;
    if (!r.created) {
      return (
        <span className="font-mono text-neutral-400" title="Preço da linha que já está na lista">
          {money(value)}
        </span>
      );
    }
    return (
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        aria-label={`${field === "material" ? "Material" : "Mão de obra"} unitário: ${r.item.name}`}
        onChange={(e) => {
          // a cleared field is 0, not the catalog price back, so a new value can be typed
          onPrice(lineKey(r.line), field, Math.max(0, Number(e.target.value) || 0));
        }}
        className={clsx(
          priceInput,
          r.item.materialPrice === 0 && r.item.laborPrice === 0
            ? "ring-amber-500/60"
            : "ring-neutral-700",
        )}
      />
    );
  };

  return (
    <div className="space-y-2">
      <table className="w-full table-fixed text-[12px]">
        {/* the name takes what the numbers leave */}
        <colgroup>
          <col />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-28" />
        </colgroup>
        <thead className="text-left text-[11px] text-neutral-500">
          <tr>
            <th className="pb-1 font-normal">Item</th>
            <th className="pb-1 pr-2 text-right font-normal">Qtd.</th>
            <th className="pb-1 pr-2 text-right font-normal">Material un.</th>
            <th className="pb-1 pr-2 text-right font-normal">M.O. un.</th>
            <th className="pb-1 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const v = resultValue(r);
            return (
              <tr key={r.item.id} className="border-t border-neutral-800/70">
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-neutral-100" title={r.item.name}>
                      {r.item.name}
                    </span>
                    {r.created ? (
                      <span className="shrink-0 text-[10px] text-orange-300">novo</span>
                    ) : (
                      <span
                        className="shrink-0 text-[10px] text-neutral-500"
                        title="Soma ao item que já está na lista"
                      >
                        soma
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-neutral-500">
                    {r.item.group}
                    {r.item.system ? ` · ${r.item.system}` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono text-neutral-200">
                  {formatItemQty(r.item, r.added, unit)}
                </td>
                <td className="py-1 pr-2 text-right">{priceCell(r, "material")}</td>
                <td className="py-1 pr-2 text-right">{priceCell(r, "labor")}</td>
                <td className="whitespace-nowrap py-1 text-right font-mono text-neutral-200">
                  {money(v.material + v.labor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1 border-t border-neutral-700 pt-2">
        {unpriced.length > 0 && (
          <span className="mr-auto text-[11px] text-amber-400">
            {unpriced.length} {unpriced.length === 1 ? "item sem preço" : "itens sem preço"} no
            catálogo: digite acima
          </span>
        )}
        <span className="text-neutral-400">
          Material <span className="font-mono text-neutral-200">{money(totals.material)}</span>
        </span>
        <span className="text-neutral-400">
          M.O. <span className="font-mono text-neutral-200">{money(totals.labor)}</span>
        </span>
        <span className="text-neutral-300" title="Sem BDI nem extras: veja a aba Orçamento">
          Total{" "}
          <span className="font-mono text-sm font-semibold text-orange-300">
            {money(totals.material + totals.labor)}
          </span>
        </span>
      </div>
    </div>
  );
}
