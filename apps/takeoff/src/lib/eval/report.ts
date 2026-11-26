/**
 * The comparison of compare.ts as text for a person (Markdown, pt-BR), and the totals over a
 * set of cases. Each number stays on its own line: an average of everything would hide where
 * the agent is going wrong.
 */
import type { CountMark, EvalReport, LocationMiss } from "./compare";
import { type Rates, rates } from "./match";

const pct = (v: number | null): string => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const signedPct = (v: number | null): string =>
  v === null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
const qty = (v: number): string =>
  Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const at = (p: { drawing: string; page: number }) => `${p.drawing} p.${p.page}`;
const xy = (p: { x: number; y: number }) => `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;

/** Items listed per section before "e mais N". */
const LIST_LIMIT = 15;

function listed<T>(items: readonly T[], line: (item: T) => string): string[] {
  const out = items.slice(0, LIST_LIMIT).map((i) => `- ${line(i)}`);
  if (items.length > LIST_LIMIT) out.push(`- e mais ${items.length - LIST_LIMIT}`);
  return out;
}

const centre = (pts: readonly { x: number; y: number }[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length),
  y: pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length),
});

const locationLine = (l: LocationMiss) =>
  `${l.name || "(sem nome)"}: ${at(l)}, perto de ${xy(centre(l.points))}`;
const markLine = (m: CountMark) => `${m.item}: ${at(m)} em ${xy(m.at)}`;

/** The headline of one comparison, one line. */
export function headline(r: EvalReport): string {
  return [
    `ambientes ${pct(r.locations.f1)}`,
    `contagens ${pct(r.counts.f1)}`,
    `erro em valor ${pct(r.quantities.valueError)}`,
    `escalas erradas ${r.scales.wrong}/${r.scales.pages.length}`,
  ].join(" · ");
}

export function formatReport(r: EvalReport): string {
  const out: string[] = [];
  const { locations: loc, counts, quantities, scales } = r;
  out.push(`# Avaliação: ${r.candidate || "candidato"} contra ${r.reference || "referência"}`, "");
  out.push(headline(r), "");

  if (r.drawingsMissing.length > 0) {
    out.push(
      `**Plantas da referência que o candidato não tem:** ${r.drawingsMissing.join(", ")}. O que está nelas conta como não encontrado.`,
      "",
    );
  }

  out.push("## Escalas", "");
  if (scales.pages.length === 0) out.push("A referência não tem página com escala.", "");
  else {
    out.push("| Planta | Página | Referência | Candidato | |", "| --- | --- | --- | --- | --- |");
    for (const p of scales.pages) {
      out.push(
        `| ${p.drawing} | ${p.page} | ${p.reference} | ${p.candidate ?? "sem escala"} | ${p.ok ? "ok" : "**errada**"} |`,
      );
    }
    out.push("");
  }

  out.push("## Ambientes", "");
  out.push(
    `Encontrados ${loc.matched.length} de ${loc.matched.length + loc.missed.length} (recall ${pct(loc.recall)}); ${loc.extra.length} a mais (precisão ${pct(loc.precision)}). Sobreposição média dos contornos ${pct(loc.meanIoU)}; nome certo em ${pct(loc.namesRight)} dos encontrados.`,
    "",
  );
  const renamed = loc.matched.filter((m) => !m.nameMatches);
  if (renamed.length > 0) {
    out.push("Contorno certo, nome diferente:");
    out.push(
      ...listed(renamed, (m) => `${m.name} → ${m.candidateName || "(sem nome)"} (${at(m)})`),
      "",
    );
  }
  if (loc.missed.length > 0) out.push("Faltaram:", ...listed(loc.missed, locationLine), "");
  if (loc.extra.length > 0) out.push("Sobraram:", ...listed(loc.extra, locationLine), "");

  out.push("## Contagens", "");
  out.push(
    `Marcas no lugar certo e no item certo: ${counts.matched.length} de ${counts.matched.length + counts.missed.length} (recall ${pct(counts.recall)}); ${counts.extra.length} a mais (precisão ${pct(counts.precision)}).${counts.wrongItem > 0 ? ` Das que faltaram, ${counts.wrongItem} foram marcadas no lugar certo, mas em outro item.` : ""}`,
    "",
  );
  if (counts.items.length > 0) {
    out.push(
      "| Item | Certas | Faltaram | Sobraram | Recall | Precisão |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const i of counts.items) {
      out.push(
        `| ${i.item} | ${i.matched} | ${i.missed} | ${i.extra} | ${pct(i.recall)} | ${pct(i.precision)} |`,
      );
    }
    out.push("");
  }
  if (counts.missed.length > 0) out.push("Faltaram:", ...listed(counts.missed, markLine), "");
  if (counts.extra.length > 0) out.push("Sobraram:", ...listed(counts.extra, markLine), "");

  out.push("## Quantidades por item", "");
  out.push(
    `Erro em valor ${pct(quantities.valueError)} (diferença de quantidade pesada pelo preço de cada item na referência). Por tipo: contagens ${pct(quantities.byKind.count)}, lineares ${pct(quantities.byKind.linear)}, áreas ${pct(quantities.byKind.area)}.`,
    "",
  );
  if (quantities.candidateUnscaled > 0) {
    out.push(
      `${quantities.candidateUnscaled} marcação(ões) do candidato estão em página sem escala e contam como zero.`,
      "",
    );
  }
  if (quantities.rows.length > 0) {
    out.push(
      "| Item | Un. | Referência | Candidato | Erro | |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const row of quantities.rows) {
      const note =
        row.status === "missing"
          ? "não levantado"
          : row.status === "extra"
            ? "não existe na referência"
            : "";
      out.push(
        `| ${row.item} | ${row.unit} | ${qty(row.reference)} | ${qty(row.candidate)} | ${signedPct(row.error)} | ${note} |`,
      );
    }
    out.push("");
  }

  const reviewed = r.review.accepted + r.review.edited + r.review.rejected;
  if (reviewed + r.review.pending > 0) {
    out.push(
      "## Revisão no app",
      "",
      `Sugestões da IA neste arquivo: ${r.review.accepted} aceitas, ${r.review.edited} corrigidas, ${r.review.rejected} descartadas, ${r.review.pending} pendentes.`,
      "",
    );
  }

  const skipped = [
    r.notCompared.derived.length > 0
      ? `redes de dutos e sistemas VRF (${r.notCompared.derived.join(", ")})`
      : "",
    r.notCompared.typedByHand.length > 0
      ? `quantidades digitadas e verticais (${r.notCompared.typedByHand.join(", ")})`
      : "",
  ].filter(Boolean);
  if (skipped.length > 0) {
    out.push("## Fora da comparação", "", `Não dá para ler na planta: ${skipped.join("; ")}.`, "");
  }
  return out.join("\n");
}

