import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { catalogProductName, sortKitComponents } from "@rlpapp/shared/takeoff/kitCatalog";
import type { KitComponent, KitMode } from "@rlpapp/shared/takeoff/kits";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** O que o formulário edita (mesma forma de `takeoffKits.save`). */
export interface KitDraft {
  id?: Id<"takeoffKits">;
  name: string;
  mode: KitMode;
  label: string;
  components: KitComponent[];
}

export const EMPTY_COMPONENT: KitComponent = {
  name: "",
  group: "",
  kind: "linear",
  factor: 1,
};

export const emptyKitDraft = (): KitDraft => ({
  name: "",
  mode: "linear",
  label: "",
  components: [{ ...EMPTY_COMPONENT }],
});

// Mesmas sugestões do app desktop (apps/takeoff/src/lib/types.ts).
const GROUP_SUGGESTIONS = [
  "Equipamentos",
  "Rede de Dutos",
  "Bocas de Ar",
  "Tubulações",
  "Isolamento",
  "Elétrica",
  "Detecção",
  "Acessórios",
  "Mão de Obra",
  "Geral",
];
const DISCIPLINE_SUGGESTIONS = [
  "AC Áreas Comuns",
  "AC com Equip",
  "Infra AC",
  "Exaustão",
  "Pressurização de Escadas",
  "TAE (Tomada de Ar Externo)",
  "Detecção de Incêndio",
];

const KIND_LABEL: Record<KitMode, Record<KitComponent["kind"], string>> = {
  linear: { linear: "linear (m)", count: "por trecho (pç)", area: "área (m²)" },
  count: { count: "contagem (pç)", linear: "linear (m por clique)", area: "área (m²)" },
};

/** Chave de comparação de nomes: sem acentos, minúsculas, espaços simples. */
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Cria ou edita um kit padrão da empresa. Escolher um material do catálogo de
 * compras ("família — variante") grava o código MAT dele no componente: o app
 * desktop liga o item àquele material (preço e cotação) mesmo que o nome mude
 * depois. Um nome fora do catálogo é um item próprio, sem código, que o app
 * busca pelo nome. Ao salvar, cobre, isolamento e cabo ficam nessa ordem, por
 * bitola crescente.
 */
