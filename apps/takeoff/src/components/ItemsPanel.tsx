import clsx from "clsx";
import {
  CircleDot,
  FileText,
  Library,
  Pentagon,
  Plus,
  Search,
  Send,
  Spline,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MOD, mod } from "../lib/platform";
import {
  formatItemQty,
  type ItemTotal,
  itemTotals,
  NO_ZONE,
  pricedQty,
  round2,
  totalsByZone,
} from "../lib/quantities";
import { DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS, type Item } from "../lib/types";
import { formatMoney, formatQty, type Kind } from "../lib/units";
import { useStore } from "../store";
import { ItemStylePopover } from "./ItemStylePopover";
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
  const systemFilter = useStore((s) => s.systemFilter);
  const drawingOnly = useStore((s) => s.drawingOnly);
  const savedEntries = useStore((s) => s.catalog.saved);
  const savedNames = useMemo(() => new Set(savedEntries.map((e) => fold(e.name))), [savedEntries]);
  const remoteEntries = useStore((s) => s.catalog.remote);
  const outbox = useStore((s) => s.catalog.outbox);
  const draftIds = useMemo(
    () => new Set(remoteEntries.filter((e) => e.status === "draft").map((e) => e.catalogId)),
    [remoteEntries],
  );
  const pendingItemIds = useMemo(() => new Set(outbox.map((q) => q.itemId)), [outbox]);
  const linkOf = (item: Item): CompanyLink => {
    if (pendingItemIds.has(item.id)) return "pending";
    if (!item.catalogId) return "none";
    return draftIds.has(item.catalogId) ? "draft" : "linked";
  };
  const {
    setActiveItem,
    updateItem,
    removeItem,
    addItem,
    setPaletteOpen,
    saveItemToCatalog,
    proposeItemToCompany,
    setZoneFilter,
    setSystemFilter,
    setDrawingOnly,
    setVisibleItemIds,
  } = useStore.getState();
  const allTotals = useMemo(() => itemTotals(project), [project]);
  const totals = useMemo(
    () =>
      drawingOnly ? itemTotals(project, (m) => m.drawingId === project.activeDrawingId) : allTotals,
    [project, drawingOnly, allTotals],
  );
  /** A just-created item (no marking anywhere) stays visible while active, whatever the filters. */
  const freshActive = (id: string) => id === activeItemId && !allTotals.get(id)?.count;
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
  const activeSystem =
    project.items.find((i) => i.id === activeItemId)?.system ?? project.system ?? "";

  const zoneName =
    zoneFilter === null
      ? null
      : zoneFilter === NO_ZONE
        ? "Sem local"
        : (project.zones.find((z) => z.id === zoneFilter)?.name ?? null);
  // a location with nothing measured yet still filters everything out
  const scoped =
    zoneFilter === null ? null : (byZone.get(zoneFilter) ?? new Map<string, ItemTotal>());

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
    if (scoped && !scoped.has(item.id) && !freshActive(item.id)) return false;
    if (drawingOnly && !totals.get(item.id)?.count && !freshActive(item.id)) return false;
    return true;
  });
  // arrow keys step through the items in this order (see hotkeys)
  const visibleKey = visible.map((i) => i.id).join("\u0000");
  useEffect(() => {
    setVisibleItemIds(visibleKey ? visibleKey.split("\u0000") : []);
  }, [visibleKey]);
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

      <div className="space-y-1.5 border-b border-neutral-800 px-2 py-1.5">
        <div className="flex h-7 min-w-0 items-center gap-1 rounded bg-neutral-800 px-1.5 ring-1 ring-neutral-700 focus-within:ring-orange-400">
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDrawingOnly(!drawingOnly)}
            title="Só o que tem marcações na planta em exibição (itens e locais)"
            className={clsx(
              "flex h-7 shrink-0 items-center gap-1 rounded px-1.5 text-xs ring-1",
              drawingOnly
                ? "bg-orange-500/15 text-orange-300 ring-orange-400"
                : "bg-neutral-800 text-neutral-400 ring-neutral-700 hover:text-neutral-100",
            )}
          >
            <FileText size={14} /> esta planta
          </button>
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
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
          const measured = qtyOf(item.id);
          const priced = pricedQty(item, measured);
          return (
            <ItemRow
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              qtyLabel={formatItemQty(item, measured, project.unit)}
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
              saved={savedNames.has(fold(item.name))}
              onSave={() => void saveItemToCatalog(item.id)}
              link={linkOf(item)}
              onPropose={() => void proposeItemToCompany(item.id)}
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
  active: boolean;
  qtyLabel: string;
  unscaled: number;
  breakdown: string;
  systemLabel: string;
  total: string;
  /** The item's name is already in the user's catalog. */
  saved: boolean;
  /** Relation with the company catalog (see CompanyLink). */
  link: CompanyLink;
  onActivate: () => void;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onSave: () => void;
  onPropose: () => void;
}

/**
 * none: a local line, nothing sent. pending: proposal queued, not delivered yet. draft: linked to
 * a material purchasing has not validated. linked: created from (or matched to) a company material.
 */
