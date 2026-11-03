import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BRAND_RULES, brandDefaults } from "../lib/catalog";
import { type Origin, originOf } from "../lib/overrides";
import { newId } from "../lib/types";
import {
  cloneBrand,
  cloneBrands,
  DIAMETERS,
  type Diameter,
  type HpRow,
  ROLE_LABELS,
  SEED_BRANDS,
  type VrfBrand,
  type VrfRole,
} from "../lib/vrf";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

const input =
  "h-6 rounded bg-neutral-800 px-1 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

const ROLE_NOTE: Record<VrfRole, string> = {
  main: "pela capacidade da condensadora",
  trunk: "pela soma das evaporadoras a jusante",
  branch: "pela capacidade da evaporadora",
};

const ORIGIN_LABEL: Record<Origin, { text: string; title: string; className: string }> = {
  default: {
    text: "padrão",
    title: "Igual ao padrão da empresa: segue as atualizações publicadas no app da empresa",
    className: "text-neutral-500",
  },
  modified: {
    text: "modificada aqui",
    title:
      "Versão deste computador de uma marca da empresa: atualizações do padrão não a substituem",
    className: "text-orange-300",
  },
  local: {
    text: "só aqui",
    title: "Marca criada neste computador; a empresa não a tem",
    className: "text-sky-300",
  },
};

/**
 * Edit each maker's rules: three tube-sizing tables (gas/liquid pair from a minimum HP) and the
 * Y-kit models by downstream HP. The list starts as the company's brands (published with the
 * catalog, edited in the dashboard's "App Takeoff" section; the workbook's until the company
 * publishes any); what the user changes here is kept on this machine as an override and
 * survives every catalog refresh. Takeoffs keep only the brand id, so a rule change re-prices
 * every open system.
 */
