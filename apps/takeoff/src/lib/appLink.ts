import type { PublishDesktopBudgetArgs } from "@rlpapp/shared/takeoff/desktopBudget";
import type { Project, SentToApp } from "./types";

/**
 * The link between a takeoff file and its approved budget in the company app: the project's
 * stable `id` (the budget's `externalId` there) and where it was sent (`sentToApp`). Pure: no
 * store, no network.
 *
 * Only budgets the client approved go to the app, where purchasing works on them; sending again
 * (a revision of the approved budget) updates the same budget, so the id must survive saves,
 * undo and reopening, and a copy that becomes another budget must not keep it.
 */

/** A new project id: random, long enough never to collide across machines. */
export function newProjectUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `${hex()}-${hex()}-${hex()}-${hex()}`;
}

/** The project with an id (the same object when it already has one). */
export function withProjectId(project: Project, uid: () => string = newProjectUid): Project {
  return project.id ? project : { ...project, id: uid() };
}

/** The project as another budget: a new id and no link to what the original sent to the app. */
export function asSeparateBudget(project: Project, uid: () => string = newProjectUid): Project {
  const { sentToApp: _sent, ...rest } = project;
  return { ...rest, id: uid() };
}

/**
 * `target` carrying the identity of `source`. Undo and redo swap whole project snapshots; the
 * link to the app is not an edit and must not be undone with the edits around it (an undone
 * link would make the next send create a second budget in the app).
 */
export function withIdentityOf(target: Project, source: Project): Project {
  if (target.id === source.id && target.sentToApp === source.sentToApp) return target;
  const { id: _id, sentToApp: _sent, ...rest } = target;
  return {
    ...rest,
    ...(source.id ? { id: source.id } : {}),
    ...(source.sentToApp ? { sentToApp: source.sentToApp } : {}),
  };
}

/**
 * How a save treats the identity:
 * - `save`: the same file (or the first file of a new takeoff): keeps it, adding an id if missing.
 * - `saveAs`: another file. Not sent yet: a new id (nothing in the app to keep in step). Already
 *   sent: `sameBudget` says whether the copy is the same approved budget (a revision that keeps
 *   updating it) or another budget (a new id, unlinked).
 * - `conflictCopy`: "Salvar como cópia" when another machine changed the file: never the same id,
 *   or the two diverging files would overwrite each other's budget in the app.
 */
export type SaveKind = "save" | "saveAs" | "conflictCopy";

/** Whether saving needs to ask if the copy is the same approved budget. */
export const asksSameBudget = (project: Project, kind: SaveKind): boolean =>
  kind === "saveAs" && project.sentToApp !== undefined;

export function identityForSave(
  project: Project,
  kind: SaveKind,
  sameBudget = false,
  uid: () => string = newProjectUid,
): Project {
  if (kind === "conflictCopy") return asSeparateBudget(project, uid);
  if (kind === "saveAs" && !(project.sentToApp && sameBudget)) {
    return asSeparateBudget(project, uid);
  }
  return withProjectId(project, uid);
}

// ---------------------------------------------------------------------------
// Dashboard links and labels
// ---------------------------------------------------------------------------

/** The obras list in the dashboard (where a new obra is created). */
export const obrasUrl = (webUrl: string): string => `${webUrl}/engenharia/obras`;

/** The obra's "Orçamento" page in the dashboard, where the sent budget shows. */
export const obraBudgetUrl = (webUrl: string, obraSlug: string): string =>
  `${webUrl}/engenharia/obras/${encodeURIComponent(obraSlug)}/orcamento`;

const dateTime = (ms: number): string =>
  new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** "Enviado ao app em 01/11/2026 14:03 para a obra Edifício Centro (por Ana)". */
export function sentToAppLabel(sent: SentToApp): string {
  return `Enviado ao app em ${dateTime(sent.sentAt)} para a obra ${sent.obraName}${
    sent.sentBy ? ` (por ${sent.sentBy})` : ""
  }`;
}

/** What the confirmation shows before sending: tabs, lines and the totals of the budget. */
export interface BudgetSummary {
  tabs: number;
  lines: number;
  /** Sum of the tabs' TOTAL GERAL (cost), in cents. */
  totalCents: number;
  /** Sum of the tabs' prices with BDI (the proposal value), in cents. */
  proposalCents: number;
}

export function budgetSummary(args: PublishDesktopBudgetArgs): BudgetSummary {
  return {
    tabs: args.meta.sheets.length,
    lines: args.lines.length,
    totalCents: args.meta.sheets.reduce((s, t) => s + t.totalCents, 0),
    proposalCents: args.meta.sheets.reduce((s, t) => s + t.proposalCents, 0),
  };
}

/** R$ from cents, pt-BR. */
export const centsLabel = (cents: number): string =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
