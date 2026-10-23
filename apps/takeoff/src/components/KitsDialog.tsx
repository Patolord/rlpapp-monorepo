import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { kindForUnit, mergeCatalog, normalizeDiscipline } from "../lib/catalog";
import { type Kit, type KitComponent, kitMode } from "../lib/kits";
import { foldName } from "../lib/text";
import { DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS, newId } from "../lib/types";
import { useStore } from "../store";
import { Backdrop, Button } from "./ui";

const EMPTY_COMPONENT: KitComponent = { name: "", group: "", kind: "linear", factor: 1 };

/** Create and edit kit presets (saved with the catalog on this machine). */
export function KitsDialog() {
  const open = useStore((s) => s.kitsEditorOpen);
  const stored = useStore((s) => s.catalog.kits);
  const catalog = useStore((s) => s.catalog);
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
  const update = (patch: Partial<Kit>) =>
    setKits((ks) => ks.map((k) => (k.id === sel ? { ...k, ...patch } : k)));
  const updateComp = (i: number, patch: Partial<KitComponent>) => {
    if (!kit) return;
    const components = kit.components.map((c, j) => (j === i ? { ...c, ...patch } : c));
    update({ components });
  };
  /** When a catalog name is picked, take its group, discipline and unit kind. */
  const fillFromCatalog = (i: number, name: string) => {
    const e = entries.find((x) => foldName(x.name) === foldName(name));
    if (!e || !kit) return;
    const c = kit.components[i];
    updateComp(i, {
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
        components: k.components
          .filter((c) => c.name.trim())
          .map((c) => ({
            ...c,
            name: c.name.trim(),
            group: c.group.trim() || "Geral",
            system: c.system?.trim() || undefined,
            kind: kitMode(k) === "count" ? "count" : c.kind,
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
    <Backdrop onClose={() => setKitsEditorOpen(false)} onKeyDown={(e) => e.stopPropagation()}>
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
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex h-[32rem] w-[62rem] max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
      >
        <div className="flex w-56 shrink-0 flex-col border-r border-neutral-800">
          <div className="border-b border-neutral-800 px-3 py-2 text-sm font-semibold text-neutral-100">
            Presets de kit
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {kits.map((k) => (
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
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
                  className={`${input} w-72 text-sm`}
                  placeholder="ex.: 12.000 Inverter"
                />
                <label className="flex items-center gap-1 text-xs text-neutral-400">
                  Tipo
                  <select
                    value={kitMode(kit)}
                    onChange={(e) => {
                      const mode = e.target.value as Kit["mode"];
                      update({
                        mode,
                        components: kit.components.map((c) =>
                          mode === "count" ? { ...c, kind: "count" } : c,
                        ),
                      });
                    }}
                    className={input}
                    title="Linear: desenha-se um trecho · Contagem: um clique coloca o conjunto"
                  >
                    <option value="linear">Linear (trecho)</option>
                    <option value="count">Contagem (clique)</option>
                  </select>
                </label>
                <span className="ml-auto text-[11px] text-neutral-500">
                  {kitMode(kit) === "count"
                    ? "Um clique coloca todos os componentes abaixo, agrupados"
                    : "Um trecho desenhado cria todos os componentes abaixo, agrupados"}
                </span>
              </div>
              <div className="min-w-0 flex-1 overflow-auto px-3 py-2">
                <table className="w-full text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="pb-1 text-left font-medium">Material (nome do catálogo)</th>
                      <th className="pb-1 text-left font-medium">Grupo</th>
                      <th className="pb-1 text-left font-medium">Disciplina</th>
                      {kitMode(kit) === "linear" && (
                        <th className="pb-1 text-left font-medium">Tipo</th>
                      )}
                      <th
                        className="pb-1 text-left font-medium"
                        title={
                          kitMode(kit) === "count"
                            ? "Quantidade colocada por clique"
                            : "Multiplicador da medida"
                        }
                      >
                        {kitMode(kit) === "count" ? "Qtd" : "Fator"}
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
                            onChange={(e) => updateComp(i, { name: e.target.value })}
                            onBlur={(e) => fillFromCatalog(i, e.target.value)}
                            className={`${input} w-full`}
                            placeholder='ex.: Cobre de 1/4"'
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
                        {kitMode(kit) === "linear" && (
                          <td className="py-0.5 pr-1">
                            <select
                              value={c.kind}
                              onChange={(e) =>
                                updateComp(i, { kind: e.target.value as KitComponent["kind"] })
                              }
                              className={input}
                              title="Linear acompanha o trecho; contagem entra uma vez por trecho"
                            >
                              <option value="linear">linear (m)</option>
                              <option value="count">por trecho (pç)</option>
                            </select>
                          </td>
                        )}
                        <td className="py-0.5 pr-1">
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={c.factor}
                            onChange={(e) => updateComp(i, { factor: Number(e.target.value) })}
                            className={`${input} w-16 text-right font-mono`}
                            title="Ex.: 2 para um cabo que vai e volta"
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
            <span className="mr-auto text-[11px] text-neutral-500">
              Salvo neste computador junto com o catálogo
            </span>
            <Button onClick={() => setKitsEditorOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>
              Salvar presets
            </Button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
