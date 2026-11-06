import { api } from "@rlpapp/backend/convex/_generated/api";
import { DEFAULT_LABOR_PRICES, LABOR_PRICE_LABELS } from "@rlpapp/shared/takeoff/labor";
import {
  cloneBrand,
  isDiameter,
  type VrfBrand,
  workbookTables,
} from "@rlpapp/shared/takeoff/vrfBrands";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  PublishBar,
  TakeoffPageHeader,
  toNumber,
  toText,
  usePublisher,
} from "@/components/takeoff/painel";
import { VrfBrandEditor } from "@/components/takeoff/vrf-brand-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/takeoff/_painel/vrf")({
  component: () => (
    <AuthShell>
      <VrfPage />
    </AuthShell>
  ),
});

const newId = () => `marca-${Math.random().toString(36).slice(2, 10)}`;

/** Stored brands carry plain strings for the diameters; the editor wants the app's union. */
const fromStored = (b: {
  id: string;
  name: string;
  main: { hp: number; gas: string; liquid: string }[];
  trunk: { hp: number; gas: string; liquid: string }[];
  branch: { hp: number; gas: string; liquid: string }[];
  ykit: { hp: number; model: string }[];
}): VrfBrand => {
  const rows = (list: { hp: number; gas: string; liquid: string }[]) =>
    list.flatMap((r) => (isDiameter(r.gas) && isDiameter(r.liquid) ? [{ hp: r.hp, gas: r.gas, liquid: r.liquid }] : []));
  return { id: b.id, name: b.name, main: rows(b.main), trunk: rows(b.trunk), branch: rows(b.branch), ykit: b.ykit.map((y) => ({ ...y })) };
};

function VrfPage() {
  const settings = useQuery(api.takeoffSettings.get, {});
  const saveVrfBrands = useMutation(api.takeoffSettings.saveVrfBrands);
  const saveLabor = useMutation(api.takeoffSettings.saveLabor);
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const { busy, run } = usePublisher();
  const [labor, setLabor] = useState("");
  const [brands, setBrands] = useState<VrfBrand[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState({ labor: false, brands: false });
  // what is on screen right now: a publish ends the edit only when nothing changed while it ran
  const latest = useRef({ labor, brands });
  latest.current = { labor, brands };
  useEffect(() => {
    if (!settings) return;
    if (!dirty.labor) setLabor(toText(settings.labor?.vrfPerEvap));
    if (!dirty.brands) {
      const list = (settings.vrfBrands ?? []).map(fromStored);
      setBrands(list);
      setSel((s) => (s && list.some((b) => b.id === s) ? s : (list[0]?.id ?? null)));
    }
  }, [settings, dirty]);

  const brand = brands.find((b) => b.id === sel) ?? null;
  const edit = (next: VrfBrand[]) => {
    setDirty((d) => ({ ...d, brands: true }));
    setBrands(next);
  };
  const addBrand = () => {
    const b: VrfBrand = { id: newId(), name: "Nova marca", ...workbookTables(), ykit: [] };
    edit([...brands, b]);
    setSel(b.id);
  };
  const duplicate = () => {
    if (!brand) return;
    const b = { ...cloneBrand(brand), id: newId(), name: `${brand.name} (cópia)` };
    edit([...brands, b]);
    setSel(b.id);
  };
  const remove = () => {
    if (!brand) return;
    if (!window.confirm(`Remover "${brand.name}" dos padrões da empresa?\n\nEla some do app de quem não a alterou na próxima atualização do catálogo.`)) return;
    const rest = brands.filter((b) => b.id !== brand.id);
    edit(rest);
    setSel(rest[0]?.id ?? null);
  };
  const publish = () =>
    run(async () => {
      const sent = JSON.stringify({ labor, brands });
      // the duct labour lives on the Dutos page: it goes back as published
      if (dirty.labor) {
        await saveLabor({ ductPerKg: settings?.labor?.ductPerKg, vrfPerEvap: toNumber(labor) });
      }
      if (dirty.brands) await saveVrfBrands({ brands });
      if (JSON.stringify(latest.current) === sent) setDirty({ labor: false, brands: false });
    }, "Parâmetros de VRF publicados");
  const loadFactory = () =>
    run(() => seedDefaults({ kind: "vrfBrands" }), "Marcas da planilha carregadas");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TakeoffPageHeader
        title="VRF"
        description="Mão de obra e as regras de cada fabricante (bitolas por HP e Y-kits). Vale para o app de todos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Mão de obra</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="labor-vrfPerEvap">Por evaporadora ({LABOR_PRICE_LABELS.vrfPerEvap.unit})</Label>
            <Input
              id="labor-vrfPerEvap"
              type="number"
              min={0}
              step="0.01"
              value={labor}
              placeholder={String(DEFAULT_LABOR_PRICES.vrfPerEvap)}
              onChange={(e) => {
                setDirty((d) => ({ ...d, labor: true }));
                setLabor(e.target.value);
              }}
              className="text-right font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Marcas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1">
              {brands.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSel(b.id)}
                    className={
                      b.id === sel
                        ? "w-full rounded-md bg-muted px-3 py-2 text-left text-sm font-medium"
                        : "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60"
                    }
                  >
                    {b.name || "Marca"}
                    <span className="block text-xs text-muted-foreground">{b.ykit.length} Y-kits</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="outline" size="sm" onClick={addBrand}>
                <Plus className="size-4" /> Nova
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={duplicate} disabled={!brand} aria-label="Duplicar">
                <Copy className="size-4" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={remove} disabled={!brand} aria-label="Remover">
                <Trash2 className="size-4" />
              </Button>
            </div>
            {settings && (settings.vrfBrands?.length ?? 0) === 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => void loadFactory()} disabled={busy}>
                <Download className="size-4" /> Carregar da planilha
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            {brand ? (
              <VrfBrandEditor
                brand={brand}
                onChange={(next) => edit(brands.map((b) => (b.id === next.id ? next : b)))}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {(settings?.vrfBrands?.length ?? 0) === 0
                  ? "Nenhuma marca publicada: carregue as da planilha ou crie uma."
                  : "Selecione ou crie uma marca."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <PublishBar
        dirty={dirty.labor || dirty.brands}
        busy={busy}
        disabled={!settings}
        onPublish={() => void publish()}
        onDiscard={() => setDirty({ labor: false, brands: false })}
      />
    </div>
  );
}
