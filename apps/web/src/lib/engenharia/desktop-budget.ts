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
  /** Totais da linha como o desktop calculou; null = quantidade × preço. */
  materialTotalCents: number | null;
  laborTotalCents: number | null;
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

/**
 * Total de material da linha: o publicado pelo desktop (preço sem arredondar,
 * fecha com o resumo da aba) ou, se a Compras mudou quantidade ou preço (o
 * backend apaga o total), quantidade × preço unitário em centavos.
 */
export function lineMaterialCents(item: DesktopBudgetItem): number {
  return (
    item.materialTotalCents ??
    Math.round((item.quantity ?? 0) * (item.estimatedUnitPriceCents ?? 0))
  );
}

export function lineLaborCents(item: DesktopBudgetItem): number {
  return (
    item.laborTotalCents ??
    Math.round((item.quantity ?? 0) * (item.laborUnitPriceCents ?? 0))
  );
}

/**
 * Chave de aba / seção como o desktop compara nomes no id da linha (maiúsculas
 * e espaços nas pontas ignorados): uma linha que a Compras congelou guarda o
 * nome antigo ("Exaustão") quando o desktop só muda a grafia ("EXAUSTÃO").
 */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

type Group<V> = { name: string; value: V };

/** Grupo da chave `name`; o primeiro nome visto fica como o exibido. */
function groupFor<V>(
  groups: Map<string, Group<V>>,
  name: string,
  create: () => V
): V {
  const key = nameKey(name);
  let group = groups.get(key);
  if (!group) {
    group = { name, value: create() };
    groups.set(key, group);
  }
  return group.value;
}

/**
 * Linhas na ordem recebida (a do desktop); abas na ordem do resumo publicado,
 * com o nome do resumo. Linhas que saíram do orçamento desktop
 * (`externalRemovedAt`) aparecem, mas não entram nos totais.
 */
export function groupDesktopBudget<T extends DesktopBudgetItem>(
  items: readonly T[],
  sheetsMeta: readonly DesktopBudgetSheetMeta[]
): DesktopBudgetSheet<T>[] {
  type Sheet = {
    meta: DesktopBudgetSheetMeta | undefined;
    sections: Map<string, Group<T[]>>;
  };
  const bySheet = new Map<string, Group<Sheet>>();
  for (const meta of sheetsMeta) {
    groupFor(bySheet, meta.name, () => ({ meta, sections: new Map() }));
  }
  for (const item of items) {
    const sheet = groupFor(bySheet, item.sheet ?? OTHER_SHEET, () => ({
      meta: undefined,
      sections: new Map(),
    }));
    groupFor(sheet.sections, item.section ?? NO_SECTION, () => []).push(item);
  }

  const out: DesktopBudgetSheet<T>[] = [];
  for (const { name, value: sheet } of bySheet.values()) {
    if (sheet.sections.size === 0) continue;
    const sections: DesktopBudgetSection<T>[] = [];
    for (const { name: sectionName, value: lines } of sheet.sections.values()) {
      let materialCents = 0;
      let laborCents = 0;
      for (const line of lines) {
        if (line.externalRemovedAt !== null) continue;
        materialCents += lineMaterialCents(line);
        laborCents += lineLaborCents(line);
      }
      sections.push({ name: sectionName, lines, materialCents, laborCents });
    }
    const meta = sheet.meta;
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
