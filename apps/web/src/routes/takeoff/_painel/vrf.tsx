import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  cloneBrand,
  isDiameter,
  type VrfBrand,
  workbookTables,
} from "@rlpapp/shared/takeoff/vrfBrands";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Copy, Download, Loader2, Monitor, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { VrfBrandEditor } from "@/components/takeoff/vrf-brand-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/takeoff/_painel/vrf")({
  component: () => (
    <AuthShell>
      <VrfPage />
    </AuthShell>
  ),
});

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

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
  const seedDefaults = useMutation(api.takeoffSettings.seedDefaults);
  const [brands, setBrands] = useState<VrfBrand[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // what is on screen right now: a save ends the edit only when nothing changed while it ran
  const latest = useRef(brands);
  latest.current = brands;
  useEffect(() => {
    if (!settings || dirty) return;
    const list = (settings.vrfBrands ?? []).map(fromStored);
    setBrands(list);
    setSel((s) => (s && list.some((b) => b.id === s) ? s : (list[0]?.id ?? null)));
  }, [settings, dirty]);

  const brand = brands.find((b) => b.id === sel) ?? null;
  const edit = (next: VrfBrand[]) => {
    setDirty(true);
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
  const submit = async () => {
    setBusy("save");
    try {
      const sent = JSON.stringify(brands);
      await saveVrfBrands({ brands });
      if (JSON.stringify(latest.current) === sent) setDirty(false);
      toast.success("Marcas de VRF publicadas");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar as marcas"));
    } finally {
      setBusy(null);
    }
  };
  const loadFactory = async () => {
    setBusy("seed");
    try {
      await seedDefaults({ kind: "vrfBrands" });
      toast.success("Marcas da planilha carregadas");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível carregar as marcas"));
    } finally {
      setBusy(null);
    }
  };
  const meta = settings?.meta.vrfBrands ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Marcas VRF</h1>
          <p className="text-sm text-muted-foreground">
            Regras de cada fabricante para a ferramenta VRF (Y) do RLP Takeoff: bitolas de gás e
            líquido por HP, por papel do trecho, e modelos de Y-kit pela capacidade a jusante.
          </p>
        </div>
        <div className="flex gap-2">
          {settings && settings.vrfBrands === null && (
            <Button variant="outline" onClick={() => void loadFactory()} disabled={busy !== null}>
              <Download className="size-4" /> Carregar marcas da planilha
            </Button>
          )}
          <Button onClick={() => void submit()} disabled={busy !== null || !settings || !dirty}>
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}
            Publicar marcas
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border border-status-info/30 bg-card px-4 py-3 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-status-info" />
        <p>
          <span className="font-medium">Reflete no app desktop de todos os usuários</span> na
          próxima atualização do catálogo. Cada usuário pode editar, remover ou criar marcas no
          próprio computador; o que ele alterou lá não é substituído por mudanças feitas aqui.
          {meta
            ? ` Atualizado em ${dateFormat.format(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""}.`
            : " Ainda não publicado: o app usa as marcas da planilha Levantamento VRF embutidas nele."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Marcas</CardTitle>
            <CardDescription>{brands.length} {brands.length === 1 ? "marca" : "marcas"}</CardDescription>
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
                {settings?.vrfBrands === null
                  ? "Nenhuma marca publicada: carregue as da planilha ou crie uma."
                  : "Selecione ou crie uma marca."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
