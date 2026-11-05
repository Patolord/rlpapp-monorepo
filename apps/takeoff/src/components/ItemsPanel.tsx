import clsx from "clsx";
import {
  AirVent,
  CircleDot,
  Cuboid,
  FileText,
  Layers,
  Library,
  Pentagon,
  Plus,
  RotateCcw,
  Search,
  Send,
  Spline,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { canonicalGroup, compareSystems } from "../lib/budgetOrder";
import { MOD, mod } from "../lib/platform";
import { describePriceSource } from "../lib/priceSource";
import {
  formatItemQty,
  type ItemTotal,
  itemSheets,
  itemTotals,
  NO_LOCATION,
  pricedQty,
  round2,
  sheetItemTotals,
  sheetKey,
  totalsByLocation,
} from "../lib/quantities";
import { foldName } from "../lib/text";
import { DISCIPLINE_SUGGESTIONS, GROUP_SUGGESTIONS, type Item } from "../lib/types";
import { formatMoney, type Kind } from "../lib/units";
import { describeWeightPrice } from "../lib/weights";
import { useStore } from "../store";
import { ItemStylePopover } from "./ItemStylePopover";
import { PriceSourceBadge } from "./PriceSourceBadge";
import { SymbolIcon } from "./SymbolIcon";
import { Button, Kbd } from "./ui";

/** The badge on a duct network / VRF system item; it opens that system's calculator. */
const derivedBadge =
  "flex shrink-0 items-center gap-0.5 rounded bg-neutral-800 px-1 text-[10px] uppercase text-neutral-500 ring-1 ring-transparent hover:text-orange-300 hover:ring-orange-400/60";

const KIND_ICON: Record<Kind, typeof CircleDot> = {
  count: CircleDot,
  linear: Spline,
  area: Pentagon,
};

export function ItemsPanel() {
  const project = useStore((s) => s.project);
  const activeItemId = useStore((s) => s.activeItemId);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const systemFilter = useStore((s) => s.systemFilter);
  const drawSystem = useStore((s) => s.drawSystem);
  const drawingOnly = useStore((s) => s.drawingOnly);
  const savedEntries = useStore((s) => s.catalog.saved);
  const savedNames = useMemo(
    () => new Set(savedEntries.map((e) => foldName(e.name))),
    [savedEntries],
  );
  const remoteEntries = useStore((s) => s.catalog.remote);
  const outbox = useStore((s) => s.catalog.outbox);
  const basePrices = useStore((s) => s.catalog.basePrices);
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
    setDrawSystem,
    setDrawingOnly,
    setVisibleItemIds,
  } = useStore.getState();
  const allTotals = useMemo(() => itemTotals(project), [project]);
  /** The tabs each item is budgeted on: its own, and those its markings were put in. */
  const sheetsOf = useMemo(() => itemSheets(project), [project]);
  /** Disciplines in use (for filtering): every tab some item or marking is budgeted on. */
  const systems = useMemo(
    () => Array.from(new Set([...sheetsOf.values()].flat())).sort(compareSystems),
    [sheetsOf],
  );
  // the whole project, or what one discipline tab budgets: quantities and per-location split
  const scopes = useMemo(() => {
    const onDrawing = drawingOnly
      ? (m: { drawingId: string }) => m.drawingId === project.activeDrawingId
      : undefined;
    const perSheet = sheetItemTotals(project, onDrawing);
    const all: Scope = {
      totals: onDrawing ? itemTotals(project, onDrawing) : allTotals,
      byZone: totalsByLocation(project),
    };
    const bySheet = new Map<string, Scope>(
      systems.map((sheet) => [
        sheet,
        {
          totals: perSheet.get(sheet) ?? new Map<string, ItemTotal>(),
          byZone: totalsByLocation(project, sheet),
        },
      ]),
    );
    return { all, bySheet };
  }, [project, drawingOnly, allTotals, systems]);
  const scopeOf = (sheet: string | null): Scope =>
    sheet === null ? scopes.all : (scopes.bySheet.get(sheet) ?? EMPTY_SCOPE);
  /** A just-created item (no marking anywhere) stays visible while active, whatever the filters. */
  const freshActive = (id: string) => id === activeItemId && !allTotals.get(id)?.count;
  const groups = useMemo(
    () => Array.from(new Set([...project.items.map((i) => i.group), ...GROUP_SUGGESTIONS])),
    [project.items],
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
      : zoneFilter === NO_LOCATION
        ? "Sem local"
        : (project.locations.find((z) => z.id === zoneFilter)?.name ?? null);
  // a location with nothing measured yet still filters everything out
  const scopedOf = (scope: Scope) =>
    zoneFilter === null ? null : (scope.byZone.get(zoneFilter) ?? new Map<string, ItemTotal>());

  /** Measured quantity of an item in a scope, within the location filter when one is set. */
  const totalOf = (id: string, scope: Scope): ItemTotal | undefined =>
    (scopedOf(scope) ?? scope.totals).get(id);
  const qtyOf = (id: string, scope: Scope) => totalOf(id, scope)?.qty ?? 0;

  const q = foldName(query.trim());
  /** The item passes the search, location and drawing filters within one scope. */
  const shows = (item: Item, scope: Scope): boolean => {
    if (q && !foldName(`${item.name} ${item.group} ${item.system ?? ""}`).includes(q)) return false;
    const scoped = scopedOf(scope);
    // inside a location only items that have something there (the active one stays visible)
    if (scoped && !scoped.has(item.id) && !freshActive(item.id)) return false;
    if (drawingOnly && !scope.totals.get(item.id)?.count && !freshActive(item.id)) return false;
    return true;
  };
  /**
   * With every discipline shown and more than one in use, the list is sectioned like the
   * budget: an item split over tabs gets a line in each, with that tab's quantity, not the sum.
   */
  const grouped = systemFilter === null && systems.length > 1;
  const sections: Section[] = grouped
    ? systems.map((sheet) => ({
        sheet,
        items: project.items.filter(
          (item) => sheetsOf.get(item.id)?.includes(sheet) && shows(item, scopeOf(sheet)),
        ),
      }))
    : [
        {
          sheet: systemFilter,
          items: project.items.filter(
            (item) =>
              (systemFilter === null ||
                sheetsOf.get(item.id)?.includes(systemFilter) ||
                freshActive(item.id)) &&
              shows(item, scopeOf(systemFilter)),
          ),
        },
      ];
  const rows = sections.flatMap((sec) => sec.items.map((item) => ({ item, sheet: sec.sheet })));
  const visible = Array.from(new Set(rows.map((r) => r.item)));
  // arrow keys step through the items in this order (see hotkeys)
  const visibleKey = visible.map((i) => i.id).join("\u0000");
  useEffect(() => {
    setVisibleItemIds(visibleKey ? visibleKey.split("\u0000") : []);
  }, [visibleKey, setVisibleItemIds]);
  const lineValue = (item: Item, sheet: string | null) =>
    round2(
      pricedQty(item, qtyOf(item.id, scopeOf(sheet))) * (item.materialPrice + item.laborPrice),
    );
  const sumValue = rows.reduce((s, r) => s + lineValue(r.item, r.sheet), 0);

  /** The line of the active item that opens: the one last clicked, else its first. */
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const activeRows = rows.filter((r) => r.item.id === activeItemId);
  const openSheet = activeRows.some((r) => r.sheet === activeSheet)
    ? activeSheet
    : (activeRows[0]?.sheet ?? null);

  /** Quantity per location in a scope, with waste like the item total. */
  const breakdownFor = (item: Item, scope: Scope) => {
    if (project.locations.length === 0) return "";
    const parts: string[] = [];
    for (const z of project.locations) {
      const v = scope.byZone.get(z.id)?.get(item.id)?.qty;
      if (v) parts.push(`${z.name}: ${formatItemQty(item, pricedQty(item, v), project.unit)}`);
    }
    const rest = scope.byZone.get(NO_LOCATION)?.get(item.id)?.qty;
    if (rest) parts.push(`sem local: ${formatItemQty(item, pricedQty(item, rest), project.unit)}`);
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
          {project.locations.length > 0 && (
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
              {project.locations.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
              <option value={NO_LOCATION}>Sem local</option>
            </select>
          )}
        </div>
        <DrawSystemField value={drawSystem} options={systemOptions} onChange={setDrawSystem} />
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
        {sections.map((sec) => {
          if (sec.items.length === 0) return null;
          const scope = scopeOf(sec.sheet);
          return (
            <Fragment key={sec.sheet ?? "*"}>
              {grouped && sec.sheet !== null && (
                <SectionHeader
                  name={sec.sheet}
                  total={formatMoney(
                    sec.items.reduce((v, item) => v + lineValue(item, sec.sheet), 0),
                    project.currency,
                  )}
                  onFilter={() => setSystemFilter(sec.sheet)}
                />
              )}
              {sec.items.map((item) => {
                const measured = qtyOf(item.id, scope);
                const priced = pricedQty(item, measured);
                return (
                  <ItemRow
                    key={`${sec.sheet ?? "*"}:${item.id}`}
                    item={item}
                    active={item.id === activeItemId && sec.sheet === openSheet}
                    qtyLabel={formatItemQty(item, priced, project.unit)}
                    qtyTitle={
                      item.wastePct
                        ? `Medido ${formatItemQty(item, measured, project.unit)} + ${item.wastePct}% de perda`
                        : undefined
                    }
                    unscaled={totalOf(item.id, scope)?.unscaled ?? 0}
                    breakdown={breakdownFor(item, scope)}
                    systemLabel={(sheetsOf.get(item.id) ?? []).join(" · ")}
                    systemTitle={systemTitleOf(
                      sheetKey(project, item),
                      sheetsOf.get(item.id) ?? [],
                    )}
                    total={formatMoney(lineValue(item, sec.sheet), project.currency)}
                    onActivate={() => {
                      setActiveSheet(sec.sheet);
                      setActiveItem(item.id);
                    }}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                    saved={savedNames.has(foldName(item.name))}
                    onSave={() => void saveItemToCatalog(item.id)}
                    link={linkOf(item)}
                    weightInfo={describeWeightPrice(item, basePrices, (v) =>
                      formatMoney(v, project.currency),
                    )}
                    onPropose={() => void proposeItemToCompany(item.id)}
                  />
                );
              })}
            </Fragment>
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

/** Quantities of the whole project or of one discipline tab, as the item list shows them. */
interface Scope {
  totals: Map<string, ItemTotal>;
  /** Per location id (NO_LOCATION for unassigned). */
  byZone: Map<string, Map<string, ItemTotal>>;
}

const EMPTY_SCOPE: Scope = { totals: new Map(), byZone: new Map() };

/** One block of the list: a discipline tab's items, or every item (sheet null). */
interface Section {
  sheet: string | null;
  items: Item[];
}

/** Heading of a discipline in the sectioned list, as the budget names its tab. */
function SectionHeader({
  name,
  total,
  onFilter,
}: {
  name: string;
  total: string;
  onFilter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFilter}
      title={`Mostrar só ${name}`}
      className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-neutral-800 bg-neutral-900 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-100"
    >
      <span className="truncate">{name}</span>
      <span className="shrink-0 font-mono font-normal normal-case text-neutral-400">{total}</span>
    </button>
  );
}

/** Tooltip of an item's discipline tag: its own tab, and where its markings went otherwise. */
function systemTitleOf(own: string, sheets: string[]): string {
  const base = `Disciplina do item: ${own}, a aba da planilha das suas marcações (clique para alterar)`;
  const others = sheets.filter((s) => s !== own);
  if (others.length === 0) return base;
  return `${base}. Marcações feitas em outra disciplina ("Marcar em"): ${others.join(", ")}`;
}

/**
 * "Marcar em": the discipline the next markings go to, whatever item or kit draws them (the
 * garage's copper on AC Pesado, the party room's on AC Leve). Typed text applies on Enter,
 * leaving the field or picking a suggestion; blank returns to each item's own discipline.
 */
function DrawSystemField({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: string[];
  onChange: (system: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const apply = (v: string) => onChange(v.trim() || null);
  return (
    <div
      className={clsx(
        "flex h-7 min-w-0 items-center gap-1 rounded px-1.5 text-xs ring-1",
        value
          ? "bg-orange-500/15 text-orange-300 ring-orange-400"
          : "bg-neutral-800 text-neutral-400 ring-neutral-700 focus-within:ring-orange-400",
      )}
      title="Disciplina (aba da planilha) das próximas marcações, de qualquer item ou kit: o mesmo cobre pode ir para AC Pesado na garagem e para AC Leve no salão. Vazio: cada marcação vai para a disciplina do seu item. Para mudar marcações já feitas, selecione-as no desenho."
    >
      <Layers size={14} className="shrink-0" />
      <span className="shrink-0">Marcar em</span>
      <input
        list="item-systems"
        value={draft}
        placeholder="disciplina do item"
        onChange={(e) => {
          setDraft(e.target.value);
          // picked from the suggestions: no need to leave the field
          if (options.includes(e.target.value)) apply(e.target.value);
        }}
        onBlur={() => apply(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            e.currentTarget.blur();
          }
          e.stopPropagation();
        }}
        className="min-w-0 flex-1 bg-transparent text-xs text-neutral-100 outline-none placeholder:text-neutral-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Voltar à disciplina de cada item"
          title="Voltar à disciplina de cada item"
        >
          <X size={14} className="text-orange-300 hover:text-neutral-100" />
        </button>
      )}
    </div>
  );
}

interface RowProps {
  item: Item;
  active: boolean;
  qtyLabel: string;
  /** How the quantity was reached when it includes waste. */
  qtyTitle?: string;
  unscaled: number;
  breakdown: string;
  systemLabel: string;
  systemTitle: string;
  total: string;
  /** The item's name is already in the user's catalog. */
  saved: boolean;
  /** Relation with the company catalog (see CompanyLink). */
  link: CompanyLink;
  /** How a weight-derived price was reached, or null for a plain line. */
  weightInfo: string | null;
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
  pending: "Envio pendente (sem conexão, sem login ou sem token); clique para tentar de novo",
  draft: "Rascunho aguardando compras; clique para enviar o preço atual como estimativa",
  linked: "Material do catálogo da empresa; clique para enviar o preço atual como estimativa",
};

/** One line per item; the active item expands to show prices, tags and the per-location split. */
function ItemRow({
  item,
  active,
  qtyLabel,
  qtyTitle,
  unscaled,
  breakdown,
  systemLabel,
  systemTitle,
  total,
  saved,
  link,
  weightInfo,
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
  const { openSystemPanel } = useStore.getState();
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
        // a retyped group joins the section already spelt that way ("bocas de ar" → "Bocas de Ar")
        onChange(
          field === "group"
            ? { group: canonicalGroup(useStore.getState().project.items, v) || item.group }
            : { system: v },
        );
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSystemPanel("duct", item.id);
            }}
            className={derivedBadge}
            title="Rede de dutos: material e mão de obra calculados a partir dos trechos medidos. Clique para abrir o cálculo"
          >
            <Cuboid size={11} /> rede de dutos
          </button>
        )}
        {item.derived === "vrf" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSystemPanel("vrf", item.id);
            }}
            className={derivedBadge}
            title="Sistema VRF: material e mão de obra calculados a partir dos trechos medidos; a quantidade é o nº de sistemas iguais. Clique para abrir o cálculo"
          >
            <AirVent size={11} /> sistema vrf
          </button>
        )}
        <span className="shrink-0 font-mono text-[12px] text-neutral-200" title={qtyTitle}>
          {qtyLabel}
        </span>
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
              : tag("system", systemLabel || "disciplina", systemTitle)}
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
                className={clsx(
                  "num-input w-[3.9rem]",
                  weightInfo && item.priceSource === "manual" && "ring-1 ring-amber-400/70",
                )}
                title={
                  weightInfo && item.priceSource === "manual"
                    ? `Preço digitado nesta linha; por peso seria ${weightInfo}. Clique em ↺ para voltar ao preço por peso.`
                    : weightInfo
                      ? `Preço por peso: ${weightInfo}. Digite outro valor para sobrescrever só nesta linha.`
                      : item.priceSource
                        ? `Preço unitário: material · ${describePriceSource(item.priceSource, item.priceDate)}`
                        : "Preço unitário: material"
                }
              />
              <PriceSourceBadge source={item.priceSource} priceDate={item.priceDate} />
              {weightInfo && item.priceSource === "manual" && (
                <button
                  type="button"
                  title="Voltar ao preço por peso (segue o R$/kg do insumo)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ priceSource: "weight" });
                  }}
                  className="rounded p-0.5 text-amber-400 hover:text-amber-300"
                >
                  <RotateCcw size={13} />
                </button>
              )}
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
