import { ArrowUpFromLine, Link2Off, Pencil, Plus, Repeat, X } from "lucide-react";
import { useMemo } from "react";
import { FLANGE_LABELS, INSULATION_LABELS } from "../lib/ducts";
import { vrfTag } from "../lib/vrf";
import { useStore } from "../store";
import { Button } from "./ui";

/**
 * Shown while measurements are selected: the vertical length of linear runs (risers and drops
 * the plan does not show) and, for a kit group, its members, add an item, ungroup.
 */
export function SelectionBar() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const {
    removeMeasurements,
    unlinkMeasurements,
    addToGroup,
    setVertical,
    setRepeat,
    setDuctEditIds,
    setVrfEditIds,
  } = useStore.getState();
  const info = useMemo(() => {
    const sel = new Set(selection);
    const items = new Map(project.items.map((i) => [i.id, i]));
    const selected = project.measurements.filter((m) => sel.has(m.id));
    const linear = selected.filter((m) => items.get(m.itemId)?.kind === "linear");
    const linked = selected.filter((m) => m.linkId);
    const linkId = linked[0]?.linkId;
    const group =
      linkId && linked.length === selected.length && linked.every((m) => m.linkId === linkId)
        ? { linkId, members: linked }
        : null;
    const verticals = new Set(linear.map((m) => m.vertical ?? 0));
    const repeats = new Set(selected.map((m) => m.repeat ?? 1));
    return { items, selected, linear, group, verticals, repeats };
  }, [selection, project]);
  if (info.selected.length === 0) return null;
  const { items, selected, linear, group, verticals, repeats } = info;
  const repeat = repeats.size === 1 ? [...repeats][0] : null;
  const inGroup = new Set(group?.members.map((m) => m.itemId));
  const candidates = project.items.filter((i) => !inGroup.has(i.id) && i.kind !== "area");
  const vertical = verticals.size === 1 ? [...verticals][0] : null;

  return (
    <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-xl">
      {group ? (
        <span className="mr-1 font-medium text-neutral-100">
          Kit · {group.members.length} itens
        </span>
      ) : (
        <span className="mr-1 font-medium text-neutral-100">
          {selected.length} {selected.length === 1 ? "medição" : "medições"}
        </span>
      )}
      <label
        className="flex items-center gap-1 text-neutral-400"
        title="Multiplicador: quantas vezes cada medição selecionada conta (ex.: 10 andares iguais medidos uma vez)"
      >
        <Repeat size={13} /> ×
        <input
          type="number"
          min={1}
          step={1}
          value={repeat ?? ""}
          placeholder={repeat === null ? "vários" : "1"}
          onChange={(e) => {
            const v = Number(e.target.value);
            setRepeat(
              selected.map((m) => m.id),
              Number.isFinite(v) && v >= 1 ? v : 1,
            );
          }}
          className="num-input w-14"
        />
      </label>
      {linear.length > 0 && (
        <label
          className="flex items-center gap-1 text-neutral-400"
          title="Comprimento vertical (prumadas, descidas) somado a cada trecho selecionado"
        >
          <ArrowUpFromLine size={13} /> Vertical
          <input
            type="number"
            min={0}
            step="0.1"
            value={vertical ?? ""}
            placeholder={vertical === null ? "vários" : "0"}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVertical(
                linear.map((m) => m.id),
                Number.isFinite(v) && v > 0 ? v : 0,
              );
            }}
            className="num-input w-16"
          />
          <span>{project.unit}</span>
        </label>
      )}
      {(() => {
        const ducts = selected.filter((m) => m.duct);
        if (ducts.length === 0) return null;
        const d = ducts[0].duct;
        return (
          <>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 ring-1 ring-neutral-700">
              {ducts.length === 1 && d
                ? `Duto ${d.a}×${d.b} cm · ${INSULATION_LABELS[d.insulation]} · ${FLANGE_LABELS[d.flange]}`
                : `${ducts.length} dutos`}
            </span>
            <Button
              onClick={() => setDuctEditIds(ducts.map((m) => m.id))}
              title="Alterar seção, isolamento ou flange destes dutos"
            >
              <Pencil size={14} /> Editar duto
            </Button>
          </>
        );
      })()}
      {(() => {
        const vrfs = selected.filter((m) => m.vrf);
        if (vrfs.length === 0) return null;
        const first = vrfs[0];
        const hp = items.get(first.itemId)?.vrf?.hp ?? 0;
        return (
          <>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 ring-1 ring-neutral-700">
              {vrfs.length === 1 && first.vrf
                ? `VRF · ${vrfTag(first.vrf, hp)}`
                : `${vrfs.length} trechos VRF`}
            </span>
            <Button
              onClick={() => setVrfEditIds(vrfs.map((m) => m.id))}
              title="Alterar tipo, capacidade, curvas ou sistema destes trechos"
            >
              <Pencil size={14} /> Editar VRF
            </Button>
          </>
        );
      })()}
      {group?.members.map((m) => {
        const item = items.get(m.itemId);
        return (
          <span
            key={m.id}
            className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 ring-1 ring-neutral-700"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item?.color }} />
            {item?.name ?? "?"}
            {item?.factor && item.factor !== 1 && (
              <span className="text-neutral-500">×{item.factor}</span>
            )}
            <button
              type="button"
              title="Remover este item do grupo (apaga só esta medição)"
              onClick={() => removeMeasurements([m.id])}
              className="rounded text-neutral-500 hover:text-red-400"
              aria-label={`Remover ${item?.name ?? "item"} do grupo`}
            >
              <X size={12} />
            </button>
          </span>
        );
      })}
      {group && candidates.length > 0 && (
        <label className="flex items-center gap-1 text-neutral-400">
          <Plus size={13} />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addToGroup(group.linkId, e.target.value);
            }}
            className="h-7 max-w-[12rem] rounded bg-neutral-800 px-1 text-xs ring-1 ring-neutral-700"
            title="Adicionar um item existente ao grupo, com a mesma geometria"
          >
            <option value="">adicionar item…</option>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {group && (
        <Button
          onClick={() => unlinkMeasurements(selection)}
          title="Desagrupar: as medições passam a ser independentes (ficam sobrepostas)"
        >
          <Link2Off size={14} /> Desagrupar
        </Button>
      )}
    </div>
  );
}
