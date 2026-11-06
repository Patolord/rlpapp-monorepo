import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  DEFAULT_DUCT_NORMAS,
  type DuctNormaDefaults,
  NORMA_LABELS,
} from "@rlpapp/shared/engenharia/ducts";
import { DEFAULT_LABOR_PRICES, LABOR_PRICE_LABELS } from "@rlpapp/shared/takeoff/labor";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  PublishBar,
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

const GAUGE_COLUMNS = ["# 26", "# 24", "# 22", "# 20"] as const;
const NORMA_FIELDS: { key: keyof Omit<NormaForm, "norma" | "limits">; label: string; hint?: string }[] = [
  { key: "insulThickness", label: "Isol. mm" },
  { key: "flangeSpacing", label: "Flange m" },
  { key: "rechapThickness", label: "Rechap. mm" },
  { key: "sheetSlackPct", label: "Folga chapa %", hint: "vazio = 20 %, ou 15 % acima de 10 000 kg (regra da planilha)" },
  { key: "insulSlackPct", label: "Folga isol. %" },
  { key: "supportsPct", label: "Suportes %" },
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
  const cell = "w-20 text-right font-mono";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TakeoffPageHeader title="Dutos" description="Mão de obra e parâmetros por norma (NBR 16401). Vale para o app de todos." />

      <Card>
        <CardHeader>
          <CardTitle>Mão de obra</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="labor-ductPerKg">Por kg de chapa ({LABOR_PRICE_LABELS.ductPerKg.unit})</Label>
            <Input
              id="labor-ductPerKg"
              type="number"
              min={0}
              step="0.01"
              value={labor}
              placeholder={String(DEFAULT_LABOR_PRICES.ductPerKg)}
              onChange={(e) => {
                setDirty((d) => ({ ...d, labor: true }));
                setLabor(e.target.value);
              }}
              className="text-right font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Parâmetros por norma</CardTitle>
              <CardDescription>Lado maior máximo (cm) de cada bitola; acima do último, # 18.</CardDescription>
            </div>
            {settings && normas.length === 0 && (
              <Button variant="outline" onClick={() => void loadFactory()} disabled={busy}>
                <Download className="size-4" /> Carregar da planilha
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {normas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma norma publicada: o app usa a tabela da planilha (
              {DEFAULT_DUCT_NORMAS.map((n) => NORMA_LABELS[n.norma]).join(", ")}).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Norma</th>
                    {GAUGE_COLUMNS.map((g) => (
                      <th key={g} className="px-1 py-1.5 text-right font-mono font-medium">
                        {g}
                      </th>
                    ))}
                    {NORMA_FIELDS.map((f) => (
                      <th key={f.key} className="px-1 py-1.5 text-right font-medium" title={f.hint}>
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {normas.map((n, i) => (
                    <tr key={n.norma} className="border-t border-control-border">
                      <td className="whitespace-nowrap py-1 pr-2 font-medium">{NORMA_LABELS[n.norma]}</td>
                      {GAUGE_COLUMNS.map((gauge, g) => (
                        <td key={gauge} className="px-1 py-1">
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
                            className={cell}
                          />
                        </td>
                      ))}
                      {NORMA_FIELDS.map((f) => (
                        <td key={f.key} className="px-1 py-1">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={n[f.key]}
                            placeholder={f.key === "sheetSlackPct" ? "auto" : undefined}
                            title={f.hint}
                            aria-label={`${f.label}, ${NORMA_LABELS[n.norma]}`}
                            onChange={(e) => editNorma(i, { [f.key]: e.target.value })}
                            className={cell}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
