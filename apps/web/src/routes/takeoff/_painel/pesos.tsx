import { api } from "@rlpapp/backend/convex/_generated/api";
import { GAUGES } from "@rlpapp/shared/engenharia/ducts";
import { BASE_MATERIALS, type WeightRow } from "@rlpapp/shared/takeoff/weights";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download, Loader2, Monitor, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
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
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/takeoff/_painel/pesos")({
  component: () => (
    <AuthShell>
      <PesosPage />
    </AuthShell>
  ),
});

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const updatedLine = (meta: { updatedAt: number; updatedBy: string | null } | null) =>
  meta ? `Atualizado em ${dateFormat.format(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""}` : null;

/** Number inputs keep text while typing; "" means unset. */
type Texts = Record<string, string>;
const toTexts = (record: Record<string, number> | null | undefined): Texts =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, String(v)]));
const toNumbers = (texts: Texts): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(texts)) {
    const n = Number(t.replace(",", "."));
    if (t.trim() !== "" && Number.isFinite(n)) out[k] = n;
  }
  return out;
};

const EMPTY_ROW: WeightRow = { name: "", group: "Tubulações", unit: "m", material: "cobre", kgPerUnit: 0 };

function PesosPage() {
  const settings = useQuery(api.takeoffSettings.get, {});
  const saveWeights = useMutation(api.takeoffSettings.saveWeights);
  const saveBasePrices = useMutation(api.takeoffSettings.saveBasePrices);
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const [prices, setPrices] = useState<Texts>({});
  const [gauges, setGauges] = useState<Texts>({});
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // the forms follow the published values until the user edits them (a save ends the edit)
  const [dirty, setDirty] = useState<{ prices: boolean; weights: boolean }>({ prices: false, weights: false });
  useEffect(() => {
    if (!settings) return;
    if (!dirty.prices) setPrices(toTexts(settings.basePrices));
    if (!dirty.weights) {
      setGauges(toTexts(settings.weights?.gaugeWeights));
      setRows((settings.weights?.rows ?? []).map((r) => ({ ...r })));
    }
  }, [settings, dirty]);

  const run = async (label: string, action: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar"));
    } finally {
      setBusy(null);
    }
  };
  const submitPrices = () =>
    run("prices", async () => {
      await saveBasePrices({ prices: toNumbers(prices) });
      setDirty((d) => ({ ...d, prices: false }));
    }, "Preços por kg publicados");
  const submitWeights = () =>
    run("weights", async () => {
      await saveWeights({
        rows: rows.filter((r) => r.name.trim()),
        gaugeWeights: toNumbers(gauges),
      });
      setDirty((d) => ({ ...d, weights: false }));
    }, "Tabela de pesos publicada");
  const loadFactory = () =>
    run("seed", () => seedDefaults({ kind: "weights" }), "Tabela do fornecedor carregada");

  const updateRow = (i: number, patch: Partial<WeightRow>) => {
    setDirty((d) => ({ ...d, weights: true }));
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pesos e insumos</h1>
        <p className="text-sm text-muted-foreground">
          Padrões da empresa para os preços derivados do peso no RLP Takeoff: preço por kg dos
          insumos, kg/m² das chapas dos dutos e a tabela de materiais por peso (tubos de cobre…).
        </p>
      </div>

      <div className="flex gap-3 rounded-lg border border-status-info/30 bg-card px-4 py-3 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-status-info" />
        <p>
          <span className="font-medium">Reflete no app desktop de todos os usuários</span> na
          próxima atualização do catálogo. Cada usuário pode sobrescrever um valor no próprio
          computador; o que ele alterou lá não é substituído por mudanças feitas aqui. Um campo
          vazio deixa valer a tabela do fornecedor embutida no app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Insumos (R$/kg)</CardTitle>
          <CardDescription>
            Tubos de cobre e a chapa dos dutos têm o preço derivado do peso × estes valores.
            {updatedLine(settings?.meta.basePrices ?? null) ?? " Ainda não publicado: o app usa a tabela do fornecedor."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {BASE_MATERIALS.map((m) => (
              <div key={m.key} className="space-y-1.5">
                <Label htmlFor={`price-${m.key}`}>{m.label}</Label>
                <Input
                  id={`price-${m.key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[m.key] ?? ""}
                  placeholder={m.defaultPrice !== undefined ? `${m.defaultPrice} (fornecedor)` : "sem preço"}
                  onChange={(e) => {
                    setDirty((d) => ({ ...d, prices: true }));
                    setPrices((p) => ({ ...p, [m.key]: e.target.value }));
                  }}
                  className="text-right font-mono"
                />
              </div>
            ))}
          </div>
          <Button onClick={() => void submitPrices()} disabled={busy !== null || !settings}>
            {busy === "prices" && <Loader2 className="size-4 animate-spin" />}
            Publicar preços
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Materiais por peso e chapas</CardTitle>
              <CardDescription>
                Cada linha vira um material do Ctrl+K do app, com preço = kg por unidade × preço
                do insumo. As bitolas são o kg/m² da chapa galvanizada dos dutos.
                {updatedLine(settings?.meta.weights ?? null) ?? " Ainda não publicado: o app usa a tabela do fornecedor."}
              </CardDescription>
            </div>
            {settings && settings.weights === null && (
              <Button variant="outline" onClick={() => void loadFactory()} disabled={busy !== null}>
                <Download className="size-4" /> Carregar tabela do fornecedor
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Chapa galvanizada dos dutos (kg/m² por bitola)</Label>
            <div className="grid gap-3 sm:grid-cols-5">
              {GAUGES.map((g) => (
                <div key={g.name} className="space-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{g.name}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={gauges[g.name] ?? ""}
                    placeholder={`${g.kgm2} (fornecedor)`}
                    onChange={(e) => {
                      setDirty((d) => ({ ...d, weights: true }));
                      setGauges((gs) => ({ ...gs, [g.name]: e.target.value }));
                    }}
                    className="text-right font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-control-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Material</th>
                  <th className="px-2 py-1.5 text-left font-medium">Grupo</th>
                  <th className="px-2 py-1.5 text-left font-medium">Un.</th>
                  <th className="px-2 py-1.5 text-left font-medium">Insumo</th>
                  <th className="px-2 py-1.5 text-right font-medium">kg / un.</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-control-border">
                    <td className="p-1">
                      <Input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder='Tubo de cobre 1/2"' className="min-w-56" />
                    </td>
                    <td className="p-1">
                      <Input value={r.group} onChange={(e) => updateRow(i, { group: e.target.value })} className="min-w-32" />
                    </td>
                    <td className="p-1">
                      <Select value={r.unit} onValueChange={(v) => updateRow(i, { unit: v as WeightRow["unit"] })}>
                        <SelectTrigger className="min-w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="m">m</SelectItem>
                          <SelectItem value="pç">pç</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Select value={r.material} onValueChange={(v) => updateRow(i, { material: v })}>
                        <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BASE_MATERIALS.map((m) => (
                            <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Input type="number" min={0} step="0.001" value={r.kgPerUnit} onChange={(e) => updateRow(i, { kgPerUnit: Number(e.target.value) || 0 })} className="w-28 text-right font-mono" />
                    </td>
                    <td className="p-1">
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => { setDirty((d) => ({ ...d, weights: true })); setRows((rs) => rs.filter((_, j) => j !== i)); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum material. Carregue a tabela do fornecedor ou acrescente linhas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setDirty((d) => ({ ...d, weights: true })); setRows((rs) => [...rs, { ...EMPTY_ROW }]); }}>
              <Plus className="size-4" /> Linha
            </Button>
            <span className="flex-1" />
            <Button onClick={() => void submitWeights()} disabled={busy !== null || !settings}>
              {busy === "weights" && <Loader2 className="size-4 animate-spin" />}
              Publicar tabela e chapas
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
