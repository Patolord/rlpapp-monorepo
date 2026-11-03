import {
  type DesktopBudgetLine,
  type DesktopBudgetSheetSummary,
  type PublishDesktopBudgetArgs,
  reaisToCents,
  unsupportedCurrencyError,
} from "@rlpapp/shared/takeoff/desktopBudget";
import { disciplineTotals, round2, systemSheets } from "./quantities";
import { type Project, UNTITLED } from "./types";

/**
 * Builds the argument of the company app's `takeoffs.publishFromDesktop` mutation from a
 * project: the same sheets → sections → rows the budget workbook prints (see `sheetExport`),
 * flattened into lines with ids that stay the same from one publication to the next, plus the
 * BDI, extras and totals of each discipline tab. Pure: no store, no network.
 *
 * `externalId` identifies the project on the server (publishing again updates the same budget);
 * `projectId` is the obra in the company app the budget belongs to.
 *
 * Throws (message in Portuguese, for the user) when the project is priced in a currency other
 * than reais: the company app reads every price as BRL and there is no exchange rate to convert.
 */
export function buildPublishBudget<ProjectId extends string = string>(
  project: Project,
  options: { externalId: string; projectId?: ProjectId },
): PublishDesktopBudgetArgs<ProjectId> {
  const currencyError = unsupportedCurrencyError(project.currency);
  if (currencyError) throw new Error(currencyError);
  const lines: DesktopBudgetLine[] = [];
  const byId = new Map<string, DesktopBudgetLine>();
  for (const sheet of systemSheets(project)) {
    for (const section of sheet.sections) {
      for (const row of section.rows) {
        const externalLineId = budgetLineId(row.item.id, sheet.system, section.name);
        // line totals as the desktop computes them (unrounded unit price × quantity): the unit
        // prices in whole cents alone may not add up to the tab totals (110 × R$ 12,345)
        const materialTotalCents = reaisToCents(round2(row.item.materialPrice * row.qty));
        const laborTotalCents = reaisToCents(round2(row.item.laborPrice * row.qty));
        const same = byId.get(externalLineId);
        if (same) {
          // two sections spelt the same way (e.g. "Térreo" twice) print as one on the server
          same.quantity = round2(same.quantity + row.qty);
          same.materialTotalCents = (same.materialTotalCents ?? 0) + materialTotalCents;
          same.laborTotalCents = (same.laborTotalCents ?? 0) + laborTotalCents;
          continue;
        }
        const line: DesktopBudgetLine = {
          externalLineId,
          rawDescription: row.item.name.trim() || "Item sem nome",
          quantity: row.qty,
          unit: row.unit || undefined,
          materialId: row.item.catalogId || undefined,
          estimatedUnitPriceCents: reaisToCents(row.item.materialPrice),
          laborUnitPriceCents: reaisToCents(row.item.laborPrice),
          materialTotalCents,
          laborTotalCents,
          section: section.name || undefined,
          sheet: sheet.system,
        };
        byId.set(externalLineId, line);
        lines.push(line);
      }
    }
  }

  const sheets: DesktopBudgetSheetSummary[] = disciplineTotals(project).map((t) => ({
    name: t.system,
    bdi: t.bdi,
    extrasPct: t.extrasPct,
    materialCents: reaisToCents(t.material),
    laborCents: reaisToCents(t.labor),
    extrasEachCents: reaisToCents(t.extraEach),
    totalCents: reaisToCents(t.totalGeral),
    proposalCents: reaisToCents(t.proposal),
  }));

  const name = project.name.trim();
  return {
    externalId: options.externalId,
    ...(options.projectId ? { projectId: options.projectId } : {}),
    name: name && name !== UNTITLED ? name : project.proposalNumber.trim() || "Orçamento desktop",
    meta: {
      proposalNumber: textOrUndefined(project.proposalNumber),
      estimator: textOrUndefined(project.estimator),
      client: textOrUndefined(project.client),
      site: textOrUndefined(project.site),
      system: textOrUndefined(project.system),
      currency: textOrUndefined(project.currency),
      sheets,
    },
    lines,
  };
}

/**
 * Line id stable across publications: the item, its tab and its section. Names are compared
 * the way the app groups them (case and surrounding spaces ignored).
 */
export function budgetLineId(itemId: string, sheet: string, section: string): string {
  return [itemId, nameKey(sheet), nameKey(section)].join("|");
}

const nameKey = (name: string): string => name.trim().toLocaleLowerCase("pt-BR");

const textOrUndefined = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;