export function VrfBrandsDialog() {
  const open = useStore((s) => s.vrfBrandsEditorOpen);
  const stored = useStore((s) => s.catalog.vrfBrands);
  const remote = useStore((s) => s.catalog.remoteVrfBrands);
  const { setVrfBrandsEditorOpen, saveVrfBrands } = useStore.getState();
  const [brands, setBrands] = useState<VrfBrand[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const defaults = useMemo(() => brandDefaults(remote), [remote]);
  const published = remote !== null && remote.length > 0;
  useEffect(() => {
    if (open) {
      const copy = cloneBrands(stored.length ? stored : SEED_BRANDS);
      setBrands(copy);
      setSel(copy[0]?.id ?? null);
    }
  }, [open, stored]);
  if (!open) return null;

  const brand = brands.find((b) => b.id === sel) ?? null;
  const origin = brand ? originOf(defaults, brand, BRAND_RULES) : null;
  const hiddenDefaults = defaults.filter((d) => !brands.some((b) => b.id === d.id));
  /** Put the selected brand back as the company publishes it. */
  const restore = () => {
    if (!brand) return;
    const d = defaults.find((b) => b.id === brand.id);
    if (d) setBrands((bs) => bs.map((b) => (b.id === brand.id ? cloneBrand(d) : b)));
  };
  const update = (patch: Partial<VrfBrand>) =>
    setBrands((bs) => bs.map((b) => (b.id === sel ? { ...b, ...patch } : b)));
  const updateRow = (key: VrfRole, i: number, patch: Partial<HpRow>) => {
    if (!brand) return;
    update({ [key]: brand[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  };
  const addBrand = () => {
    const b: VrfBrand = { ...cloneBrands([SEED_BRANDS[0]])[0], id: newId(), name: "Nova marca" };
    setBrands((bs) => [...bs, b]);
    setSel(b.id);
  };
  const duplicate = () => {
    if (!brand) return;
    const b = { ...cloneBrands([brand])[0], id: newId(), name: `${brand.name} (cópia)` };
    setBrands((bs) => [...bs, b]);
    setSel(b.id);
  };
  const remove = () => {
    if (!brand) return;
    const rest = brands.filter((b) => b.id !== brand.id);
    setBrands(rest);
    setSel(rest[0]?.id ?? null);
  };
  const save = () => {
    const clean = brands
      .map((b) => ({
        ...b,
        name: b.name.trim() || "Marca",
        main: sortRows(b.main),
        trunk: sortRows(b.trunk),
        branch: sortRows(b.branch),
        ykit: [...b.ykit]
          .map((r) => ({ hp: Math.max(0, r.hp || 0), model: r.model.trim() }))
          .filter((r) => r.model)
          .sort((a, c) => a.hp - c.hp),
      }))
      .filter((b) => b.main.length && b.trunk.length && b.branch.length);
    void saveVrfBrands(clean.length ? clean : cloneBrands(SEED_BRANDS));
    setVrfBrandsEditorOpen(false);
  };
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

  return (
    <Dialog
      title="Marcas de VRF"
      onClose={() => setVrfBrandsEditorOpen(false)}
      className="h-[34rem] w-[64rem]"
      bodyClassName="flex"
    >
      <div className="flex w-52 shrink-0 flex-col border-r border-neutral-800">
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {brands.map((b) => {
            const from = originOf(defaults, b, BRAND_RULES);
            const o = ORIGIN_LABEL[from];
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSel(b.id)}
                  className={
                    b.id === sel
                      ? "w-full bg-orange-500/10 px-3 py-1.5 text-left text-xs font-medium text-orange-300"
                      : "w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  }
                >
                  {b.name || "Marca"}
                  <span className="block truncate text-[11px] font-normal text-neutral-500">
                    {b.ykit.length} Y-kits
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
            onClick={() => setBrands((bs) => [...bs, ...hiddenDefaults.map(cloneBrand)])}
            className="border-t border-neutral-800 px-3 py-1.5 text-left text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            title={hiddenDefaults.map((d) => d.name).join(", ")}
          >
            <RotateCcw size={11} className="mr-1 inline" />
            {hiddenDefaults.length === 1
              ? "Trazer de volta 1 marca removida"
              : `Trazer de volta ${hiddenDefaults.length} marcas removidas`}
          </button>
        )}
        <div className="flex gap-1 border-t border-neutral-800 p-2">
          <Button onClick={addBrand} title="Nova marca (começa com as tabelas da planilha)">
            <Plus size={14} /> Nova
          </Button>
          <Button onClick={duplicate} disabled={!brand} title="Duplicar a marca selecionada">
            <Copy size={14} />
          </Button>
          <Button onClick={remove} disabled={!brand} title="Excluir a marca selecionada">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {brand ? (
          <>
            <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
              <span className="text-xs text-neutral-400">Marca</span>
              <input
                value={brand.name}
                onChange={(e) => update({ name: e.target.value })}
                className={`${input} h-7 w-60 text-sm`}
                placeholder="ex.: Daikin"
              />
              <span className="ml-auto text-[11px] text-neutral-500">
                Cada linha vale a partir do HP mínimo até a linha seguinte (como o VLOOKUP da
                planilha)
              </span>
              {origin && (
                <span
                  className={`text-[11px] ${ORIGIN_LABEL[origin].className}`}
                  title={ORIGIN_LABEL[origin].title}
                >
                  {ORIGIN_LABEL[origin].text}
                </span>
              )}
              {origin === "modified" && (
                <button
                  type="button"
                  onClick={restore}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-800"
                  title="Descartar as alterações deste computador e voltar ao padrão da empresa"
                >
                  <RotateCcw size={11} /> Restaurar padrão
                </button>
              )}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-auto px-3 py-2 text-xs">
              {(["main", "trunk", "branch"] as VrfRole[]).map((key) => (
                <div key={key}>
                  <div className="mb-1 text-[11px] font-medium text-neutral-200">
                    {ROLE_LABELS[key]}
                    <span className="block font-normal text-neutral-500">{ROLE_NOTE[key]}</span>
                  </div>
                  <table className="w-full table-fixed">
                    <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
                      <tr>
                        <th className="w-[3.4rem] pb-0.5 text-left font-medium">HP mín.</th>
                        <th className="pb-0.5 text-left font-medium">Gás</th>
                        <th className="pb-0.5 text-left font-medium">Líquido</th>
                        <th className="w-5" />
                      </tr>
                    </thead>
                    <tbody>
                      {brand[key].map((r, i) => (
                        <tr key={i}>
                          <td className="py-0.5 pr-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={r.hp}
                              onChange={(e) => updateRow(key, i, { hp: num(e.target.value) })}
                              className={`${input} w-full text-right font-mono`}
                            />
                          </td>
                          <td className="py-0.5 pr-1">
                            <DiameterSelect
                              value={r.gas}
                              onChange={(gas) => updateRow(key, i, { gas })}
                            />
                          </td>
                          <td className="py-0.5 pr-1">
                            <DiameterSelect
                              value={r.liquid}
                              onChange={(liquid) => updateRow(key, i, { liquid })}
                            />
                          </td>
                          <td className="py-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                update({ [key]: brand[key].filter((_, j) => j !== i) })
                              }
                              className="rounded p-0.5 text-neutral-500 hover:text-red-400"
                              aria-label="Remover linha"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button
                    className="mt-1 h-6 px-1.5"
                    onClick={() => {
                      const last = brand[key][brand[key].length - 1];
                      update({
                        [key]: [
                          ...brand[key],
                          last
                            ? { ...last, hp: last.hp + 2 }
                            : { hp: 0, gas: "1/2" as Diameter, liquid: "1/4" as Diameter },
                        ],
                      });
                    }}
                  >
                    <Plus size={12} /> Linha
                  </Button>
                </div>
              ))}
              <div>
                <div className="mb-1 text-[11px] font-medium text-neutral-200">
                  Y-kit (kit de derivação)
                  <span className="block font-normal text-neutral-500">
                    pela capacidade a jusante do kit
                  </span>
                </div>
                <table className="w-full table-fixed">
                  <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="w-[3.4rem] pb-0.5 text-left font-medium">HP mín.</th>
                      <th className="pb-0.5 text-left font-medium">Modelo</th>
                      <th className="w-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {brand.ykit.map((r, i) => (
                      <tr key={i}>
                        <td className="py-0.5 pr-1">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={r.hp}
                            onChange={(e) =>
                              update({
                                ykit: brand.ykit.map((y, j) =>
                                  j === i ? { ...y, hp: num(e.target.value) } : y,
                                ),
                              })
                            }
                            className={`${input} w-full text-right font-mono`}
                          />
                        </td>
                        <td className="py-0.5 pr-1">
                          <input
                            value={r.model}
                            onChange={(e) =>
                              update({
                                ykit: brand.ykit.map((y, j) =>
                                  j === i ? { ...y, model: e.target.value } : y,
                                ),
                              })
                            }
                            className={`${input} w-full font-mono`}
                            placeholder="ex.: KHRP26A33T"
                          />
                        </td>
                        <td className="py-0.5">
                          <button
                            type="button"
                            onClick={() => update({ ykit: brand.ykit.filter((_, j) => j !== i) })}
                            className="rounded p-0.5 text-neutral-500 hover:text-red-400"
                            aria-label="Remover Y-kit"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button
                  className="mt-1 h-6 px-1.5"
                  onClick={() => {
                    const last = brand.ykit[brand.ykit.length - 1];
                    update({ ykit: [...brand.ykit, { hp: last ? last.hp + 4 : 0, model: "" }] });
                  }}
                >
                  <Plus size={12} /> Y-kit
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">
            Crie uma marca para começar.
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2">
          <span
            className="text-[11px] text-neutral-500"
            title={
              published
                ? "As marcas vêm do app da empresa (seção App Takeoff) a cada atualização do catálogo; o que você mudar aqui fica neste computador e não é substituído"
                : "A empresa ainda não publicou marcas: valem as da planilha Levantamento VRF. O que você mudar aqui fica neste computador"
            }
          >
            {published
              ? `${defaults.length} marcas padrão da empresa · alterações ficam neste computador`
              : "Marcas da planilha Levantamento VRF · alterações ficam neste computador"}
            . Confira os modelos de Y-kit com o catálogo do fabricante.
          </span>
          <span className="flex-1" />
          <Button
            onClick={() => {
              const all = cloneBrands(defaults);
              setBrands(all);
              setSel(all[0]?.id ?? null);
            }}
            title={
              published
                ? "Descarta as alterações deste computador e volta às marcas da empresa"
                : "Volta às marcas e tabelas embutidas no app"
            }
          >
            Restaurar todas
          </Button>
          <Button onClick={() => setVrfBrandsEditorOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar marcas
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DiameterSelect({ value, onChange }: { value: Diameter; onChange: (d: Diameter) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Diameter)}
      className={`${input} w-full font-mono`}
    >
      {DIAMETERS.map((d) => (
        <option key={d} value={d}>
          {d}"
        </option>
      ))}
    </select>
  );
}

const sortRows = (rows: HpRow[]): HpRow[] =>
  [...rows].map((r) => ({ ...r, hp: Math.max(0, r.hp || 0) })).sort((a, b) => a.hp - b.hp);