export interface CaseResult {
  id: string;
  tags: string[];
  report: EvalReport;
}

export interface SetTotals {
  cases: number;
  locations: Rates;
  counts: Rates;
  /** Cases with at least one page at the wrong scale. */
  casesWithWrongScale: number;
  /** Mean of the cases' value errors; null when no case has one. */
  valueError: number | null;
}

/** Totals over cases: marks and locations are summed before the rates, so big sheets weigh more. */
export function totalsOf(results: readonly CaseResult[]): SetTotals {
  const sum = (pick: (r: EvalReport) => number) => results.reduce((s, c) => s + pick(c.report), 0);
  const values = results
    .map((c) => c.report.quantities.valueError)
    .filter((v): v is number => v !== null);
  return {
    cases: results.length,
    locations: rates(
      sum((r) => r.locations.matched.length),
      sum((r) => r.locations.missed.length),
      sum((r) => r.locations.extra.length),
    ),
    counts: rates(
      sum((r) => r.counts.matched.length),
      sum((r) => r.counts.missed.length),
      sum((r) => r.counts.extra.length),
    ),
    casesWithWrongScale: results.filter((c) => c.report.scales.wrong > 0).length,
    valueError: values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length,
  };
}

/** The table of a set of cases, with a line per tag (the kind of problem the PDF has). */
export function formatSet(results: readonly CaseResult[]): string {
  const out: string[] = ["# Avaliação do conjunto", ""];
  const row = (label: string, t: SetTotals) =>
    `| ${label} | ${t.cases} | ${pct(t.locations.recall)} | ${pct(t.locations.precision)} | ${pct(t.counts.recall)} | ${pct(t.counts.precision)} | ${pct(t.valueError)} | ${t.casesWithWrongScale} |`;
  const header = [
    "| | Casos | Ambientes: recall | precisão | Contagens: recall | precisão | Erro em valor | Casos com escala errada |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  out.push(...header, row("**Todos**", totalsOf(results)));
  const tags = [...new Set(results.flatMap((c) => c.tags))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  for (const tag of tags) {
    out.push(row(tag, totalsOf(results.filter((c) => c.tags.includes(tag)))));
  }
  out.push("", "## Por caso", "");
  for (const c of results) {
    out.push(
      `- **${c.id}**${c.tags.length ? ` (${c.tags.join(", ")})` : ""}: ${headline(c.report)}`,
    );
  }
  out.push("");
  return out.join("\n");
}
