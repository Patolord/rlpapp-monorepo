import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { kindForUnit, mergeCatalog, normalizeDiscipline } from "../lib/catalog";
import {
  cloneKit,
  type Kit,
  type KitComponent,
  type KitOrigin,
  kitDefaults,
  kitMode,
  kitOrigin,
  normalizeKitSku,
} from "../lib/kits";
import { foldName } from "../lib/text";
import { DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS, newId } from "../lib/types";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

const EMPTY_COMPONENT: KitComponent = { name: "", group: "", kind: "linear", factor: 1 };

const ORIGIN_LABEL: Record<KitOrigin, { text: string; title: string; className: string }> = {
  default: {
    text: "padrão",
    title: "Igual ao padrão da empresa: segue as atualizações publicadas no app da empresa",
    className: "text-neutral-500",
  },
  modified: {
    text: "modificado aqui",
    title:
      "Versão deste computador de um padrão da empresa: atualizações do padrão não a substituem",
    className: "text-orange-300",
  },
  local: {
    text: "só aqui",
    title: "Preset criado neste computador; a empresa não o tem",
    className: "text-sky-300",
  },
};

/**
 * Create and edit kit presets. The list starts as the company defaults (published with the
 * catalog, edited in the dashboard's "App Takeoff" section); what the user changes here is kept
 * on this machine as an override and survives every catalog refresh.
 */
