import { api } from "@rlpapp/backend/convex/_generated/api";
import { GAUGES } from "@rlpapp/shared/engenharia/ducts";
import { BASE_MATERIALS, COPPER_GROUP, type WeightRow } from "@rlpapp/shared/takeoff/weights";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { KitsSection } from "@/components/takeoff/kits-section";
import {
  PublishBar,
  TakeoffPageHeader,
  toNumber,
  toText,
  usePublisher,
} from "@/components/takeoff/painel";
import { SERIES_COLORS } from "@/components/takeoff/price-per-kg-chart";
import { PriceRecords } from "@/components/takeoff/price-records";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/takeoff/_painel/gerais")({
  component: () => (
    <AuthShell>
      <GeraisPage />
    </AuthShell>
  ),
});

type Texts = Record<string, string>;
const toTexts = (record: Record<string, number> | null | undefined): Texts =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, toText(v)]));
const toNumbers = (texts: Texts): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(texts)) {
    const n = toNumber(t);
    if (n !== undefined) out[k] = n;
  }
  return out;
};

const material = (key: string) => BASE_MATERIALS.find((m) => m.key === key)!;
const COPPER_SERIES = [
  { material: "cobre", label: material("cobre").label, colorClass: SERIES_COLORS[0] },
  { material: "cobre_grosso", label: material("cobre_grosso").label, colorClass: SERIES_COLORS[1] },
];
const SHEET_SERIES = [{ material: "chapa", label: material("chapa").label, colorClass: SERIES_COLORS[0] }];

const EMPTY_ROW: WeightRow = { name: "", group: COPPER_GROUP, unit: "m", material: "cobre", kgPerUnit: 0 };

function GeraisPage() {
  const settings = useQuery(api.takeoffSettings.get, {});
  const history = useQuery(api.takeoffSettings.priceHistory, {});
  const saveWeights = useMutation(api.takeoffSettings.saveWeights);
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const { busy, run } = usePublisher();
  const [gauges, setGauges] = useState<Texts>({});
  const [rows, setRows] = useState<WeightRow[]>([]);
  // the weights follow the published values until edited; a publish ends the edit only when
  // nothing was typed while it ran (latest holds what is on screen right now). Prices are not
  // part of it: each one is a dated record, saved on its own (PriceRecords).
  const [dirty, setDirty] = useState(false);
  const latest = useRef({ gauges, rows });
  latest.current = { gauges, rows };
  useEffect(() => {
    if (!settings) return;
    if (!dirty) {
      setGauges(toTexts(settings.weights?.gaugeWeights));
      setRows((settings.weights?.rows ?? []).map((r) => ({ ...r })));
    }
  }, [settings, dirty]);

  const editWeights = (next: { gauges?: Texts; rows?: WeightRow[] }) => {
    setDirty(true);
    if (next.gauges) setGauges(next.gauges);
    if (next.rows) setRows(next.rows);
  };

  const publish = () =>
    run(async () => {
      const sent = JSON.stringify({ gauges, rows });
      await saveWeights({ rows: rows.filter((r) => r.name.trim()), gaugeWeights: toNumbers(gauges) });
      if (JSON.stringify(latest.current) === sent) setDirty(false);
    }, "Pesos publicados");
  const loadFactoryWeights = () =>
    run(() => seedDefaults({ kind: "weights" }), "Pesos do fornecedor carregados");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TakeoffPageHeader
        title="Gerais e presets"
        description="Preço e peso do cobre e da chapa, e os kits. Vale para o app de todos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Cobre</CardTitle>
          <CardDescription>Preço do tubo = kg/m × R$/kg. O app usa o preço mais recente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PriceRecords series={COPPER_SERIES} history={history} />

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 className="text-sm font-medium">Peso dos tubos</h3>
              {settings && (settings.weights?.rows.length ?? 0) === 0 && (
                <Button variant="outline" size="sm" onClick={() => void loadFactoryWeights()} disabled={busy}>
                  <Download className="size-4" /> Carregar tabela do fornecedor
                </Button>
              )}
            </div>
            <WeightTable
              rows={rows}
              onChange={(next) => editWeights({ rows: next })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chapa galvanizada</CardTitle>
          <CardDescription>Peso e preço dos dutos. O app usa o preço mais recente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PriceRecords series={SHEET_SERIES} history={history} />
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Peso por bitola (kg/m²)</h3>
            <div className="grid gap-3 sm:grid-cols-5">
              {GAUGES.map((g) => (
                <div key={g.name} className="space-y-1">
                  <Label htmlFor={`gauge-${g.name}`} className="font-mono text-xs text-muted-foreground">
                    {g.name}
                  </Label>
                  <Input
                    id={`gauge-${g.name}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={gauges[g.name] ?? ""}
                    placeholder={String(g.kgm2)}
                    onChange={(e) => editWeights({ gauges: { ...gauges, [g.name]: e.target.value } })}
                    className="text-right font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <KitsSection />

      <PublishBar
        dirty={dirty}
        busy={busy}
        disabled={!settings}
        onPublish={() => void publish()}
        onDiscard={() => setDirty(false)}
      />
    </div>
  );
}

function WeightTable({ rows, onChange }: { rows: WeightRow[]; onChange: (rows: WeightRow[]) => void }) {
  const update = (i: number, patch: Partial<WeightRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-control-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Material</th>
              <th className="px-2 py-1.5 text-left font-medium">Un.</th>
              <th className="px-2 py-1.5 text-left font-medium">Preço de</th>
              <th className="px-2 py-1.5 text-right font-medium">kg / un.</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-control-border">
                <td className="p-1">
                  <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder='Tubo de cobre 1/2"' className="min-w-56" aria-label="Material" />
                </td>
                <td className="p-1">
                  <Select value={r.unit} onValueChange={(v) => update(i, { unit: v as WeightRow["unit"] })}>
                    <SelectTrigger className="min-w-20" aria-label="Unidade"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m">m</SelectItem>
                      <SelectItem value="pç">pç</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Select value={r.material} onValueChange={(v) => update(i, { material: v })}>
                    <SelectTrigger className="min-w-44" aria-label="Preço por kg de"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BASE_MATERIALS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Input type="number" min={0} step="0.001" value={r.kgPerUnit} onChange={(e) => update(i, { kgPerUnit: Number(e.target.value) || 0 })} className="w-28 text-right font-mono" aria-label="kg por unidade" />
                </td>
                <td className="p-1">
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum tubo. Carregue a tabela do fornecedor ou acrescente linhas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { ...EMPTY_ROW }])}>
        <Plus className="size-4" /> Linha
      </Button>
    </div>
  );
}
