import clsx from "clsx";
import { CornerUpLeft, FileDown, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { switchDrawing } from "../lib/files";
import { NO_LOCATION } from "../lib/quantities";
import {
  filterOptions,
  isEmptyFilter,
  itemDiscipline,
  matches,
  type ReportFilter,
  reportPresets,
} from "../lib/report/filter";
import { cropFocusBox, pageKeys } from "../lib/report/pages";
import { locationCandidates, planReport, type ReportPage } from "../lib/report/plan";
import {
  exportReport,
  missingDrawings,
  planDrawings,
  type ReportSettings,
  reportOptions,
  sessionPageSize,
  withoutDrawings,
} from "../lib/reportExport";
import { drawingOf } from "../lib/types";
import { useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { Dialog } from "./Dialog";
import { ReportPreview, useReportPreview } from "./ReportPreview";
import { Button } from "./ui";

const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((x) => b.includes(x));

const sameFilter = (a: ReportFilter, b: ReportFilter) =>
  sameSet(a.systems, b.systems) && sameSet(a.groups, b.groups) && sameSet(a.itemIds, b.itemIds);

const toggle = (list: readonly string[] = [], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-neutral-800 px-4 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">{title}</h3>
        {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A toggle chip for one value of a filter axis. */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "rounded px-2 py-0.5 text-[11px] ring-1",
        on
          ? "bg-orange-500/15 text-orange-200 ring-orange-400/60"
          : "text-neutral-300 ring-neutral-700 hover:bg-neutral-800",
      )}
    >
      {children}
    </button>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-center gap-2 text-xs text-neutral-200",
        disabled && "cursor-default opacity-40",
      )}
    >
      <input
        type="checkbox"
        className="accent-orange-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded ring-1 ring-neutral-700">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "px-2 py-0.5 text-[11px]",
            value === v
              ? "bg-orange-500 text-neutral-950"
              : "text-neutral-300 hover:bg-neutral-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Shows a report page on its drawing: the sheet, zoomed to the page's crop, its region selected. */
function showOnDrawing(page: ReportPage) {
  const store = useStore.getState();
  store.setReportOpen(false);
  store.setReportReturn(true);
  const go = () => {
    const s = useStore.getState();
    s.setPage(page.page);
    s.setSelection(page.regionId ? [page.regionId] : page.countedIds);
    const sheet = sessionPageSize(s.project)(page.drawingId, page.page);
    viewerApi.current?.focusBox(cropFocusBox(page, sheet));
  };
  if (page.drawingId !== store.project.activeDrawingId) void switchDrawing(page.drawingId).then(go);
  else go();
}

/**
 * After "Ver na planta": a chip over the viewer that brings the report back as it was (settings,
 * pages left out, page in view). Ctrl+Shift+E and the menu do the same.
 */
