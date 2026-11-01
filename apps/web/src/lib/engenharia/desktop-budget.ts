/**
 * Agrupa as linhas de um orçamento publicado pelo app desktop como a planilha
 * orçamentária: abas (disciplina / sistema) → seções (local ou grupo) → linhas,
 * com subtotais de material e mão de obra, extras (Diversos / Transportes /
 * Supervisão), TOTAL GERAL e preço com BDI — a mesma conta do desktop, feita
 * sobre os preços atuais das linhas (que a Compras pode ter ajustado).
 */

export type DesktopBudgetItem = {
  quantity: number | null;
  estimatedUnitPriceCents: number | null;
  laborUnitPriceCents: number | null;
  sheet: string | null;
  section: string | null;
  externalRemovedAt: number | null;
};

export type DesktopBudgetSheetMeta = {
  name: string;
  bdi: number;
  extrasPct: number;
  proposalCents: number;
};

export type DesktopBudgetSection<T> = {
  name: string;
  lines: T[];
  materialCents: number;
  laborCents: number;
};

export type DesktopBudgetSheet<T> = {
  name: string;
  sections: DesktopBudgetSection<T>[];
  materialCents: number;
  laborCents: number;
  extrasPct: number;
  extrasEachCents: number;
  totalCents: number;
  bdi: number;
  proposalCents: number;
  /** Preço com BDI como publicado pelo desktop; null para abas sem resumo. */
  publishedProposalCents: number | null;
};

/** Aba das linhas sem aba (ex.: adicionadas à mão num takeoff do desktop). */
export const OTHER_SHEET = "Outros itens";
const NO_SECTION = "Sem seção";

export function lineMaterialCents(item: DesktopBudgetItem): number {
  return Math.round((item.quantity ?? 0) * (item.estimatedUnitPriceCents ?? 0));
}

export function lineLaborCents(item: DesktopBudgetItem): number {
  return Math.round((item.quantity ?? 0) * (item.laborUnitPriceCents ?? 0));
}

/**
 * Linhas na ordem recebida (a do desktop); abas na ordem do resumo publicado.
 * Linhas que saíram do orçamento desktop (`externalRemovedAt`) aparecem, mas
 * não entram nos totais.
 */
export function groupDesktopBudget<T extends DesktopBudgetItem>(
  items: readonly T[],
  sheetsMeta: readonly DesktopBudgetSheetMeta[]
): DesktopBudgetSheet<T>[] {
  const bySheet = new Map<string, Map<string, T[]>>();
  for (const meta of sheetsMeta) bySheet.set(meta.name, new Map());
  for (const item of items) {
    const sheetName = item.sheet ?? OTHER_SHEET;
    let sections = bySheet.get(sheetName);
    if (!sections) {
      sections = new Map();
      bySheet.set(sheetName, sections);
    }
    const sectionName = item.section ?? NO_SECTION;
    const lines = sections.get(sectionName);
    if (lines) lines.push(item);
    else sections.set(sectionName, [item]);
  }

  const metaByName = new Map(sheetsMeta.map((m) => [m.name, m]));
  const out: DesktopBudgetSheet<T>[] = [];
  for (const [name, sectionMap] of bySheet) {
    if (sectionMap.size === 0) continue;
    const sections: DesktopBudgetSection<T>[] = [];
    for (const [sectionName, lines] of sectionMap) {
      let materialCents = 0;
      let laborCents = 0;
      for (const line of lines) {
        if (line.externalRemovedAt !== null) continue;
        materialCents += lineMaterialCents(line);
        laborCents += lineLaborCents(line);
      }
      sections.push({ name: sectionName, lines, materialCents, laborCents });
    }
    const meta = metaByName.get(name);
    const materialCents = sum(sections.map((s) => s.materialCents));
    const laborCents = sum(sections.map((s) => s.laborCents));
    const extrasPct = meta?.extrasPct ?? 0;
    const bdi = meta?.bdi ?? 1;
    const extrasEachCents = Math.round(
      ((materialCents + laborCents) * (extrasPct / 100)) / 3
    );
    const totalCents = materialCents + laborCents + extrasEachCents * 3;
    out.push({
      name,
      sections,
      materialCents,
      laborCents,
      extrasPct,
      extrasEachCents,
      totalCents,
      bdi,
      proposalCents: Math.round(totalCents * bdi),
      publishedProposalCents: meta?.proposalCents ?? null,
    });
  }
  return out;
}

/** BDI como percentual: 1.42 → "42 %". */
export function formatBdi(bdi: number): string {
  const pct = Math.round((bdi - 1) * 10000) / 100;
  return `${pct.toLocaleString("pt-BR")} %`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
