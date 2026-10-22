import clsx from "clsx";
import { CircleDot, Library, Pentagon, Plus, Search, Spline, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MOD, mod } from "../lib/platform";
import { itemTotals, NO_ZONE, pricedQty, round2, totalsByZone } from "../lib/quantities";
import { SYMBOLS } from "../lib/symbols";
import { DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS, ITEM_COLORS, type Item } from "../lib/types";
import { formatMoney, formatQty, type Kind } from "../lib/units";
import { useStore } from "../store";
import { SymbolIcon } from "./SymbolIcon";
import { Button, Kbd } from "./ui";

const KIND_ICON: Record<Kind, typeof CircleDot> = {
  count: CircleDot,
  linear: Spline,
  area: Pentagon,
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ItemsPanel() {
  const project = useStore((s) => s.project);
  const activeItemId = useStore((s) => s.activeItemId);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const {
    setActiveItem,
    updateItem,
    removeItem,
    addItem,
    setPaletteOpen,
    saveItemToCatalog,
    setZoneFilter,
  } = useStore.getState();
  const totals = useMemo(() => itemTotals(project), [project]);
  const byZone = useMemo(() => totalsByZone(project), [project]);
  const groups = useMemo(
    () => Array.from(new Set([...project.items.map((i) => i.group), ...GROUP_SUGGESTIONS])),
    [project.items],
  );
  /** Disciplines in use (for filtering). */
  const systems = useMemo(
    () =>
      Array.from(
        new Set([project.system, ...project.items.map((i) => i.system ?? "")].filter(Boolean)),
      ),
    [project.items, project.system],
  );
  /** Disciplines offered when typing: the ones in use plus the usual RLP set. */
  const systemOptions = useMemo(
    () => Array.from(new Set([...systems, ...DISCIPLINE_SUGGESTIONS])),
    [systems],
  );
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Kind>("count");
  const [newSystem, setNewSystem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [systemFilter, setSystemFilter] = useState<string | null>(null);
  const activeSystem =
    project.items.find((i) => i.id === activeItemId)?.system ?? project.system ?? "";

  const zoneName =
    zoneFilter === null
      ? null
      : zoneFilter === NO_ZONE
        ? "Sem local"
        : (project.zones.find((z) => z.id === zoneFilter)?.name ?? null);
  const scoped = zoneFilter === null ? null : byZone.get(zoneFilter);

  /** Measured quantity of an item, within the location filter when one is set. */
  const qtyOf = (id: string) => (scoped ? (scoped.get(id)?.qty ?? 0) : (totals.get(id)?.qty ?? 0));
  const unscaledOf = (id: string) =>
    scoped ? (scoped.get(id)?.unscaled ?? 0) : (totals.get(id)?.unscaled ?? 0);

  const q = fold(query.trim());
  const visible = project.items.filter((item) => {
    if (q && !fold(`${item.name} ${item.group} ${item.system ?? ""}`).includes(q)) return false;
    if (systemFilter !== null && (item.system || project.system || "") !== systemFilter)
      return false;
    // inside a location only items that have something there (the active one stays visible)
    if (scoped && !scoped.has(item.id) && item.id !== activeItemId) return false;
    return true;
  });
  const sumValue = visible.reduce(
    (s, item) =>
      s + round2(pricedQty(item, qtyOf(item.id)) * (item.materialPrice + item.laborPrice)),
    0,
  );

  const breakdownFor = (itemId: string, kind: Kind) => {
    if (project.zones.length === 0) return "";
    const parts: string[] = [];
    for (const z of project.zones) {
      const v = byZone.get(z.id)?.get(itemId)?.qty;
      if (v) parts.push(`${z.name}: ${formatQty(kind, v, project.unit)}`);
    }
    const rest = byZone.get(NO_ZONE)?.get(itemId)?.qty;
    if (rest) parts.push(`sem local: ${formatQty(kind, rest, project.unit)}`);
    return parts.join(" · ");
  };

  const submitNew = () => {
    addItem({
      kind: newKind,
      name: newName.trim() || undefined,
      system: newSystem ?? activeSystem,
    });
    setNewName("");
  };

  return (
    <div className="flex h-full flex-col">
      <datalist id="item-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <datalist id="item-systems">
        {systemOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <div className="flex items-center gap-1.5 border-b border-neutral-800 px-2 py-1.5">
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded bg-neutral-800 px-1.5 ring-1 ring-neutral-700 focus-within:ring-orange-400">
          <Search size={14} className="shrink-0 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar itens"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpar filtro">
              <X size={14} className="text-neutral-500 hover:text-neutral-100" />
            </button>
          )}
        </div>
        {systems.length > 1 && (
          <select
            value={systemFilter ?? "*"}
            onChange={(e) => setSystemFilter(e.target.value === "*" ? null : e.target.value)}
            title="Mostrar só os itens de uma disciplina (aba da planilha)"
            className={clsx(
              "h-7 max-w-[9rem] rounded px-1 text-xs ring-1",
              systemFilter === null
                ? "bg-neutral-800 ring-neutral-700"
                : "bg-orange-500/15 text-orange-300 ring-orange-400",
            )}
          >
            <option value="*">Todas as disciplinas</option>
            {systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {project.zones.length > 0 && (
          <select
            value={zoneFilter ?? "*"}
            onChange={(e) => setZoneFilter(e.target.value === "*" ? null : e.target.value)}
            title="Mostrar quantidades de um local apenas"
            className={clsx(
              "h-7 max-w-[9rem] rounded px-1 text-xs ring-1",
              zoneFilter === null
                ? "bg-neutral-800 ring-neutral-700"
                : "bg-orange-500/15 text-orange-300 ring-orange-400",
            )}
          >
            <option value="*">Todos os locais</option>
            {project.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
            <option value={NO_ZONE}>Sem local</option>
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {project.items.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-neutral-500">
            Nenhum item ainda. Use <Kbd>{MOD}</Kbd>+<Kbd>K</Kbd> para buscar no catálogo, adicione
            um abaixo ou escolha uma ferramenta e comece a medir — o item é criado automaticamente.
          </p>
        )}
        {project.items.length > 0 && visible.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-neutral-500">
            Nenhum item {zoneName ? `em ${zoneName}` : "corresponde ao filtro"}.
          </p>
        )}
        {visible.map((item) => {
          const index = project.items.indexOf(item);
          const measured = qtyOf(item.id);
          const priced = pricedQty(item, measured);
          return (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              active={item.id === activeItemId}
              qtyLabel={formatQty(item.kind, measured, project.unit)}
              unscaled={unscaledOf(item.id)}
              breakdown={breakdownFor(item.id, item.kind)}
              systemLabel={item.system || project.system || ""}
              total={formatMoney(
                round2(priced * (item.materialPrice + item.laborPrice)),
                project.currency,
              )}
              onActivate={() => setActiveItem(item.id)}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              onSave={() => void saveItemToCatalog(item.id)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-neutral-800 px-2 py-1 text-[12px] text-neutral-500">
        <span>
          {visible.length} {visible.length === 1 ? "item" : "itens"}
          {zoneName ? ` em ${zoneName}` : ""}
        </span>
        <span className="font-mono text-neutral-300">
          {formatMoney(sumValue, project.currency)}
        </span>
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
          list="item-systems"
          value={newSystem ?? activeSystem}
          onChange={(e) => setNewSystem(e.target.value)}
          placeholder="Disciplina"
          title="Disciplina do novo item: vira uma aba da planilha"
          className="h-8 w-24 rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do novo item"
          className="h-8 min-w-0 flex-1 rounded bg-neutral-800 px-2 text-xs ring-1 ring-neutral-700 focus:ring-orange-400 outline-none"
        />
        <Button type="submit" variant="primary" aria-label="Adicionar item">
          <Plus size={16} />
        </Button>
        <Button onClick={() => setPaletteOpen(true)} title={`Catálogo de materiais (${mod("K")})`}>
          <Library size={16} />
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
  systemLabel: string;
  total: string;
  onActivate: () => void;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onSave: () => void;
}

/** One line per item; the active item expands to show prices, tags and the per-location split. */
function ItemRow({
  item,
  index,
  active,
  qtyLabel,
  unscaled,
  breakdown,
  systemLabel,
  total,
  onActivate,
  onChange,
  onRemove,
  onSave,
}: RowProps) {
  const [editing, setEditing] = useState<"name" | "group" | "system" | null>(null);
  const Icon = KIND_ICON[item.kind];
  const cycleColor = () => {
    const i = ITEM_COLORS.indexOf(item.color);
    onChange({ color: ITEM_COLORS[(i + 1) % ITEM_COLORS.length] });
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const tagInput = (
    field: "group" | "system",
    value: string,
    list: string,
    placeholder: string,
  ) => (
    <input
      autoFocus
      list={list}
      defaultValue={value}
      placeholder={placeholder}
      onClick={stop}
      onBlur={(e) => {
        const v = e.target.value.trim();
        onChange(field === "group" ? { group: v || item.group } : { system: v });
        setEditing(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(null);
      }}
      className="h-5 w-32 rounded bg-neutral-800 px-1 text-[12px] ring-1 ring-orange-400 outline-none"
    />
  );
  const tag = (field: "group" | "system", label: string, title: string) => (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(field);
      }}
      className="truncate rounded bg-neutral-800 px-1.5 py-px text-[11px] text-neutral-400 hover:text-neutral-100"
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={onActivate}
      className={clsx(
        "group cursor-pointer border-b border-neutral-800/70 px-2",
        active ? "bg-orange-500/10 py-1.5" : "py-0.5 hover:bg-neutral-800/60",
      )}
    >
      <div className="flex h-6 items-center gap-1.5">
        <button
          type="button"
          title="Trocar a cor"
          onClick={(e) => {
            e.stopPropagation();
            cycleColor();
          }}
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/40"
          style={{ background: item.color }}
        />
        {item.kind === "count" ? (
          <SymbolIcon id={item.symbol} color={item.color} size={16} className="shrink-0" />
        ) : (
          <Icon size={14} className="shrink-0 text-neutral-400" />
        )}
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
            className="h-5 min-w-0 flex-1 rounded bg-neutral-800 px-1 text-xs ring-1 ring-orange-400 outline-none"
          />
        ) : (
          <span
            className={clsx(
              "min-w-0 flex-1 truncate text-xs",
              active ? "font-medium text-neutral-100" : "text-neutral-200",
            )}
            onDoubleClick={() => setEditing("name")}
            title={`${item.name} — duplo clique para renomear`}
          >
            {item.name}
          </span>
        )}
        <span className="shrink-0 font-mono text-[12px] text-neutral-200">{qtyLabel}</span>
        {unscaled > 0 && (
          <span
            className="shrink-0 text-[11px] text-amber-400"
            title="Há medições em páginas sem escala definida"
          >
            +{unscaled}
          </span>
        )}
        <span className="w-[4.6rem] shrink-0 text-right font-mono text-[12px] text-neutral-400">
          {total}
        </span>
        {index < 9 ? <Kbd>{index + 1}</Kbd> : <span className="w-[1.1rem]" />}
      </div>
      {active && (
        <div className="mt-1 space-y-1 pl-5">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            {editing === "group"
              ? tagInput("group", item.group, "item-groups", "Grupo")
              : tag("group", item.group, "Grupo da planilha (clique para alterar)")}
            {editing === "system"
              ? tagInput("system", item.system ?? "", "item-systems", "Disciplina (aba)")
              : tag(
                  "system",
                  systemLabel || "disciplina",
                  "Disciplina: aba da planilha (clique para alterar)",
                )}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                title="Salvar no catálogo (nome, grupo e preços)"
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                className="rounded p-0.5 text-neutral-500 hover:text-amber-400"
              >
                <Star size={15} />
              </button>
              <button
                type="button"
                title="Excluir o item e suas medições"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="rounded p-0.5 text-neutral-500 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span>Material</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.materialPrice}
              onClick={stop}
              onChange={(e) => onChange({ materialPrice: Number(e.target.value) || 0 })}
              className="num-input w-[4.2rem]"
              title="Preço unitário: material"
            />
            <span>M. obra</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.laborPrice}
              onClick={stop}
              onChange={(e) => onChange({ laborPrice: Number(e.target.value) || 0 })}
              className="num-input w-[4.2rem]"
              title="Preço unitário: mão de obra"
            />
            <span>Perda</span>
            <input
              type="number"
              min={0}
              step="1"
              value={item.wastePct}
              onClick={stop}
              onChange={(e) => onChange({ wastePct: Number(e.target.value) || 0 })}
              className="num-input w-12"
              title="Percentual de perda acrescido à quantidade"
            />
            <span>%</span>
          </div>
          {item.kind === "count" && (
            <div
              className="flex flex-wrap items-center gap-0.5"
              title="Símbolo da marca de contagem"
            >
              {SYMBOLS.map((sym) => (
                <button
                  key={sym.id}
                  type="button"
                  title={sym.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ symbol: sym.id });
                  }}
                  className={clsx(
                    "rounded p-0.5",
                    (item.symbol ?? "dot") === sym.id
                      ? "bg-orange-500/20 ring-1 ring-orange-400"
                      : "hover:bg-neutral-800",
                  )}
                >
                  <SymbolIcon id={sym.id} color={item.color} size={18} />
                </button>
              ))}
            </div>
          )}
          {breakdown && (
            <div className="truncate text-[11px] text-neutral-500" title={breakdown}>
              {breakdown}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