function ReturnChip() {
  const { setReportOpen, setReportReturn } = useStore.getState();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-900/95 py-1 pr-1 pl-3 text-xs text-neutral-200 shadow-lg ring-1 ring-orange-400/50">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-1.5 hover:text-orange-200"
          title="Reabre o relatório de recortes como estava (Ctrl+Shift+E)"
        >
          <CornerUpLeft size={14} />
          Voltar ao relatório
          <span className="text-neutral-500">Ctrl+Shift+E</span>
        </button>
        <button
          type="button"
          aria-label="Dispensar"
          onClick={() => setReportReturn(false)}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * "Relatório de recortes (PDF)": what to include (presets, discipline, category, items), which
 * locations and the layout on the left; on the right a live preview of the PDF itself, written
 * by the export's code a moment after each change, where pages can be left out ("incluir") and
 * opened on their drawing ("Ver na planta"). The dialog's state lives in the store, so closing it
 * (or going to the drawing) and reopening it brings everything back.
 */
export function ReportDialog() {
  const open = useStore((s) => s.reportOpen);
  const showReturn = useStore((s) => s.reportReturn);
  const project = useStore((s) => s.project);
  const systemFilter = useStore((s) => s.systemFilter);
  const activeItemId = useStore((s) => s.activeItemId);
  const s = useStore((st) => st.reportSettings);
  const excluded = useStore((st) => st.reportExcluded);
  const skipped = useStore((st) => st.reportSkipped);
  const selected = useStore((st) => st.reportSelected);
  const {
    setReportOpen,
    setReportSettings: set,
    setReportExcluded,
    setReportSkipped,
    setReportSelected,
  } = useStore.getState();
  /** Drawings whose PDF the file check did not find. */
  const [notFound, setNotFound] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const setFilter = (filter: ReportFilter) => set({ filter });

  const options = useMemo(() => filterOptions(project), [project]);
  const currentSystem = useMemo(() => {
    if (systemFilter) return systemFilter;
    const active = project.items.find((i) => i.id === activeItemId);
    return active ? itemDiscipline(project, active) : (options.systems[0] ?? "");
  }, [systemFilter, activeItemId, project, options]);
  const presets = useMemo(() => reportPresets(currentSystem), [currentSystem]);

  // items offered: those the discipline and category axes let through, with markings
  const counted = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of project.measurements) n.set(m.itemId, (n.get(m.itemId) ?? 0) + 1);
    return n;
  }, [project]);
  const offeredItems = useMemo(
    () =>
      project.items.filter(
        (i) =>
          (counted.get(i.id) ?? 0) > 0 &&
          matches(project, i, { systems: s.filter.systems, groups: s.filter.groups }),
      ),
    [project, s.filter.systems, s.filter.groups, counted],
  );

  const candidates = useMemo(() => locationCandidates(project, s.filter), [project, s.filter]);
  /** Locations with nothing of the filter: greyed out, unticked, never selected. */
  const empty = useMemo(
    () =>
      candidates
        .filter((c) => c.markings === 0 && c.locationId !== NO_LOCATION)
        .map((c) => c.locationId),
    [candidates],
  );
  const locationIds = useMemo(
    () =>
      project.locations
        .map((l) => l.id)
        .filter((id) => !excluded.includes(id) && !empty.includes(id)),
    [project, excluded, empty],
  );
  const settings: ReportSettings = useMemo(() => ({ ...s, locationIds }), [s, locationIds]);
  // every drawing the settings reach, then the plan without those whose PDF is missing (as the
  // export does: their pages are left out and listed on the cover)
  const reach = useMemo(
    () => (open ? planReport(project, settings.filter, reportOptions(project, settings)) : null),
    [open, project, settings],
  );
  const drawingsKey = reach ? planDrawings(reach).join("|") : "";
  const preview = useReportPreview(open, settings, skipped, project);
  const { result } = preview;
  // missing for the file check, or found unreadable by the preview
  const unreadable = result?.prepared.missingIds;
  const missingIds = useMemo(() => {
    const all = [...new Set([...notFound, ...(unreadable ?? [])])];
    return all.length === notFound.length ? notFound : all;
  }, [notFound, unreadable]);
  const plan = useMemo(() => {
    if (!reach || missingIds.length === 0) return reach;
    const kept = withoutDrawings(project, new Set(missingIds));
    return planReport(kept, settings.filter, reportOptions(kept, settings));
  }, [reach, missingIds, project, settings]);
  const keys = useMemo(() => (plan ? pageKeys(plan) : []), [plan]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void missingDrawings(project, drawingsKey ? drawingsKey.split("|") : []).then((ids) => {
      if (alive) setNotFound((cur) => (cur.join("|") === ids.join("|") ? cur : ids));
    });
    return () => {
      alive = false;
    };
  }, [open, project, drawingsKey]);

  // reopening the report: the way back is no longer needed
  useEffect(() => {
    if (open) useStore.getState().setReportReturn(false);
  }, [open]);

  // pages that are no longer planned (the settings changed the page set) stop being skipped;
  // pages keep their key across unrelated changes, so their choice survives those
  useEffect(() => {
    if (!open || !plan) return;
    const planned = new Set(keys);
    const kept = skipped.filter((k) => planned.has(k));
    if (kept.length !== skipped.length) setReportSkipped(kept);
  }, [open, plan, keys, skipped, setReportSkipped]);

  // a page in the large view: the one chosen before, else the first cutout
  useEffect(() => {
    if (!result || result.pages.length === 0) return;
    if (result.pages.some((p) => p.key === selected)) return;
    setReportSelected((result.pages.find((p) => p.report) ?? result.pages[0]).key);
  }, [result, selected, setReportSelected]);

  const missingNames = missingIds.map((id) => drawingOf(project, id)?.name ?? id);
  const goToBlocked = useCallback(
    (page: ReportPage | null) => {
      if (!page) return "A capa não tem planta";
      if (missingIds.includes(page.drawingId)) return "O PDF desta planta não foi encontrado";
      if (!drawingOf(project, page.drawingId)) return "Planta removida do takeoff";
      return null;
    },
    [missingIds, project],
  );

  if (!open || !plan) return showReturn && !open ? <ReturnChip /> : null;

  const pagesOf = new Map(plan.cover.locations.map((l) => [l.locationId, l.pagesLabel]));
  const skippedSet = new Set(skipped);
  const printed = keys.filter((k) => !skippedSet.has(k)).length;
  const withCover = s.cover && plan.pages.length > 0 ? 1 : 0;
  const run = async () => {
    setBusy(true);
    try {
      const left = await exportReport(settings, skipped, preview.sources);
      if (left !== null) setReportOpen(false);
    } catch {
      // the status bar already says what failed
    } finally {
      setBusy(false);
    }
  };
  const toggleSkip = (key: string, include: boolean) => {
    const cur = useStore.getState().reportSkipped;
    setReportSkipped(include ? cur.filter((k) => k !== key) : [...new Set([...cur, key])]);
  };

  return (
    <Dialog
      title="Relatório de recortes (PDF)"
      onClose={() => setReportOpen(false)}
      className="h-[min(56rem,calc(100%-2rem))] w-[min(96rem,calc(100%-2rem))] text-xs"
      bodyClassName="flex min-h-0"
    >
      <div className="flex w-[23rem] shrink-0 flex-col border-r border-neutral-800">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="O que incluir" hint="Sem nada marcado num eixo, ele não restringe.">
            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((p) => (
                <Chip
                  key={p.id}
                  on={sameFilter(s.filter, p.filter)}
                  onClick={() => setFilter(sameFilter(s.filter, p.filter) ? {} : p.filter)}
                >
                  {p.id === "disciplina" ? `${p.label} (${currentSystem})` : p.label}
                </Chip>
              ))}
              <Chip on={isEmptyFilter(s.filter)} onClick={() => setFilter({})}>
                Tudo
              </Chip>
            </div>
            <div className="grid grid-cols-[5rem_1fr] items-start gap-x-2 gap-y-1.5">
              <span className="pt-0.5 text-neutral-400">Disciplina</span>
              <div className="flex flex-wrap gap-1">
                {options.systems.map((v) => (
                  <Chip
                    key={v}
                    on={s.filter.systems?.includes(v) ?? false}
                    onClick={() => setFilter({ ...s.filter, systems: toggle(s.filter.systems, v) })}
                  >
                    {v}
                  </Chip>
                ))}
              </div>
              <span className="pt-0.5 text-neutral-400">Categoria</span>
              <div className="flex flex-wrap gap-1">
                {options.groups.map((v) => (
                  <Chip
                    key={v}
                    on={s.filter.groups?.includes(v) ?? false}
                    onClick={() => setFilter({ ...s.filter, groups: toggle(s.filter.groups, v) })}
                  >
                    {v}
                  </Chip>
                ))}
              </div>
              <span className="pt-0.5 text-neutral-400">Itens</span>
              <div className="max-h-28 space-y-0.5 overflow-y-auto pr-1">
                {offeredItems.length === 0 && (
                  <span className="text-neutral-500">Nenhum item marcado nestas categorias.</span>
                )}
                {offeredItems.map((i) => (
                  <Check
                    key={i.id}
                    checked={s.filter.itemIds?.includes(i.id) ?? false}
                    onChange={() =>
                      setFilter({ ...s.filter, itemIds: toggle(s.filter.itemIds, i.id) })
                    }
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: i.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="text-neutral-500">{counted.get(i.id) ?? 0}</span>
                  </Check>
                ))}
              </div>
            </div>
          </Section>

          <Section
            title="Locais"
            hint={s.wholeSheet ? "Planta inteira: um recorte por folha, sem locais." : undefined}
          >
            <div
              className={clsx(
                "max-h-40 space-y-0.5 overflow-y-auto pr-1",
                s.wholeSheet && "opacity-40",
              )}
            >
              {candidates.length === 0 && (
                <span className="text-neutral-500">Nenhum local neste takeoff.</span>
              )}
              {candidates.map((c) => {
                const loose = c.locationId === NO_LOCATION;
                const none = c.markings === 0;
                const on =
                  !none && (loose ? s.includeUnassigned : !excluded.includes(c.locationId));
                return (
                  <Check
                    key={c.locationId || "loose"}
                    checked={on}
                    disabled={s.wholeSheet || none}
                    onChange={(v) =>
                      loose
                        ? set({ includeUnassigned: v })
                        : setReportExcluded(toggle(excluded, c.locationId))
                    }
                  >
                    <span
                      className={clsx("min-w-0 flex-1 truncate", loose && "italic")}
                      title={
                        loose
                          ? undefined
                          : `${c.regions} ${c.regions === 1 ? "região" : "regiões"} · ${c.markings} ${c.markings === 1 ? "marcação" : "marcações"}`
                      }
                    >
                      {c.name}
                    </span>
                    <span className="text-neutral-500">{c.markings}</span>
                    <span className="min-w-[5.5rem] shrink-0 whitespace-nowrap text-right text-orange-200/80">
                      {on && !s.wholeSheet ? (pagesOf.get(c.locationId) ?? "") : ""}
                    </span>
                  </Check>
                );
              })}
            </div>
          </Section>

          <Section title="Layout">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-20 text-neutral-400">Papel</span>
                <Segmented
                  value={s.paper}
                  options={[
                    ["A4", "A4"],
                    ["A3", "A3"],
                  ]}
                  onChange={(paper) => set({ paper })}
                />
                <Segmented
                  value={s.orientation}
                  options={[
                    ["landscape", "Paisagem"],
                    ["portrait", "Retrato"],
                  ]}
                  onChange={(orientation) => set({ orientation })}
                />
              </div>
              <label
                className="flex items-center gap-2"
                title="0,5 = o texto da planta impresso a metade do tamanho"
              >
                <span className="w-20 text-neutral-400">Zoom mínimo</span>
                <input
                  type="number"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={s.legibilityFloor}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) set({ legibilityFloor: v });
                  }}
                  className="h-6 w-16 rounded bg-neutral-800 px-1.5 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
                />
                <span className="text-[11px] text-neutral-500">abaixo disso, divide em folhas</span>
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                <Check checked={s.prices} onChange={(prices) => set({ prices })}>
                  Incluir preços
                </Check>
                <Check checked={s.labels} onChange={(labels) => set({ labels })}>
                  Rótulos nas marcações (quantidade, seção a×b)
                </Check>
                <Check checked={s.washOut} onChange={(washOut) => set({ washOut })}>
                  Esmaecer fora do local
                </Check>
                <Check checked={s.cover} onChange={(cover) => set({ cover })}>
                  Capa com resumo e índice
                </Check>
                <Check checked={s.wholeSheet} onChange={(wholeSheet) => set({ wholeSheet })}>
                  Planta inteira (uma página por folha)
                </Check>
              </div>
            </div>
          </Section>
        </div>

        <div className="shrink-0 space-y-1.5 border-t border-neutral-800 px-4 py-2.5">
          {plan.pages.length === 0 ? (
            <p className="text-neutral-400">Nada do filtro nos locais escolhidos.</p>
          ) : (
            <p className="text-neutral-200" data-testid="report-summary">
              <span className="font-semibold">
                {skipped.length > 0 && printed < keys.length
                  ? `${printed + withCover} de ${keys.length + withCover} páginas`
                  : `${keys.length + withCover} ${keys.length + withCover === 1 ? "página" : "páginas"}`}
              </span>
              {withCover ? " (com a capa)" : ""} · {plan.cover.locations.length}{" "}
              {plan.cover.locations.length === 1 ? "local" : "locais"}
              {plan.filterLabel ? ` · ${plan.filterLabel}` : ""}
            </p>
          )}
          {!s.wholeSheet && empty.length > 0 && (
            <p className="text-neutral-500">
              Sem itens do filtro:{" "}
              {candidates
                .filter((c) => empty.includes(c.locationId))
                .map((c) => c.name)
                .join(", ")}
            </p>
          )}
          {missingNames.length > 0 && (
            <p className="flex items-start gap-1.5 text-amber-300">
              <TriangleAlert size={14} className="mt-px shrink-0" />
              <span>
                PDF não encontrado, fica de fora (listado na capa): {missingNames.join(", ")}
              </span>
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            {skipped.length > 0 && (
              <button
                type="button"
                onClick={() => setReportSkipped([])}
                className="mr-auto text-[11px] text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                incluir todas
              </button>
            )}
            <Button onClick={() => setReportOpen(false)}>Fechar</Button>
            <Button variant="primary" disabled={busy || printed === 0} onClick={() => void run()}>
              <FileDown size={15} />
              {busy ? "Gerando…" : "Exportar PDF"}
            </Button>
          </div>
        </div>
      </div>
      <ReportPreview
        result={result}
        busy={preview.busy}
        error={preview.error}
        skipped={skipped}
        selected={selected}
        onSelect={setReportSelected}
        onToggle={toggleSkip}
        onGoTo={showOnDrawing}
        goToBlocked={goToBlocked}
        empty={plan.pages.length === 0 ? "Nada do filtro nos locais escolhidos." : undefined}
      />
    </Dialog>
  );
}
