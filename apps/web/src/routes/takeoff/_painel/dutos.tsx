import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  DEFAULT_DUCT_NORMAS,
  type DuctNormaDefaults,
  NORMA_LABELS,
} from "@rlpapp/shared/engenharia/ducts";
import { DEFAULT_LABOR_PRICES, LABOR_PRICE_LABELS } from "@rlpapp/shared/takeoff/labor";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  PublishBar,
  publishedLine,
  TakeoffPageHeader,
  toNumber,
  toText,
  usePublisher,
} from "@/components/takeoff/painel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/takeoff/_painel/dutos")({
  component: () => (
    <AuthShell>
      <DutosPage />
    </AuthShell>
  ),
});

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** The norma table as edited: every number a text, the four limits apart. */
type NormaForm = {
  norma: 1 | 2 | 3;
  limits: [string, string, string, string];
  insulThickness: string;
  flangeSpacing: string;
  rechapThickness: string;
  sheetSlackPct: string;
  insulSlackPct: string;
  supportsPct: string;
};
const toForm = (n: DuctNormaDefaults): NormaForm => ({
  norma: n.norma,
  limits: [toText(n.gaugeLimits[0]), toText(n.gaugeLimits[1]), toText(n.gaugeLimits[2]), toText(n.gaugeLimits[3])],
  insulThickness: toText(n.insulThickness),
  flangeSpacing: toText(n.flangeSpacing),
  rechapThickness: toText(n.rechapThickness),
  sheetSlackPct: toText(n.sheetSlackPct),
  insulSlackPct: toText(n.insulSlackPct),
  supportsPct: toText(n.supportsPct),
});
const fromForm = (f: NormaForm) => ({
  norma: f.norma,
  gaugeLimits: f.limits.map((t) => toNumber(t) ?? 0),
  insulThickness: toNumber(f.insulThickness) ?? 0,
  flangeSpacing: toNumber(f.flangeSpacing) ?? 0,
  rechapThickness: toNumber(f.rechapThickness) ?? 0,
  sheetSlackPct: toNumber(f.sheetSlackPct) ?? null,
  insulSlackPct: toNumber(f.insulSlackPct) ?? 0,
  supportsPct: toNumber(f.supportsPct) ?? 0,
});

const NORMA_FIELDS: { key: keyof Omit<NormaForm, "norma" | "limits">; label: string; hint?: string }[] = [
  { key: "insulThickness", label: "Isolamento (mm)" },
  { key: "flangeSpacing", label: "Flange a cada (m)" },
  { key: "rechapThickness", label: "Rechapeado (mm)" },
  { key: "sheetSlackPct", label: "Folga chapa %", hint: "vazio = 20 %, ou 15 % acima de 10 000 kg (regra da planilha)" },
  { key: "insulSlackPct", label: "Folga isolamento %" },
  { key: "supportsPct", label: "Suportes % do peso" },
];

