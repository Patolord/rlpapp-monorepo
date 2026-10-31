import type { DisciplineTotals } from "../lib/quantities";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v) || 0);

/**
 * BDI and extras of one discipline tab, edited inside the Orçamento table. Blank fields mean
 * the project's defaults (shown as placeholders). The tab's stats footer is not edited here:
 * the sheet gets the discipline's usual lines and the estimator finishes them in Excel.
 */
export function DisciplineBar({ system, totals }: { system: string; totals?: DisciplineTotals }) {
  const project = useStore((s) => s.project);
  const { setDiscipline } = useStore.getState();
  const own = project.disciplines[system] ?? {};
  const money = (v: number) => formatMoney(v, project.currency);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-orange-500/40 pl-2 text-neutral-400">
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
  );
}
