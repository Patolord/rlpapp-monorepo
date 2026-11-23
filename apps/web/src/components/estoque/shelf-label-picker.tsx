import { Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printShelfLabels } from "@/lib/estoque/shelf-label-print";
import {
  expandShelfLabels,
  filterShelfLabels,
  SHELF_LABEL_SHEETS,
  type ShelfLabelRow,
  type ShelfLabelSheet,
} from "@/lib/estoque/shelf-labels";
import { cn } from "@/lib/utils";

/**
 * Escolha das etiquetas de prateleira: filtra por endereço (ex.: "B3" imprime
 * a prateleira inteira) ou busca, marca os itens, escolhe a folha e imprime.
 */
export function ShelfLabelPicker({ rows, loading }: { rows: ShelfLabelRow[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [addressPrefix, setAddressPrefix] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetKey, setSheetKey] = useState<ShelfLabelSheet["key"]>("a4-3x8");
  const [copies, setCopies] = useState("1");

  const filtered = useMemo(
    () => filterShelfLabels(rows, { search, addressPrefix, onlyInStock }),
    [rows, search, addressPrefix, onlyInStock]
  );
  const sheet = SHELF_LABEL_SHEETS.find((s) => s.key === sheetKey) ?? SHELF_LABEL_SHEETS[0]!;
  const chosen = filtered.filter((row) => selected.has(row.balanceId));
  const labels = expandShelfLabels(chosen, Number.parseInt(copies, 10) || 1);
  const perSheet = sheet.columns * sheet.rows;
  const sheets = Math.ceil(labels.length / perSheet);
  const withoutSku = chosen.filter((row) => !row.sku).length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.balanceId));

  function toggle(balanceId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(balanceId)) next.delete(balanceId);
      else next.add(balanceId);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of filtered) {
        if (allFilteredSelected) next.delete(row.balanceId);
        else next.add(row.balanceId);
      }
      return next;
    });
  }

  function print() {
    if (!printShelfLabels(labels, sheet)) {
      toast.error("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 bg-white pl-9"
              placeholder="Buscar item, SKU ou endereço"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar item"
            />
          </div>
          <Input
            className="h-10 bg-white sm:w-48"
            placeholder="Endereço começa com (ex.: B3)"
            value={addressPrefix}
            onChange={(event) => setAddressPrefix(event.target.value)}
            aria-label="Prefixo do endereço"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyInStock} onCheckedChange={(checked) => setOnlyInStock(Boolean(checked))} />
            Só itens com saldo
          </label>
          <Button variant="outline" size="sm" onClick={toggleAllFiltered} disabled={filtered.length === 0}>
            {allFilteredSelected ? "Desmarcar os listados" : `Marcar os ${filtered.length} listados`}
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          {loading && rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Carregando itens do central…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Nenhum item no estoque central ainda. Cadastre pelo app (Estoque › Cadastro) e volte aqui."
                : "Nada com esse filtro."}
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto">
              {filtered.map((row) => {
                const checked = selected.has(row.balanceId);
                return (
                  <li key={row.balanceId}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50",
                        checked && "bg-primary/5"
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(row.balanceId)} />
                      <span className="w-20 shrink-0 font-mono text-xs font-semibold">
                        {row.physicalAddress || <span className="font-sans font-normal text-muted-foreground">sem end.</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {row.name}
                        {row.variantLabel ? <span className="text-muted-foreground"> — {row.variantLabel}</span> : null}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.sku ?? "sem SKU"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {loading && rows.length > 0 ? (
          <p className="text-xs text-muted-foreground">Carregando mais itens… ({rows.length} até agora)</p>
        ) : null}
      </section>

      <aside className="space-y-4 rounded-xl border bg-white p-4 lg:sticky lg:top-4 lg:self-start">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Folha de etiquetas</legend>
          {SHELF_LABEL_SHEETS.map((option) => (
            <label
              key={option.key}
              className={cn(
                "flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm",
                option.key === sheetKey && "border-primary bg-primary/5"
              )}
            >
              <input
                type="radio"
                name="shelf-label-sheet"
                className="mt-1"
                checked={option.key === sheetKey}
                onChange={() => setSheetKey(option.key)}
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="shelf-label-copies">Cópias de cada etiqueta</Label>
          <Input
            id="shelf-label-copies"
            type="number"
            min={1}
            max={10}
            className="h-10 w-24"
            value={copies}
            onChange={(event) => setCopies(event.target.value)}
          />
        </div>
        <div className="space-y-1 text-sm">
          <p>
            <strong className="tabular-nums">{labels.length}</strong> etiqueta{labels.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{sheets}</span> folha{sheets === 1 ? "" : "s"}
          </p>
          {withoutSku > 0 ? (
            <p className="text-xs text-amber-700">
              {withoutSku} item{withoutSku === 1 ? "" : "s"} sem SKU fica{withoutSku === 1 ? "" : "m"} de fora.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Na impressão, use escala 100% (tamanho real) para bater com a folha adesiva.
          </p>
        </div>
        <Button className="w-full" onClick={print} disabled={labels.length === 0}>
          <Printer />
          Imprimir etiquetas
        </Button>
      </aside>
    </div>
  );
}