function DutosPage() {
  const settings = useQuery(api.takeoffSettings.get, {});
  const saveLabor = useMutation(api.takeoffSettings.saveLabor);
  const saveDuctNormas = useMutation(api.takeoffSettings.saveDuctNormas);
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const { busy, run } = usePublisher();
  const [labor, setLabor] = useState("");
  const [normas, setNormas] = useState<NormaForm[]>([]);
  const [dirty, setDirty] = useState({ labor: false, normas: false });
  const latest = useRef({ labor, normas });
  latest.current = { labor, normas };
  useEffect(() => {
    if (!settings) return;
    if (!dirty.labor) setLabor(toText(settings.labor?.ductPerKg));
    if (!dirty.normas) {
      setNormas(
        (settings.ductNormas ?? []).map((n) =>
          toForm({ ...n, gaugeLimits: [n.gaugeLimits[0] ?? 0, n.gaugeLimits[1] ?? 0, n.gaugeLimits[2] ?? 0, n.gaugeLimits[3] ?? 0] }),
        ),
      );
    }
  }, [settings, dirty]);

  const publish = () =>
    run(async () => {
      const sent = JSON.stringify({ labor, normas });
      // the VRF labour lives on the VRF page: it goes back as published
      if (dirty.labor) {
        await saveLabor({ ductPerKg: toNumber(labor), vrfPerEvap: settings?.labor?.vrfPerEvap });
      }
      if (dirty.normas) await saveDuctNormas({ normas: normas.map(fromForm) });
      if (JSON.stringify(latest.current) === sent) setDirty({ labor: false, normas: false });
    }, "Parâmetros de dutos publicados");
  const loadFactory = () =>
    run(() => seedDefaults({ kind: "ductNormas" }), "Tabela da planilha carregada");

  const editNorma = (i: number, patch: Partial<NormaForm>) => {
    setDirty((d) => ({ ...d, normas: true }));
    setNormas((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  };
  const sheetPrice = settings?.basePrices?.chapa;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TakeoffPageHeader
        title="Dutos"
        description="Mão de obra e parâmetros de cada norma usados no cálculo de dutos (planilha NBR 16401)."
      />

      <Card>
        <CardHeader>
          <CardTitle>Mão de obra</CardTitle>
          <CardDescription>
            Vale em todo takeoff que não fixou o próprio valor.{" "}
            {publishedLine(settings?.meta.labor ?? null, "Ainda não publicada: o app usa o valor da planilha.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="labor-ductPerKg">{LABOR_PRICE_LABELS.ductPerKg.label}</Label>
              <Input
                id="labor-ductPerKg"
                type="number"
                min={0}
                step="0.01"
                value={labor}
                placeholder={`${DEFAULT_LABOR_PRICES.ductPerKg} (planilha)`}
                onChange={(e) => {
                  setDirty((d) => ({ ...d, labor: true }));
                  setLabor(e.target.value);
                }}
                className="text-right font-mono"
              />
              <p className="text-xs text-muted-foreground">{LABOR_PRICE_LABELS.ductPerKg.unit}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium">Chapa galvanizada</span>
              <p className="text-muted-foreground">
                {sheetPrice !== undefined ? `${brl.format(sheetPrice)}/kg` : "Sem preço por kg publicado"}{" "}
                · preço e peso por bitola ficam em{" "}
                <Link to="/takeoff/gerais" className="text-primary underline-offset-2 hover:underline">
                  Gerais e presets
                </Link>
                .
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Parâmetros por norma</CardTitle>
              <CardDescription>
                O maior lado (cm) que cada bitola cobre e as espessuras e folgas de partida. O
                takeoff recebe estes valores ao escolher a norma e pode ajustá-los ali.{" "}
                {publishedLine(settings?.meta.ductNormas ?? null, "Ainda não publicados: o app usa a tabela da planilha.")}
              </CardDescription>
            </div>
            {settings && normas.length === 0 && (
              <Button variant="outline" onClick={() => void loadFactory()} disabled={busy}>
                <Download className="size-4" /> Carregar tabela da planilha
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {normas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma norma publicada. Carregue a tabela da planilha para editá-la (
              {DEFAULT_DUCT_NORMAS.map((n) => NORMA_LABELS[n.norma]).join(", ")}).
            </p>
          )}
          {normas.map((n, i) => (
            <div key={n.norma} className="space-y-3 rounded-md border border-control-border p-4">
              <div className="font-medium">{NORMA_LABELS[n.norma]}</div>
              <div>
                <Label className="mb-2 block">Lado maior máximo por bitola (cm)</Label>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(["# 26", "# 24", "# 22", "# 20"] as const).map((gauge, g) => (
                    <div key={gauge} className="space-y-1">
                      <span className="font-mono text-xs text-muted-foreground">{gauge}</span>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={n.limits[g]}
                        aria-label={`Lado maior máximo ${gauge}, ${NORMA_LABELS[n.norma]}`}
                        onChange={(e) => {
                          const limits = [...n.limits] as NormaForm["limits"];
                          limits[g] = e.target.value;
                          editNorma(i, { limits });
                        }}
                        className="text-right font-mono"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Acima do último limite, # 18.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {NORMA_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`norma-${n.norma}-${f.key}`}>{f.label}</Label>
                    <Input
                      id={`norma-${n.norma}-${f.key}`}
                      type="number"
                      min={0}
                      step="any"
                      value={n[f.key]}
                      placeholder={f.key === "sheetSlackPct" ? "auto" : undefined}
                      title={f.hint}
                      onChange={(e) => editNorma(i, { [f.key]: e.target.value })}
                      className="text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PublishBar
        dirty={dirty.labor || dirty.normas}
        busy={busy}
        disabled={!settings}
        onPublish={() => void publish()}
        onDiscard={() => setDirty({ labor: false, normas: false })}
      />
    </div>
  );
}
