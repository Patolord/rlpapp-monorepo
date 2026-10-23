import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { GROUP_SUGGESTIONS } from "../lib/types";
import { BASE_MATERIALS, cloneWeights, SEED_WEIGHTS, type WeightRow } from "../lib/weights";
import { useStore } from "../store";
import { Button } from "./ui";

const EMPTY_ROW: WeightRow = {
  name: "",
  group: "Tubulações",
  unit: "m",
  material: "cobre",
  kgPerUnit: 0,
};

/** Edit the table of materials priced by weight (saved with the catalog on this machine). */
export function WeightsDialog() {
  const open = useStore((s) => s.weightsEditorOpen);
  const stored = useStore((s) => s.catalog.weights);
  const { setWeightsEditorOpen, saveWeights } = useStore.getState();
  const [rows, setRows] = useState<WeightRow[]>([]);
  useEffect(() => {
    if (open) setRows(cloneWeights(stored));
  }, [open, stored]);
  if (!open) return null;

  const update = (i: number, patch: Partial<WeightRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => {
    const clean = rows
      .map((r) => ({ ...r, name: r.name.trim(), group: r.group.trim() || "Tubulações" }))
      .filter((r) => r.name && r.kgPerUnit > 0);
    void saveWeights(clean);
    setWeightsEditorOpen(false);
  };
  const input =
    "h-7 rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none";

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={() => setWeightsEditorOpen(false)}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <datalist id="weight-groups">
        {GROUP_SUGGESTIONS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex h-[32rem] w-[46rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
      >
        <div className="border-b border-neutral-800 px-3 py-2">
          <div className="text-sm font-semibold text-neutral-100">Materiais por peso</div>
          <p className="text-[11px] text-neutral-500">
            Cada linha vira um material do Ctrl+K cujo preço é kg por unidade × preço do insumo
            (Orçamento › Insumos). Tubos de cobre vêm da tabela do fornecedor; acrescente outros.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead className="sticky top-0 bg-neutral-900 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-2 py-1 text-left">Material</th>
                <th className="w-32 px-1 py-1 text-left">Grupo</th>
                <th className="w-14 px-1 py-1 text-left">Un.</th>
                <th className="w-40 px-1 py-1 text-left">Insumo (R$/kg)</th>
                <th className="w-20 px-1 py-1 text-right">kg / un.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${i}-${r.material}`} className="border-t border-neutral-800/60">
                  <td className="px-2 py-0.5">
                    <input
                      value={r.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder='Tubo de cobre 1/2"'
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={r.group}
                      list="weight-groups"
                      onChange={(e) => update(i, { group: e.target.value })}
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <select
                      value={r.unit}
                      onChange={(e) => update(i, { unit: e.target.value as WeightRow["unit"] })}
                      className={`${input} w-full`}
                    >
                      <option value="m">m</option>
                      <option value="pç">pç</option>
                    </select>
                  </td>
                  <td className="px-1 py-0.5">
                    <select
                      value={r.material}
                      onChange={(e) => update(i, { material: e.target.value })}
                      className={`${input} w-full`}
                    >
                      {BASE_MATERIALS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={r.kgPerUnit}
                      onChange={(e) => update(i, { kgPerUnit: Number(e.target.value) || 0 })}
                      className={`${input} w-full text-right font-mono`}
                    />
                  </td>
                  <td className="px-1 py-0.5 text-center">
                    <button
                      type="button"
                      title="Remover"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-neutral-500 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2">
          <Button onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}>
            <Plus size={14} /> Linha
          </Button>
          <Button
            onClick={() => setRows(cloneWeights(SEED_WEIGHTS))}
            title="Volta à tabela do fornecedor embutida no app"
          >
            Restaurar tabela padrão
          </Button>
          <span className="flex-1" />
          <Button onClick={() => setWeightsEditorOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
