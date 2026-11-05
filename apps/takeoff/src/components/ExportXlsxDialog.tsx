import clsx from "clsx";
import { FileSpreadsheet } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { exportXlsx } from "../lib/files";
import { formatMoney } from "../lib/units";
import { defaultXlsxOptions, type XlsxExportOptions, xlsxTabs } from "../lib/xlsxExport";
import { useStore } from "../store";
import { readPref, writePref } from "../store/shared";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

/** The switches remembered between exports (the tabs are chosen anew each time). */
type Remembered = Pick<XlsxExportOptions, "resumo" | "hideEmpty" | "prices">;
const PREF = "xlsxOptions";

function Check({
  checked,
  onChange,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-neutral-200">
      <input
        type="checkbox"
        className="mt-0.5 accent-orange-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {children}
        {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * "Exportar planilha (.xlsx)": which discipline tabs go into the workbook (an estimator often
 * sends one discipline at a time) and how: sections by location or group, the Resumo tab,
 * zero-quantity items, prices. Enter exports with what is marked.
 */
export function ExportXlsxDialog() {
  const open = useStore((s) => s.xlsxExportOpen);
  if (!open) return null;
  return <ExportXlsxForm />;
}

function ExportXlsxForm() {
  const project = useStore((s) => s.project);
  const setOpen = useStore((s) => s.setXlsxExportOpen);
  const tabs = useMemo(() => xlsxTabs(project), [project]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(tabs.map((t) => t.system)));
  const [options, setOptions] = useState<XlsxExportOptions>(() => ({
    ...defaultXlsxOptions(project),
    ...readPref<Partial<Remembered>>(PREF, {}),
  }));
  const [busy, setBusy] = useState(false);

  const selected = tabs.filter((t) => chosen.has(t.system));
  const total = selected.reduce((s, t) => s + t.proposal, 0);
  const money = (v: number) => formatMoney(v, project.currency);
  const set = (patch: Partial<XlsxExportOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const toggleTab = (system: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(system)) next.delete(system);
      else next.add(system);
      return next;
    });

  const run = async () => {
    if (busy || selected.length === 0) return;
    const { resumo, hideEmpty, prices } = options;
    writePref(PREF, { resumo, hideEmpty, prices } satisfies Remembered);
    setBusy(true);
    try {
      const all = selected.length === tabs.length;
      const done = await exportXlsx({
        ...options,
        systems: all ? null : selected.map((t) => t.system),
      });
      if (done) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const sectionsLocked = project.locations.length === 0;
  return (
    <Dialog
      title="Exportar planilha (.xlsx)"
      onClose={() => setOpen(false)}
      onSubmit={() => void run()}
      className="w-[26rem] text-xs"
      bodyClassName="flex min-h-0 flex-col overflow-y-auto"
    >
      <section className="space-y-2 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
            Disciplinas
          </h3>
          <p className="text-[11px] text-neutral-500">cada uma vira uma aba da planilha</p>
          {tabs.length > 1 && (
            <span className="ml-auto flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setChosen(new Set(tabs.map((t) => t.system)))}
                className="text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                todas
              </button>
              <button
                type="button"
                onClick={() => setChosen(new Set())}
                className="text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                nenhuma
              </button>
            </span>
          )}
        </div>
        {tabs.length === 0 ? (
          <p className="py-2 text-neutral-500">Nada medido ainda.</p>
        ) : (
          <ul className="space-y-1">
            {tabs.map((t) => (
              <li key={t.system}>
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 ring-1",
                    chosen.has(t.system)
                      ? "bg-orange-500/10 text-neutral-100 ring-orange-400/40"
                      : "text-neutral-400 ring-neutral-800 hover:bg-neutral-800",
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-orange-500"
                    checked={chosen.has(t.system)}
                    onChange={() => toggleTab(t.system)}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold uppercase">
                    {t.system}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {t.rows} {t.rows === 1 ? "item" : "itens"}
                  </span>
                  <span className="w-[7rem] text-right font-mono">{money(t.proposal)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2.5 border-b border-neutral-800 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Opções</h3>
        <div className="flex items-center gap-2">
          <span className="w-16 text-neutral-400">Seções</span>
          <div className="inline-flex overflow-hidden rounded ring-1 ring-neutral-700">
            {(
              [
                ["local", "por local"],
                ["grupo", "por grupo"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={options.sectionsBy === v}
                disabled={v === "local" && sectionsLocked}
                onClick={() => set({ sectionsBy: v })}
                className={clsx(
                  "px-2 py-0.5 text-[11px] disabled:cursor-default disabled:opacity-40",
                  options.sectionsBy === v
                    ? "bg-orange-500 text-neutral-950"
                    : "text-neutral-300 hover:bg-neutral-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {sectionsLocked && (
            <span className="text-[11px] text-neutral-500">sem locais no takeoff</span>
          )}
        </div>
        <Check
          checked={options.resumo}
          onChange={(resumo) => set({ resumo })}
          hint="Uma linha por disciplina, com o BDI de cada aba."
        >
          Aba Resumo
        </Check>
        <Check
          checked={options.hideEmpty}
          onChange={(hideEmpty) => set({ hideEmpty })}
          hint="Por grupo, itens com quantidade zero ficam na aba para preencher à mão."
        >
          Omitir itens sem quantidade
        </Check>
        <Check
          checked={!options.prices}
          onChange={(on) => set({ prices: !on })}
          hint="Preços em branco: lista de quantidades para pedir cotação."
        >
          Só quantidades
        </Check>
      </section>
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="mr-auto text-neutral-400">
          {selected.length === 0
            ? "Marque ao menos uma disciplina"
            : `${selected.length} ${selected.length === 1 ? "aba" : "abas"}${options.resumo ? " + Resumo" : ""}${options.prices ? ` · ${money(total)}` : ""}`}
        </span>
        <Button type="button" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={busy || selected.length === 0}>
          <FileSpreadsheet size={15} />
          {busy ? "Exportando…" : "Exportar"}
        </Button>
      </div>
    </Dialog>
  );
}
