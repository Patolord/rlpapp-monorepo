import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { resolveDiscipline } from "../lib/discipline";
import type { DisciplineTotals } from "../lib/quantities";
import type { FactorBase, FooterLine } from "../lib/types";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";

const KINDS: { value: FooterLine["kind"]; label: string }[] = [
  { value: "stat", label: "número" },
  { value: "points", label: "pontos" },
  { value: "perPoint", label: "valor por ponto" },
  { value: "factor", label: "valor × fator" },
];

const BASES: { value: FactorBase; label: string }[] = [
  { value: "material", label: "material da aba" },
  { value: "labor", label: "mão de obra da aba" },
  { value: "total", label: "TOTAL GERAL da aba" },
  { value: "manual", label: "valor digitado" },
];

/** The same line as another kind, keeping its label and what still applies. */
function asKind(line: FooterLine, kind: FooterLine["kind"]): FooterLine {
  const value = "value" in line ? (line.value ?? 0) : 0;
  switch (kind) {
    case "stat":
      return { kind, label: line.label, value };
    case "points":
      return { kind, label: line.label, value };
    case "perPoint":
      return { kind, label: line.label };
    case "factor":
      return { kind, label: line.label, base: "manual", value, factor: 1 };
  }
}

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v) || 0);

/**
 * BDI, extras and the stats footer of one discipline tab, edited inside the Orçamento table.
 * Blank BDI / extras fields mean the project's defaults; the footer starts from the usual
 * lines of that discipline and can be edited or reset.
 */
export function DisciplineFooter({
  system,
  totals,
}: {
  system: string;
  totals?: DisciplineTotals;
}) {
  const project = useStore((s) => s.project);
  const { setDiscipline } = useStore.getState();
  const own = project.disciplines[system] ?? {};
  const { footer } = resolveDiscipline(project, system);
  const money = (v: number) => formatMoney(v, project.currency);
  const setFooter = (lines: FooterLine[] | undefined) => setDiscipline(system, { footer: lines });
  const update = (i: number, patch: Partial<FooterLine>) =>
    setFooter(footer.map((l, k) => (k === i ? ({ ...l, ...patch } as FooterLine) : l)));
  const numInput = (
    value: number,
    onChange: (v: number) => void,
    title: string,
    step = "1",
    width = "w-[5.5rem]",
  ) => (
    <input
      type="number"
      step={step}
      value={value}
      title={title}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className={`num-input ${width}`}
    />
  );

  return (
    <div className="space-y-1.5 border-l-2 border-orange-500/40 pl-2 text-neutral-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-1" title="BDI desta aba; vazio = padrão do projeto">
          BDI ×
          <input
            type="number"
            step="0.01"
            min={1}
            value={own.bdi ?? ""}
            placeholder={String(project.bdi)}
            onChange={(e) => setDiscipline(system, { bdi: num(e.target.value) })}
            className="num-input w-14"
          />
        </label>
        <label
          className="flex items-center gap-1"
          title="Diversos + Transportes + Supervisão desta aba; vazio = padrão do projeto"
        >
          Diversos
          <input
            type="number"
            step="0.5"
            min={0}
            value={own.extrasPct ?? ""}
            placeholder={String(project.extrasPct)}
            onChange={(e) => setDiscipline(system, { extrasPct: num(e.target.value) })}
            className="num-input w-12"
          />
          %
        </label>
        {totals && (
          <span className="ml-auto font-mono text-neutral-300">
            TOTAL GERAL {money(totals.totalGeral)}
            <span className="mx-1 text-neutral-600">·</span>
            <span title={`× BDI ${totals.bdi}`}>venda {money(totals.proposal)}</span>
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
          Rodapé da aba
          <button
            type="button"
            title="Acrescentar uma linha ao rodapé"
            onClick={() => setFooter([...footer, { kind: "stat", label: "", value: 0 }])}
            className="rounded p-0.5 hover:text-neutral-200"
          >
            <Plus size={12} />
          </button>
          {own.footer && (
            <button
              type="button"
              title="Voltar ao rodapé usual desta disciplina"
              onClick={() => setFooter(undefined)}
              className="rounded p-0.5 hover:text-neutral-200"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
        {footer.map((line, i) => (
          <div key={`${i}-${line.kind}`} className="flex flex-wrap items-center gap-1">
            <select
              value={line.kind}
              title="Tipo da linha"
              onChange={(e) =>
                setFooter(
                  footer.map((l, k) =>
                    k === i ? asKind(l, e.target.value as FooterLine["kind"]) : l,
                  ),
                )
              }
              className="rounded bg-neutral-800 px-1 py-0.5 ring-1 ring-neutral-700"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              value={line.label}
              placeholder="Descrição"
              title="Texto impresso na planilha"
              onChange={(e) => update(i, { label: e.target.value })}
              className="h-6 w-[9rem] min-w-0 rounded bg-neutral-800 px-1.5 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
            />
            {(line.kind === "stat" || line.kind === "points") &&
              numInput(line.value, (value) => update(i, { value }), "Valor digitado", "0.01")}
            {line.kind === "factor" && (
              <>
                <select
                  value={line.base}
                  title="Valor que o fator multiplica"
                  onChange={(e) => update(i, { base: e.target.value as FactorBase })}
                  className="rounded bg-neutral-800 px-1 py-0.5 ring-1 ring-neutral-700"
                >
                  {BASES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                {line.base === "manual" &&
                  numInput(line.value ?? 0, (value) => update(i, { value }), "Valor", "0.01")}
                ×{numInput(line.factor, (factor) => update(i, { factor }), "Fator", "0.01", "w-14")}
              </>
            )}
            {line.kind === "perPoint" && (
              <span className="text-neutral-500">= TOTAL GERAL ÷ pontos</span>
            )}
            <button
              type="button"
              title="Remover esta linha"
              onClick={() => setFooter(footer.filter((_, k) => k !== i))}
              className="ml-auto rounded p-0.5 text-neutral-600 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
