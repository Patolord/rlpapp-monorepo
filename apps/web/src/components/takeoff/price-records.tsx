import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { PriceChangeBadge } from "@/components/compras/price-change-badge";
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
import { priceChange } from "@/lib/takeoff/price-history";
import { cn } from "@/lib/utils";

/**
 * Preço por kg de um ou mais insumos como registros datados: cada cotação entra com a data em
 * que vale, e o preço publicado ao app é o do registro mais recente. Registrar de novo na mesma
 * data corrige aquele dia. Abaixo do formulário, o gráfico e a lista dos registros.
 */

type HistoryRow = FunctionReturnType<typeof api.takeoffSettings.priceHistory>[number];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateShort = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const COLLAPSED_ROWS = 8;

const pad = (n: number) => String(n).padStart(2, "0");
/** Data local no formato do input de data (AAAA-MM-DD). */
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type Form = { material: string; date: string; price: string; note: string };

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
  const blank = (material = series[0]?.material ?? ""): Form => ({ material, date: today, price: "", note: "" });
  const [form, setForm] = useState<Form>(() => blank());
  const [showAll, setShowAll] = useState(false);

  const materials = new Set(series.map((s) => s.material));
  const labelOf = (material: string) => series.find((s) => s.material === material)?.label ?? material;
  const rows = (history ?? []).filter((r) => materials.has(r.material));
  // newest first, each with the previous record of the same material for the change
  const listed = [...rows]
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .map((row) => {
      const previous = rows
        .filter((r) => r.material === row.material && r.recordedAt < row.recordedAt)
        .sort((a, b) => b.recordedAt - a.recordedAt)[0];
      return { row, previous };
    });
  const visible = showAll ? listed : listed.slice(0, COLLAPSED_ROWS);
  // the newest record of each material is the price the app uses
  const inForceIds = new Set(
    series.flatMap((s) => listed.find((l) => l.row.material === s.material)?.row.id ?? []),
  );

  const price = Number(form.price.replace(",", "."));
  const valid = form.material !== "" && form.date !== "" && form.date <= today && price > 0;
  const sameDay = rows.find((r) => r.material === form.material && isoDay(r.recordedAt) === form.date);

  const submit = async () => {
    if (!valid) return;
    const ok = await run(
      () => saveRecord({ material: form.material, date: form.date, price, note: form.note.trim() || undefined }),
      sameDay ? "Registro de preço corrigido" : "Preço registrado",
    );
    if (ok) setForm(blank(form.material));
  };
  const remove = (row: HistoryRow) => {
    const what = `${labelOf(row.material)} de ${dateShort.format(row.recordedAt)}`;
    if (!window.confirm(`Remover o registro ${what}?\n\nSe for o mais recente, o app volta a usar o registro anterior.`)) return;
    void run(() => removeRecord({ id: row.id as Id<"takeoffPriceHistory"> }), "Registro removido");
  };
  const edit = (row: HistoryRow) =>
    setForm({
      material: row.material,
      date: isoDay(row.recordedAt),
      price: row.price === null ? "" : String(row.price),
      note: row.note ?? "",
    });

  return (
    <div className="space-y-4">
      <form
        className="grid items-end gap-3 rounded-md border border-control-border bg-muted/30 p-3 sm:grid-cols-[auto_auto_8rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {series.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor={`record-material-${series[0]?.material}`}>Insumo</Label>
            <Select value={form.material} onValueChange={(material) => setForm((f) => ({ ...f, material }))}>
              <SelectTrigger id={`record-material-${series[0]?.material}`} className="min-w-44">
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
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`record-date-${form.material}`}>Data do preço</Label>
          <Input
            id={`record-date-${form.material}`}
            type="date"
            max={today}
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`record-price-${form.material}`}>R$/kg</Label>
          <Input
            id={`record-price-${form.material}`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            className="text-right font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`record-note-${form.material}`}>Observação</Label>
          <Input
            id={`record-note-${form.material}`}
            value={form.note}
            maxLength={200}
            placeholder="Fonte: cotação, fornecedor…"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
        <Button type="submit" disabled={!valid || busy || history === undefined}>
          <Plus className="size-4" /> {sameDay ? "Corrigir dia" : "Registrar"}
        </Button>
        {sameDay && (
          <p className="text-xs text-muted-foreground sm:col-span-5">
            Já existe um registro de {labelOf(form.material)} em {dateShort.format(sameDay.recordedAt)}
            {sameDay.price !== null ? ` (${brl.format(sameDay.price)}/kg)` : ""}: registrar corrige aquele dia.
          </p>
        )}
      </form>

      <PricePerKgChart series={series} history={history} />

      {listed.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-control-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Data</th>
                  {series.length > 1 && <th className="px-3 py-1.5 text-left font-medium">Insumo</th>}
                  <th className="px-3 py-1.5 text-right font-medium">R$/kg</th>
                  <th className="px-3 py-1.5 text-left font-medium">Variação</th>
                  <th className="px-3 py-1.5 text-left font-medium">Observação</th>
                  <th className="px-3 py-1.5 text-left font-medium">Por</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, previous }) => {
                  const inForce = inForceIds.has(row.id);
                  return (
                    <tr key={row.id} className="border-t border-control-border">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                        {dateShort.format(row.recordedAt)}
                        {inForce && <span className="ml-2 text-xs text-muted-foreground">em vigor</span>}
                      </td>
                      {series.length > 1 && (
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn("size-2 rounded-full bg-current", series.find((s) => s.material === row.material)?.colorClass)}
                              aria-hidden
                            />
                            {labelOf(row.material)}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.price === null ? "padrão do fornecedor" : brl.format(row.price)}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.price !== null && previous?.price != null ? (
                          <PriceChangeBadge
                            change={priceChange(previous.price, previous.recordedAt, row.price)}
                            basis={`registro de ${dateShort.format(previous.recordedAt)}`}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-64 truncate px-3 py-1.5 text-muted-foreground" title={row.note ?? undefined}>
                        {row.note ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{row.recordedBy ?? "—"}</td>
                      <td className="px-1 py-1 text-right">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar registro" onClick={() => edit(row)}>
                          <Pencil className="size-4" />
                        </Button>
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
                  );
                })}
              </tbody>
            </table>
          </div>
          {listed.length > COLLAPSED_ROWS && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Mostrar só os recentes" : `Ver todos os ${listed.length} registros`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