export function KitsDialog() {
  const open = useStore((s) => s.kitsEditorOpen);
  const stored = useStore((s) => s.catalog.kits);
  const catalog = useStore((s) => s.catalog);
  const defaults = useMemo(() => kitDefaults(catalog.remoteKits), [catalog.remoteKits]);
  const published = catalog.remoteKits !== null && catalog.remoteKits.length > 0;
  const unit = useStore((s) => s.project.unit);
  const { setKitsEditorOpen, saveKits, setActiveKit } = useStore.getState();
  const [kits, setKits] = useState<Kit[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      const copy = stored.map((k) => ({ ...k, components: k.components.map((c) => ({ ...c })) }));
      setKits(copy);
      setSel(copy[0]?.id ?? null);
    }
  }, [open, stored]);
  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const names = useMemo(() => entries.map((e) => e.name), [entries]);
  if (!open) return null;

  const kit = kits.find((k) => k.id === sel) ?? null;
  const origin = kit ? kitOrigin(defaults, kit) : null;
  const hiddenDefaults = defaults.filter((d) => !kits.some((k) => k.id === d.id));
  /** Put the selected kit back as the company publishes it. */
  const restore = () => {
    if (!kit) return;
    const d = defaults.find((k) => k.id === kit.id);
    if (d) setKits((ks) => ks.map((k) => (k.id === kit.id ? cloneKit(d) : k)));
  };
  /** Bring back the defaults removed on this machine. */
  const restoreHidden = () => {
    setKits((ks) => [...ks, ...hiddenDefaults.map(cloneKit)]);
  };
  const update = (patch: Partial<Kit>) =>
    setKits((ks) => ks.map((k) => (k.id === sel ? { ...k, ...patch } : k)));
  const updateComp = (i: number, patch: Partial<KitComponent>) => {
    if (!kit) return;
    const components = kit.components.map((c, j) => (j === i ? { ...c, ...patch } : c));
    update({ components });
  };
  /**
   * When a catalog name is picked, take its group, discipline and unit kind, and the code of a
   * company material (so the kit keeps finding it if purchasing renames it).
   */
  const fillFromCatalog = (i: number, name: string) => {
    const e = entries.find((x) => foldName(x.name) === foldName(name));
    if (!e || !kit) return;
    const c = kit.components[i];
    const sku = e.source === "remote" ? normalizeKitSku(e.sku) : undefined;
    updateComp(i, {
      ...(sku ? { sku } : {}),
      group: c.group || e.group,
      system: c.system || normalizeDiscipline(e.system),
      kind: kindForUnit(e.unit),
    });
  };
  const addKit = () => {
    const k: Kit = { id: newId(), name: "Novo preset", components: [{ ...EMPTY_COMPONENT }] };
    setKits((ks) => [...ks, k]);
    setSel(k.id);
  };
  const duplicate = () => {
    if (!kit) return;
    const k: Kit = {
      ...kit,
      id: newId(),
      name: `${kit.name} (cópia)`,
      components: kit.components.map((c) => ({ ...c })),
    };
    setKits((ks) => [...ks, k]);
    setSel(k.id);
  };
  const remove = () => {
    if (!kit) return;
    const rest = kits.filter((k) => k.id !== kit.id);
    setKits(rest);
    setSel(rest[0]?.id ?? null);
  };
  const save = () => {
    const clean = kits
      .map((k) => ({
        ...k,
        name: k.name.trim() || "Preset",
        // "" (cleared) is kept: it stops a seed kit from taking its seed's label back
        ...(k.label !== undefined ? { label: k.label.trim() } : {}),
        components: k.components
          .filter((c) => c.name.trim())
          .map((c) => ({
            ...c,
            name: c.name.trim(),
            group: c.group.trim() || "Geral",
            system: c.system?.trim() || undefined,
            factor: Number.isFinite(c.factor) && c.factor > 0 ? c.factor : 1,
          })),
      }))
      .filter((k) => k.components.length > 0);
    void saveKits(clean);
    if (clean.length > 0 && !clean.some((k) => k.id === useStore.getState().activeKitId)) {
      setActiveKit(clean[0].id);
    }
    setKitsEditorOpen(false);
  };

  const input =
    "h-7 rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none";

  return (
    <Dialog
      title="Presets de kit"
      onClose={() => setKitsEditorOpen(false)}
      className="h-[32rem] w-[62rem]"
      bodyClassName="flex"
    >
      <datalist id="kit-catalog-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="kit-groups">
        {GROUP_SUGGESTIONS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <datalist id="kit-systems">
        {DISCIPLINE_SUGGESTIONS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <div className="flex w-56 shrink-0 flex-col border-r border-neutral-800">
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {kits.map((k) => {
            const from = kitOrigin(defaults, k);
            const o = ORIGIN_LABEL[from];
            return (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setSel(k.id)}
                  className={
                    k.id === sel
                      ? "w-full bg-orange-500/10 px-3 py-1.5 text-left text-xs font-medium text-orange-300"
                      : "w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  }
                >
                  {k.name || "Preset"}
                  <span className="block truncate text-[11px] font-normal text-neutral-500">
                    {k.components.length} {k.components.length === 1 ? "componente" : "componentes"}
                    {k.label?.trim() ? ` · ${k.label.trim()}` : ""}
                    {from !== "default" && (
                      <span className={o.className} title={o.title}>
                        {" "}
                        · {o.text}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {hiddenDefaults.length > 0 && (
          <button
            type="button"
            onClick={restoreHidden}
            className="border-t border-neutral-800 px-3 py-1.5 text-left text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            title={hiddenDefaults.map((d) => d.name).join(", ")}
          >
            <RotateCcw size={11} className="mr-1 inline" />
            {hiddenDefaults.length === 1
              ? "Trazer de volta 1 padrão removido"
              : `Trazer de volta ${hiddenDefaults.length} padrões removidos`}
          </button>
        )}
        <div className="flex gap-1 border-t border-neutral-800 p-2">
          <Button onClick={addKit} title="Novo preset">
            <Plus size={14} /> Novo
          </Button>
          <Button onClick={duplicate} disabled={!kit} title="Duplicar o preset selecionado">
            <Copy size={14} />
          </Button>
          <Button onClick={remove} disabled={!kit} title="Excluir o preset selecionado">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {kit ? (
          <>
            <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
              <span className="text-xs text-neutral-400">Nome</span>
              <input
                value={kit.name}
                onChange={(e) => update({ name: e.target.value })}
                className={`${input} min-w-0 flex-1 text-sm`}
                placeholder="ex.: 12.000 Inverter"
              />
              <label className="flex items-center gap-1 text-xs text-neutral-400">
                Tipo
                <select
                  value={kitMode(kit)}
                  onChange={(e) => update({ mode: e.target.value as Kit["mode"] })}
                  className={input}
                  title="Linear: desenha-se um trecho · Contagem: um clique coloca o conjunto"
                >
                  <option value="linear">Linear (trecho)</option>
                  <option value="count">Contagem (clique)</option>
                </select>
              </label>
              <label
                className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-400"
                title="Texto mostrado no desenho e no relatório antes da quantidade de cada trecho ou peça deste kit; alterar aqui atualiza os já desenhados. Vazio: sem rótulo"
              >
                Rótulo no desenho
                <input
                  value={kit.label ?? ""}
                  onChange={(e) => update({ label: e.target.value })}
                  className={`${input} w-44`}
                  placeholder={
                    kitMode(kit) === "count" ? "ex.: VE-01 · 1.200 m³/h" : 'ex.: 1/4" · 3/8"'
                  }
                />
              </label>
            </div>
            <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
              <span className="min-w-0 flex-1">
                {kitMode(kit) === "count"
                  ? "Um clique coloca todos os componentes, agrupados; os lineares somam o comprimento por clique"
                  : "Um trecho desenhado cria todos os componentes abaixo, agrupados"}
              </span>
              {origin && (
                <span className={ORIGIN_LABEL[origin].className} title={ORIGIN_LABEL[origin].title}>
                  {ORIGIN_LABEL[origin].text}
                </span>
              )}
              {origin === "modified" && (
                <button
                  type="button"
                  onClick={restore}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-800"
                  title="Descartar as alterações deste computador e voltar ao padrão da empresa"
                >
                  <RotateCcw size={11} /> Restaurar padrão
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-auto px-3 py-2">
              <table className="w-full text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="pb-1 text-left font-medium">Material (nome do catálogo)</th>
                    <th className="pb-1 text-left font-medium">Grupo</th>
                    <th className="pb-1 text-left font-medium">Disciplina</th>
                    <th className="pb-1 text-left font-medium">Tipo</th>
                    <th
                      className="pb-1 text-left font-medium"
                      title={
                        kitMode(kit) === "count"
                          ? `Quantidade (pç) ou comprimento (${unit}) colocado por clique`
                          : "Multiplicador da medida"
                      }
                    >
                      {kitMode(kit) === "count" ? "Qtd / compr." : "Fator"}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {kit.components.map((c, i) => (
                    <tr key={i}>
                      <td className="py-0.5 pr-1">
                        <input
                          list="kit-catalog-names"
                          value={c.name}
                          // a new name drops the code; picking a catalog material sets it again
                          onChange={(e) => updateComp(i, { name: e.target.value, sku: undefined })}
                          onBlur={(e) => fillFromCatalog(i, e.target.value)}
                          title={
                            c.sku
                              ? `Material ${c.sku} do catálogo da empresa`
                              : "Item próprio: sem código do catálogo, buscado pelo nome"
                          }
                          className={`${input} w-full`}
                          placeholder='ex.: Tubulação de Cobre 1/4"'
                        />
                      </td>
                      <td className="py-0.5 pr-1">
                        <input
                          list="kit-groups"
                          value={c.group}
                          onChange={(e) => updateComp(i, { group: e.target.value })}
                          className={`${input} w-32`}
                        />
                      </td>
                      <td className="py-0.5 pr-1">
                        <input
                          list="kit-systems"
                          value={c.system ?? ""}
                          onChange={(e) => updateComp(i, { system: e.target.value })}
                          className={`${input} w-36`}
                        />
                      </td>
                      <td className="py-0.5 pr-1">
                        {kitMode(kit) === "count" ? (
                          <select
                            value={c.kind}
                            onChange={(e) =>
                              updateComp(i, { kind: e.target.value as KitComponent["kind"] })
                            }
                            className={input}
                            title="Contagem coloca peças por clique; linear soma um comprimento fixo por clique"
                          >
                            <option value="count">contagem (pç)</option>
                            <option value="linear">linear ({unit} por clique)</option>
                          </select>
                        ) : (
                          <select
                            value={c.kind}
                            onChange={(e) =>
                              updateComp(i, { kind: e.target.value as KitComponent["kind"] })
                            }
                            className={input}
                            title="Linear acompanha o trecho; contagem entra uma vez por trecho"
                          >
                            <option value="linear">linear ({unit})</option>
                            <option value="count">por trecho (pç)</option>
                          </select>
                        )}
                      </td>
                      <td className="py-0.5 pr-1">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={c.factor}
                          onChange={(e) => updateComp(i, { factor: Number(e.target.value) })}
                          className={`${input} w-16 text-right font-mono`}
                          title={
                            kitMode(kit) === "linear"
                              ? "Ex.: 2 para um cabo que vai e volta"
                              : c.kind === "linear"
                                ? `Comprimento (${unit}) somado a cada clique`
                                : "Peças colocadas a cada clique"
                          }
                        />
                      </td>
                      <td className="py-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            update({ components: kit.components.filter((_, j) => j !== i) })
                          }
                          className="rounded p-0.5 text-neutral-500 hover:text-red-400"
                          aria-label="Remover componente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button
                className="mt-2"
                onClick={() =>
                  update({
                    components: [
                      ...kit.components,
                      { ...EMPTY_COMPONENT, kind: kitMode(kit) === "count" ? "count" : "linear" },
                    ],
                  })
                }
              >
                <Plus size={14} /> Componente
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">
            Crie um preset para começar.
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-3 py-2">
          <span
            className="mr-auto text-[11px] text-neutral-500"
            title={
              published
                ? "Os padrões vêm do app da empresa (seção App Takeoff) a cada atualização do catálogo; o que você mudar aqui fica neste computador e não é substituído"
                : "A empresa ainda não publicou kits: os padrões são os de fábrica. O que você mudar aqui fica neste computador"
            }
          >
            {published
              ? `${defaults.length} padrões da empresa · alterações ficam neste computador`
              : "Padrões de fábrica · alterações ficam neste computador"}
          </span>
          <Button onClick={() => setKitsEditorOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar presets
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
