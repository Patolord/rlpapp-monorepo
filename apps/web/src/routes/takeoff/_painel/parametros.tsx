import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  DEFAULT_DUCT_NORMAS,
  type DuctNormaDefaults,
  NORMA_LABELS,
} from "@rlpapp/shared/engenharia/ducts";
import {
  DEFAULT_LABOR_PRICES,
  LABOR_PRICE_KEYS,
  LABOR_PRICE_LABELS,
  type LaborPriceKey,
} from "@rlpapp/shared/takeoff/labor";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download, Loader2, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/takeoff/_painel/parametros")({
  component: () => (
    <AuthShell>
      <ParametrosPage />
    </AuthShell>
  ),
});

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const updatedLine = (meta: { updatedAt: number; updatedBy: string | null } | null) =>
  meta
    ? ` Atualizado em ${dateFormat.format(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""}.`
    : "";

type Texts = Record<string, string>;
const toText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const toNumber = (t: string): number | undefined => {
  const n = Number(t.replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

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

function ParametrosPage() {
  const settings = useQuery(api.takeoffSettings.get, {});
  const saveLabor = useMutation(api.takeoffSettings.saveLabor);
  const saveDuctNormas = useMutation(api.takeoffSettings.saveDuctNormas);
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const [labor, setLabor] = useState<Texts>({});
  const [normas, setNormas] = useState<NormaForm[]>([]);
  const [dirty, setDirty] = useState({ labor: false, normas: false });
  const [busy, setBusy] = useState<string | null>(null);
  const latest = useRef({ labor, normas });
  latest.current = { labor, normas };
  useEffect(() => {
    if (!settings) return;
    if (!dirty.labor) {
      setLabor(Object.fromEntries(LABOR_PRICE_KEYS.map((k) => [k, toText(settings.labor?.[k])])));
    }
    if (!dirty.normas) {
      const published = settings.ductNormas ?? [];
      setNormas(
        published.length > 0
          ? published.map((n) => toForm({ ...n, gaugeLimits: [n.gaugeLimits[0] ?? 0, n.gaugeLimits[1] ?? 0, n.gaugeLimits[2] ?? 0, n.gaugeLimits[3] ?? 0] }))
          : [],
      );
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
  const submitLabor = () =>
    run("labor", async () => {
      const sent = JSON.stringify(labor);
      await saveLabor({
        ductPerKg: toNumber(labor.ductPerKg ?? ""),
        vrfPerEvap: toNumber(labor.vrfPerEvap ?? ""),
      });
      if (JSON.stringify(latest.current.labor) === sent) setDirty((d) => ({ ...d, labor: false }));
    }, "Mão de obra publicada");
  const submitNormas = () =>
    run("normas", async () => {
      const sent = JSON.stringify(normas);
      await saveDuctNormas({ normas: normas.map(fromForm) });
      if (JSON.stringify(latest.current.normas) === sent) setDirty((d) => ({ ...d, normas: false }));
    }, "Parâmetros das normas publicados");
  const loadFactory = () =>
    run("seed", () => seedDefaults({ kind: "ductNormas" }), "Tabela da planilha carregada");

  const editLabor = (key: LaborPriceKey, value: string) => {
    setDirty((d) => ({ ...d, labor: true }));
    setLabor((l) => ({ ...l, [key]: value }));
  };
  const editNorma = (i: number, patch: Partial<NormaForm>) => {
    setDirty((d) => ({ ...d, normas: true }));
    setNormas((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Parâmetros</h1>
        <p className="text-sm text-muted-foreground">
          Mão de obra global e os parâmetros de dutos de cada norma, como o RLP Takeoff os recebe.
        </p>
      </div>

      <div className="flex gap-3 rounded-lg border border-status-info/30 bg-card px-4 py-3 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-status-info" />
        <p>
          <span className="font-medium">Reflete no app desktop de todos os usuários</span> na
          próxima atualização do catálogo. A mão de obra vale em todo takeoff que não fixou o
          próprio valor; os parâmetros de uma norma entram no takeoff quando o usuário escolhe a
          norma, e ele pode ajustá-los ali. Um campo vazio deixa valer o valor da planilha
          embutida no app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mão de obra</CardTitle>
          <CardDescription>
            Preços globais de instalação usados pelos cálculos de dutos e de VRF.
            {updatedLine(settings?.meta.labor ?? null) || " Ainda não publicado: o app usa os valores da planilha."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {LABOR_PRICE_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`labor-${key}`}>{LABOR_PRICE_LABELS[key].label}</Label>
                <Input
                  id={`labor-${key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={labor[key] ?? ""}
                  placeholder={`${DEFAULT_LABOR_PRICES[key]} (planilha)`}
                  onChange={(e) => editLabor(key, e.target.value)}
                  className="text-right font-mono"
                />
                <p className="text-xs text-muted-foreground">{LABOR_PRICE_LABELS[key].unit}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => void submitLabor()} disabled={busy !== null || !settings}>
            {busy === "labor" && <Loader2 className="size-4 animate-spin" />}
            Publicar mão de obra
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Dutos por norma</CardTitle>
              <CardDescription>
                Para cada norma, o maior lado (cm) que cada bitola de chapa cobre e as espessuras e
                folgas de partida. O cálculo segue a planilha NBR 16401.
                {updatedLine(settings?.meta.ductNormas ?? null) || " Ainda não publicado: o app usa a tabela da planilha."}
              </CardDescription>
            </div>
            {settings && normas.length === 0 && (
              <Button variant="outline" onClick={() => void loadFactory()} disabled={busy !== null}>
                <Download className="size-4" /> Carregar tabela da planilha
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
          {normas.length > 0 && (
            <Button onClick={() => void submitNormas()} disabled={busy !== null || !settings}>
              {busy === "normas" && <Loader2 className="size-4 animate-spin" />}
              Publicar parâmetros das normas
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
