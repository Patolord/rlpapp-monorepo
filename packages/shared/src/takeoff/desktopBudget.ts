/**
 * Contrato entre o app desktop de takeoff (apps/takeoff) e o backend
 * (`takeoffs.publishFromDesktop`). Tipos simples, sem Convex: o desktop monta
 * este objeto a partir do projeto e o backend valida o mesmo formato com o
 * seu validador (a equivalência é verificada em tempo de compilação no
 * backend).
 *
 * Valores em dinheiro vão em centavos inteiros; percentuais e BDI como no
 * desktop (BDI é multiplicador: 1.42 = 42 %; extras em %).
 */

/** Origem gravada em `takeoffs.source` para orçamentos publicados pelo desktop. */
export const DESKTOP_BUDGET_SOURCE = "desktop" as const;

/** Limite de linhas por publicação (limites de escrita de uma mutation). */
export const DESKTOP_BUDGET_MAX_LINES = 2000;

/** Resumo de uma aba (disciplina / sistema) da planilha orçamentária. */
export interface DesktopBudgetSheetSummary {
  /** Nome da aba, igual ao `sheet` das linhas. */
  name: string;
  /** Multiplicador aplicado ao TOTAL GERAL (1.42 = 42 %). */
  bdi: number;
  /** Percentual dos itens dividido em Diversos / Transportes / Supervisão. */
  extrasPct: number;
  materialCents: number;
  laborCents: number;
  /** Valor de cada uma das três linhas de extras. */
  extrasEachCents: number;
  /** TOTAL GERAL da aba: material + mão de obra + 3 × extras. */
  totalCents: number;
  /** TOTAL GERAL × BDI. */
  proposalCents: number;
}

/** Cabeçalho da planilha orçamentária. */
export interface DesktopBudgetMeta {
  proposalNumber?: string;
  estimator?: string;
  client?: string;
  site?: string;
  /** Título do sistema impresso na planilha. */
  system?: string;
  currency?: string;
  sheets: DesktopBudgetSheetSummary[];
}

/** Uma linha do orçamento: um item numa aba e numa seção (local ou grupo). */
export interface DesktopBudgetLine {
  /** Estável entre publicações: mesmo item, mesma aba, mesma seção. */
  externalLineId: string;
  rawDescription: string;
  /** Quantidade orçada (já com perdas). */
  quantity: number;
  unit?: string;
  /** Id do material no catálogo da empresa; ids desconhecidos ficam sem vínculo. */
  materialId?: string;
  /** Preço unitário de material, em centavos. */
  estimatedUnitPriceCents?: number;
  /** Preço unitário de mão de obra, em centavos. */
  laborUnitPriceCents?: number;
  /** Local (ambiente) ou grupo da planilha. */
  section?: string;
  /** Aba (disciplina / sistema). */
  sheet?: string;
}

/** Argumento de `takeoffs.publishFromDesktop`. */
export interface PublishDesktopBudgetArgs<ProjectId extends string = string> {
  /** Id do projeto no desktop; uma publicação por id (republicar atualiza). */
  externalId: string;
  /** Obra do app à qual o orçamento pertence. */
  projectId?: ProjectId;
  name: string;
  meta: DesktopBudgetMeta;
  lines: DesktopBudgetLine[];
}

/** Reais → centavos inteiros (arredondado). */
export function reaisToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