export function KitFormDialog({
  draft,
  onClose,
}: {
  /** null = fechado. */
  draft: KitDraft | null;
  onClose: () => void;
}) {
  const save = useMutation(api.takeoffKits.save);
  const catalog = useQuery(api.takeoffCatalog.current, draft ? {} : "skip");
  const [form, setForm] = useState<KitDraft>(emptyKitDraft);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (draft) {
      setForm({ ...draft, components: draft.components.map((c) => ({ ...c })) });
      setSaving(false);
    }
  }, [draft]);

  // nomes como o app desktop os vê: "família — variante" para materiais com variante,
  // e o código de cada um (o primeiro, se dois materiais tiverem o mesmo nome)
  const { names, skuByName, nameBySku } = useMemo(() => {
    const skuByName = new Map<string, string>();
    const nameBySku = new Map<string, string>();
    const out = new Set<string>();
    for (const item of catalog?.items ?? []) {
      if (item.status === "archived") continue;
      const name = catalogProductName(item);
      out.add(name);
      if (item.sku) {
        const key = foldName(name);
        if (!skuByName.has(key)) skuByName.set(key, item.sku);
        nameBySku.set(item.sku.toUpperCase(), name);
      }
    }
    return {
      names: [...out].sort((a, b) => a.localeCompare(b, "pt-BR")),
      skuByName,
      nameBySku,
    };
  }, [catalog]);
  /** O nome escolhido decide o código: o do material do catálogo, nenhum num item próprio. */
  const setComponentName = (i: number, name: string) =>
    updateComp(i, { name, sku: skuByName.get(foldName(name)) });

  const update = (patch: Partial<KitDraft>) => setForm((f) => ({ ...f, ...patch }));
  const updateComp = (i: number, patch: Partial<KitComponent>) =>
    setForm((f) => ({
      ...f,
      components: f.components.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  const setMode = (mode: KitMode) =>
    setForm((f) => ({
      ...f,
      mode,
      // o tipo de medida que faz sentido muda com o modo; "área" fica
      components: f.components.map((c) =>
        c.kind === "area" ? c : { ...c, kind: mode === "count" ? "count" : "linear" },
      ),
    }));

  const submit = async () => {
    setSaving(true);
    try {
      await save({
        id: form.id,
        name: form.name,
        mode: form.mode,
        label: form.label.trim() ? form.label.trim() : undefined,
        components: sortKitComponents(form.components.filter((c) => c.name.trim())).map(
          (c) => ({
            name: c.name,
            sku: c.sku?.trim() ? c.sku : undefined,
            group: c.group,
            system: c.system?.trim() ? c.system : undefined,
            kind: c.kind,
            factor: c.factor,
          }),
        ),
      });
      toast.success(form.id ? "Kit atualizado" : "Kit criado");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o kit"));
      setSaving(false);
    }
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar kit" : "Novo kit"}</DialogTitle>
          <DialogDescription>
            {form.mode === "count"
              ? "Um clique no desenho coloca todos os componentes, agrupados; os lineares somam o comprimento por clique."
              : "Um trecho desenhado cria todos os componentes, agrupados; o fator multiplica a medida."}
          </DialogDescription>
        </DialogHeader>

        <datalist id="takeoff-kit-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="takeoff-kit-groups">
          {GROUP_SUGGESTIONS.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <datalist id="takeoff-kit-systems">
          {DISCIPLINE_SUGGESTIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-[1fr_12rem_14rem]">
          <div className="space-y-1.5">
            <Label htmlFor="kit-name">Nome</Label>
            <Input
              id="kit-name"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="ex.: 12.000 Inverter"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.mode} onValueChange={(v) => setMode(v as KitMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear (trecho)</SelectItem>
                <SelectItem value="count">Contagem (clique)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-label">Rótulo no desenho</Label>
            <Input
              id="kit-label"
              value={form.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder={form.mode === "count" ? "ex.: VE-01 · 1.200 m³/h" : 'ex.: 1/4" · 3/8"'}
              title="Texto antes da quantidade em cada trecho ou peça deste kit; vazio = sem rótulo"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Componentes</Label>
          <div className="overflow-x-auto rounded-md border border-control-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Material (nome no app)</th>
                  <th
                    className="px-2 py-1.5 text-left font-medium"
                    title="Código do material no catálogo de compras; vazio = item próprio"
                  >
                    Código
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">Grupo</th>
                  <th className="px-2 py-1.5 text-left font-medium">Disciplina</th>
                  <th className="px-2 py-1.5 text-left font-medium">Medida</th>
                  <th
                    className="px-2 py-1.5 text-left font-medium"
                    title={
                      form.mode === "count"
                        ? "Quantidade (pç) ou comprimento (m) colocado por clique"
                        : "Multiplicador da medida (2 para um cabo que vai e volta)"
                    }
                  >
                    {form.mode === "count" ? "Qtd / compr." : "Fator"}
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {form.components.map((c, i) => (
                  <tr key={i} className="border-t border-control-border">
                    <td className="p-1">
                      <Input
                        list="takeoff-kit-names"
                        value={c.name}
                        onChange={(e) => setComponentName(i, e.target.value)}
                        placeholder='ex.: Tubulação de Cobre — 1/4"'
                        className="min-w-56"
                      />
                    </td>
                    <td className="whitespace-nowrap p-1 font-mono text-xs">
                      {c.sku ? (
                        <SkuCell
                          sku={c.sku}
                          catalogName={
                            catalog ? (nameBySku.get(c.sku.toUpperCase()) ?? null) : undefined
                          }
                        />
                      ) : (
                        <span className="text-muted-foreground" title="Item próprio, fora do catálogo de compras">
                          próprio
                        </span>
                      )}
                    </td>
                    <td className="p-1">
                      <Input
                        list="takeoff-kit-groups"
                        value={c.group}
                        onChange={(e) => updateComp(i, { group: e.target.value })}
                        placeholder="Geral"
                        className="min-w-32"
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        list="takeoff-kit-systems"
                        value={c.system ?? ""}
                        onChange={(e) => updateComp(i, { system: e.target.value })}
                        className="min-w-36"
                      />
                    </td>
                    <td className="p-1">
                      <Select
                        value={c.kind}
                        onValueChange={(v) => updateComp(i, { kind: v as KitComponent["kind"] })}
                      >
                        <SelectTrigger className="min-w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(KIND_LABEL[form.mode]) as KitComponent["kind"][]).map(
                            (kind) => (
                              <SelectItem key={kind} value={kind}>
                                {KIND_LABEL[form.mode][kind]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={c.factor}
                        onChange={(e) => updateComp(i, { factor: Number(e.target.value) })}
                        className="w-24 text-right font-mono"
                      />
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          update({ components: form.components.filter((_, j) => j !== i) })
                        }
                        aria-label="Remover componente"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update({
                components: [
                  ...form.components,
                  { ...EMPTY_COMPONENT, kind: form.mode === "count" ? "count" : "linear" },
                ],
              })
            }
          >
            <Plus className="size-4" /> Componente
          </Button>
          <p className="text-xs text-muted-foreground">
            Escolha o material na lista do catálogo de compras (&ldquo;família — variante&rdquo;)
            para gravar o código dele: o app liga o item àquele material, com preço e cotação,
            mesmo que o nome mude. Um nome fora do catálogo é um item próprio, buscado pelo nome
            no catálogo do app (sem preço se não existir lá). Ao salvar, cobre, isolamento e cabo
            ficam nessa ordem, por bitola crescente.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {form.id ? "Salvar" : "Criar kit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O código de um componente; em destaque quando o catálogo de compras não o
 * tem mais. `catalogName`: undefined enquanto o catálogo carrega, null se o
 * código não está lá.
 */
function SkuCell({ sku, catalogName }: { sku: string; catalogName: string | null | undefined }) {
  if (catalogName === null) {
    return (
      <span className="text-status-warning" title="Código que o catálogo de compras não tem mais">
        {sku}
      </span>
    );
  }
  return <span title={catalogName ? `No catálogo: ${catalogName}` : undefined}>{sku}</span>;
}