type CompanyLink = "none" | "pending" | "draft" | "linked";

const LINK_TITLE: Record<CompanyLink, string> = {
  none: "Propor ao catálogo da empresa: compras recebe um rascunho com este nome, unidade e preço",
  pending: "Envio pendente (sem conexão ou sem token); clique para tentar de novo",
  draft: "Rascunho aguardando compras; clique para enviar o preço atual como estimativa",
  linked: "Material do catálogo da empresa; clique para enviar o preço atual como estimativa",
};

/** One line per item; the active item expands to show prices, tags and the per-location split. */
function ItemRow({
  item,
  active,
  qtyLabel,
  unscaled,
  breakdown,
  systemLabel,
  total,
  saved,
  link,
  onActivate,
  onChange,
  onRemove,
  onSave,
  onPropose,
}: RowProps) {
  const [editing, setEditing] = useState<"name" | "group" | "system" | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const Icon = KIND_ICON[item.kind];
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
      ref={rowRef}
      onClick={onActivate}
      className={clsx(
        "group cursor-pointer border-b border-neutral-800/70 px-2",
        active ? "bg-orange-500/10 py-1.5" : "py-0.5 hover:bg-neutral-800/60",
      )}
    >
      <div className="flex h-6 items-center gap-1.5">
        <div className="relative shrink-0">
          <button
            type="button"
            title="Cor e símbolo do item"
            onClick={(e) => {
              e.stopPropagation();
              setStyleOpen(!styleOpen);
            }}
            className={clsx(
              "flex h-5 w-5 items-center justify-center rounded hover:bg-neutral-700",
              styleOpen && "bg-neutral-700",
            )}
          >
            {item.kind === "count" ? (
              <SymbolIcon id={item.symbol} color={item.color} size={17} />
            ) : (
              <Icon size={16} color={item.color} strokeWidth={2.5} />
            )}
          </button>
          {styleOpen && (
            <ItemStylePopover item={item} onChange={onChange} onClose={() => setStyleOpen(false)} />
          )}
        </div>
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
        {item.derived === "duct" && (
          <span
            className="shrink-0 rounded bg-neutral-800 px-1 text-[10px] uppercase text-neutral-500"
            title="Rede de dutos: material e mão de obra calculados na aba Dutos a partir dos trechos medidos"
          >
            rede de dutos
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
                title={
                  saved
                    ? "Já está no catálogo: clique para atualizar nome, grupo, disciplina e preços"
                    : "Salvar no catálogo (nome, grupo, disciplina e preços)"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                className={clsx(
                  "rounded p-0.5",
                  saved ? "text-amber-400" : "text-neutral-500 hover:text-amber-400",
                )}
              >
                <Star size={15} fill={saved ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                title={LINK_TITLE[link]}
                onClick={(e) => {
                  e.stopPropagation();
                  onPropose();
                }}
                className={clsx(
                  "rounded p-0.5",
                  link === "pending" && "text-amber-400",
                  link === "draft" && "text-amber-400/70",
                  link === "linked" && "text-sky-400",
                  link === "none" && "text-neutral-500 hover:text-sky-400",
                )}
              >
                <Send size={15} />
              </button>
              {
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
              }
            </span>
          </div>
          <div className="flex items-center gap-x-2 whitespace-nowrap text-[11px] text-neutral-400">
            <label className="flex items-center gap-1 whitespace-nowrap">
              Material
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.materialPrice}
                onClick={stop}
                onChange={(e) => onChange({ materialPrice: Number(e.target.value) || 0 })}
                className="num-input w-[3.9rem]"
                title={
                  item.priceDate
                    ? `Preço unitário: material · ${
                        item.priceSource === "catalog" ? "cotação" : "digitado"
                      } em ${new Date(item.priceDate).toLocaleDateString("pt-BR")}`
                    : "Preço unitário: material"
                }
              />
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap">
              M. obra
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.laborPrice}
                onClick={stop}
                onChange={(e) => onChange({ laborPrice: Number(e.target.value) || 0 })}
                className="num-input w-[3.9rem]"
                title="Preço unitário: mão de obra"
              />
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap">
              Perda
              <input
                type="number"
                min={0}
                step="1"
                value={item.wastePct}
                onClick={stop}
                onChange={(e) => onChange({ wastePct: Number(e.target.value) || 0 })}
                className="num-input w-11"
                title="Percentual de perda acrescido à quantidade"
              />
              %
            </label>
            {item.kind === "linear" && !item.derived && (
              <label
                className="flex items-center gap-1 whitespace-nowrap"
                title="Comprimento vertical somado ao total do item (prumadas, descidas)"
              >
                Vertical
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={item.vertical ?? 0}
                  onClick={stop}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onChange({ vertical: v > 0 ? v : undefined });
                  }}
                  className="num-input w-14"
                  title="Comprimento vertical somado ao total do item"
                />
                m
              </label>
            )}
          </div>
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
