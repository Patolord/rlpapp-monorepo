import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { usePublisher } from "@/components/takeoff/painel";
import { type PriceSeries, PricePerKgChart } from "@/components/takeoff/price-per-kg-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Preço por kg de um ou mais insumos como registros datados: o app usa o mais recente, e
 * registrar de novo na mesma data corrige aquele dia. Formulário, gráfico e os últimos registros.
 */

type HistoryRow = FunctionReturnType<typeof api.takeoffSettings.priceHistory>[number];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateShort = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const RECENT_ROWS = 5;

const pad = (n: number) => String(n).padStart(2, "0");
/** Data local no formato do input de data (AAAA-MM-DD). */
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function PriceRecords({
  series,
  history,
}: {
  series: readonly PriceSeries[];
  history: readonly HistoryRow[] | undefined;
}) {
  const saveRecord = useMutation(api.takeoffSettings.savePriceRecord);
  const removeRecord = useMutation(api.takeoffSettings.removePriceRecord);
  const { busy, run } = usePublisher();
  const [today] = useState(() => isoDay(Date.now()));
  const [material, setMaterial] = useState(series[0]?.material ?? "");
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState("");
  const [showAll, setShowAll] = useState(false);

  const labelOf = (key: string) => series.find((s) => s.material === key)?.label ?? key;
  const rows = (history ?? [])
    .filter((r) => series.some((s) => s.material === r.material))
    .sort((a, b) => b.recordedAt - a.recordedAt);
  const visible = showAll ? rows : rows.slice(0, RECENT_ROWS);
  const value = Number(price.replace(",", "."));
  const valid = material !== "" && date !== "" && date <= today && value > 0;

  const submit = async () => {
    if (!valid) return;
    const ok = await run(() => saveRecord({ material, date, price: value }), "Preço registrado");
    if (ok) setPrice("");
  };
  const remove = (row: HistoryRow) => {
    if (!window.confirm(`Remover o preço de ${labelOf(row.material)} em ${dateShort.format(row.recordedAt)}?`)) return;
    void run(() => removeRecord({ id: row.id as Id<"takeoffPriceHistory"> }), "Registro removido");
  };
  const id = (field: string) => `price-${series[0]?.material}-${field}`;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {series.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor={id("material")}>Insumo</Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger id={id("material")} className="min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {series.map((s) => (
                  <SelectItem key={s.material} value={s.material}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={id("date")}>Data</Label>
          <Input id={id("date")} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("value")}>R$/kg</Label>
          <Input
            id={id("value")}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 text-right font-mono"
          />
        </div>
        <Button type="submit" disabled={!valid || busy || history === undefined}>
          <Plus className="size-4" /> Registrar
        </Button>
      </form>

      <PricePerKgChart series={series} history={history} />

      {rows.length > 0 && (
        <div className="space-y-1">
          <table className="w-full text-sm">
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-control-border first:border-t-0">
                  <td className="py-1 tabular-nums">{dateShort.format(row.recordedAt)}</td>
                  {series.length > 1 && <td className="py-1 text-muted-foreground">{labelOf(row.material)}</td>}
                  <td className="py-1 text-right tabular-nums">
                    {row.price === null ? "padrão do fornecedor" : `${brl.format(row.price)}/kg`}
                  </td>
                  <td className="w-10 py-0.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover registro"
                      disabled={busy}
                      onClick={() => remove(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > RECENT_ROWS && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Mostrar menos" : `Ver todos (${rows.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
