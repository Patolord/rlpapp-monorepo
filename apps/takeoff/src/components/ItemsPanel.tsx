import clsx from "clsx";
import { CircleDot, Pentagon, Plus, Spline, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { itemTotals, NO_ZONE, pricedQty, round2, totalsByZone } from "../lib/quantities";
import { GROUP_SUGGESTIONS, ITEM_COLORS, type Item } from "../lib/types";
import { formatMoney, formatQty, type Kind } from "../lib/units";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

const KIND_ICON: Record<Kind, typeof CircleDot> = {
  count: CircleDot,
  linear: Spline,
  area: Pentagon,
};

export function ItemsPanel() {
  const project = useStore((s) => s.project);
  const activeItemId = useStore((s) => s.activeItemId);
  const { setActiveItem, updateItem, removeItem, addItem } = useStore.getState();
  const totals = useMemo(() => itemTotals(project), [project]);
  const byZone = useMemo(() => totalsByZone(project), [project]);
  const breakdownFor = (itemId: string, kind: Kind) => {
    if (project.zones.length === 0) return "";
    const parts: string[] = [];
    for (const z of project.zones) {
      const q = byZone.get(z.id)?.get(itemId)?.qty;
      if (q) parts.push(`${z.name}: ${formatQty(kind, q, project.unit)}`);
    }
    const rest = byZone.get(NO_ZONE)?.get(itemId)?.qty;
    if (rest) parts.push(`sem local: ${formatQty(kind, rest, project.unit)}`);
    return parts.join(" · ");
  };
  const groups = useMemo(
    () => Array.from(new Set([...project.items.map((i) => i.group), ...GROUP_SUGGESTIONS])),
    [project.items],
  );
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Kind>("count");

  const submitNew = () => {
    addItem({ kind: newKind, name: newName.trim() || undefined });
    setNewName("");
  };

  return (
    <div className="flex h-full flex-col">
      <datalist id="item-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="flex-1 overflow-y-auto">
        {project.items.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-neutral-500">
            Nenhum item ainda. Adicione um abaixo ou escolha uma ferramenta e comece a medir — o
            item é criado automaticamente.
          </p>
        )}
        {project.items.map((item, idx) => {
          const t = totals.get(item.id);
          const qty = pricedQty(item, t?.qty ?? 0);
          const total = round2(qty * (item.materialPrice + item.laborPrice));
          return (
            <ItemRow
              key={item.id}
              item={item}
              index={idx}
              active={item.id === activeItemId}
              qtyLabel={formatQty(item.kind, t?.qty ?? 0, project.unit)}
              unscaled={t?.unscaled ?? 0}
              breakdown={breakdownFor(item.id, item.kind)}
              total={formatMoney(total, project.currency)}
              onActivate={() => setActiveItem(item.id)}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
            />
          );
        })}
      </div>
      <form
        className="flex items-center gap-1.5 border-t border-neutral-800 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitNew();
        }}
      >
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as Kind)}
          className="h-8 rounded bg-neutral-800 px-1 text-xs ring-1 ring-neutral-700"
        >
          <option value="count">Contagem</option>
          <option value="linear">Linear</option>
          <option value="area">Área</option>
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do novo item"
          className="h-8 min-w-0 flex-1 rounded bg-neutral-800 px-2 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none"
        />
        <Button type="submit" variant="primary" aria-label="Adicionar item">
          <Plus size={14} />
        </Button>
      </form>
    </div>
  );
}

interface RowProps {
  item: Item;
  index: number;
  active: boolean;
  qtyLabel: string;
  unscaled: number;
  breakdown: string;
  total: string;
  onActivate: () => void;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
}

function ItemRow({
  item,
  index,
  active,
  qtyLabel,
  unscaled,
  breakdown,
  total,
  onActivate,
  onChange,
  onRemove,
}: RowProps) {
  const [editing, setEditing] = useState<"name" | "group" | null>(null);
  const Icon = KIND_ICON[item.kind];
  const cycleColor = () => {
    const i = ITEM_COLORS.indexOf(item.color);
    onChange({ color: ITEM_COLORS[(i + 1) % ITEM_COLORS.length] });
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      onClick={onActivate}
      className={clsx(
        "group flex cursor-pointer flex-col gap-1 border-b border-neutral-800/70 px-2 py-1.5",
        active ? "bg-orange-500/10" : "hover:bg-neutral-800/60",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Trocar a cor"
          onClick={(e) => {
            e.stopPropagation();
            cycleColor();
          }}
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/50"
          style={{ background: item.color }}
        />
        <Icon size={13} className="shrink-0 text-neutral-400" />
        {editing === "name" ? (
          <input
            autoFocus
            defaultValue={item.name}
            onClick={stop}
            onBlur={(e) => {
              onChange({ name: e.target.value.trim() || item.name });
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(null);
            }}
            className="h-6 min-w-0 flex-1 rounded bg-neutral-800 px-1 text-xs ring-1 ring-orange-400 outline-none"
          />
        ) : (
          <span
            className={clsx(
              "min-w-0 flex-1 truncate text-xs",
              active ? "text-white" : "text-neutral-200",
            )}
            onDoubleClick={() => setEditing("name")}
            title="Duplo clique para renomear"
          >
            {item.name}
          </span>
        )}
        {index < 9 && <Kbd>{index + 1}</Kbd>}
        <button
          type="button"
          title="Excluir o item e suas medições"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-neutral-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-6 text-[11px] text-neutral-400">
        <span className="font-mono text-neutral-200">{qtyLabel}</span>
        {unscaled > 0 && (
          <span className="text-amber-400" title="Há medições em páginas sem escala definida">
            +{unscaled} sem escala
          </span>
        )}
        {editing === "group" ? (
          <input
            autoFocus
            list="item-groups"
            defaultValue={item.group}
            onClick={stop}
            onBlur={(e) => {
              onChange({ group: e.target.value.trim() || item.group });
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(null);
            }}
            className="h-5 w-28 rounded bg-neutral-800 px-1 text-[11px] ring-1 ring-orange-400 outline-none"
          />
        ) : (
          <button
            type="button"
            title="Grupo da planilha (clique para alterar)"
            onClick={(e) => {
              e.stopPropagation();
              setEditing("group");
            }}
            className="truncate rounded bg-neutral-800 px-1.5 py-px text-[10px] text-neutral-400 hover:text-neutral-100"
          >
            {item.group}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1">
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.materialPrice}
            onClick={stop}
            onChange={(e) => onChange({ materialPrice: Number(e.target.value) || 0 })}
            className="num-input w-16"
            title="Preço unitário: material"
            placeholder="mat."
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.laborPrice}
            onClick={stop}
            onChange={(e) => onChange({ laborPrice: Number(e.target.value) || 0 })}
            className="num-input w-16"
            title="Preço unitário: mão de obra"
            placeholder="m.o."
          />
          <span className="w-[4.5rem] text-right font-mono text-neutral-300">{total}</span>
        </span>
      </div>
      {breakdown && (
        <div className="truncate pl-6 text-[10px] text-neutral-500" title={breakdown}>
          {breakdown}
        </div>
      )}
    </div>
  );
}
