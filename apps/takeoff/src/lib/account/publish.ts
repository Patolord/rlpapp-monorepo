import {
  DESKTOP_BUDGET_ERROR_CODES,
  type DesktopBudgetErrorCode,
  unsupportedCurrencyError,
} from "@rlpapp/shared/takeoff/desktopBudget";
import { ConvexError } from "convex/values";
import { buildPublishBudget } from "../publishBudget";
import type { Project, SentToApp } from "../types";
import type { PublishArgs, PublishObra, PublishOptions, PublishResult } from "./convex";
import { SignedOutError } from "./session";

/**
 * Sending the approved budget to the company app, as the signed-in user: load the obras and the
 * previous send, then publish and turn the server's answer (or refusal) into something the dialog
 * can show. The Convex calls come in as `PublishClient`, so the flow is tested without a network.
 */

export interface PublishClient {
  options(externalId: string | undefined): Promise<PublishOptions>;
  publish(args: PublishArgs): Promise<PublishResult>;
}

export type PublishErrorCode =
  | DesktopBudgetErrorCode
  /** Not signed in, or the device token was revoked. */
  | "SIGNED_OUT"
  /** The account lacks the engineering permission. */
  | "FORBIDDEN"
  /** The company app could not be reached. */
  | "OFFLINE"
  | "UNKNOWN";

export interface PublishError {
  code: PublishErrorCode;
  message: string;
  /** The device token was refused: the session is gone and has to be dropped here. */
  revoked?: boolean;
}

export const FORBIDDEN_MESSAGE =
  "Sua conta não tem permissão para enviar orçamentos ao app: é preciso ser da engenharia " +
  "(engenheiro ou departamento de engenharia). Peça o acesso a um administrador.";

const SIGNED_OUT_MESSAGE = "Entre com a conta da empresa para enviar o orçamento ao app.";

const isBudgetCode = (code: unknown): code is DesktopBudgetErrorCode =>
  typeof code === "string" && (DESKTOP_BUDGET_ERROR_CODES as readonly string[]).includes(code);

/** A readable reason for a failed call, with the backend's code when it gave one. */
export function describePublishError(e: unknown): PublishError {
  if (e instanceof SignedOutError) return { code: "SIGNED_OUT", message: e.message, revoked: true };
  if (e instanceof ConvexError) {
    const data = e.data as { code?: unknown; message?: unknown } | string;
    if (typeof data === "string") return { code: "UNKNOWN", message: data };
    const message = typeof data?.message === "string" ? data.message : String(data?.code ?? "");
    if (isBudgetCode(data?.code)) return { code: data.code, message };
    if (data?.code === "FORBIDDEN") return { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };
    return { code: "UNKNOWN", message: message || "O app da empresa recusou o envio" };
  }
  const text = e instanceof Error ? e.message : String(e);
  // permission wrappers throw plain errors: readable in development, redacted in production
  if (/Acesso restrito|Insufficient permissions/i.test(text)) {
    return { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE };
  }
  if (/Usuário desativado/i.test(text)) {
    return {
      code: "FORBIDDEN",
      message: "Sua conta está desativada no app da empresa. Fale com um administrador.",
    };
  }
  if (/Not authenticated/i.test(text)) return { code: "SIGNED_OUT", message: SIGNED_OUT_MESSAGE };
  const redacted = text.match(/\[Request ID: ([^\]]+)\] Server Error/);
  if (redacted) {
    return {
      code: "UNKNOWN",
      message:
        "O app da empresa recusou o envio sem informar o motivo. Tente de novo; se continuar, " +
        `avise o suporte com o código ${redacted[1]}.`,
    };
  }
  if (/fetch|network|Failed to|ECONN|ENOTFOUND|timed? ?out/i.test(text)) {
    return {
      code: "OFFLINE",
      message: `Sem conexão com o app da empresa agora (${text}). Confira a internet e tente de novo.`,
    };
  }
  return { code: "UNKNOWN", message: text || "Falha ao enviar o orçamento" };
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: PublishError };

/** The obras and the previous send of this takeoff (by its id, when it has one). */
export async function loadPublishOptions(
  client: PublishClient,
  signedIn: boolean,
  externalId: string | undefined,
): Promise<Outcome<PublishOptions>> {
  if (!signedIn) return { ok: false, error: { code: "SIGNED_OUT", message: SIGNED_OUT_MESSAGE } };
  try {
    const options = await client.options(externalId);
    if (!options.canPublish) {
      return { ok: false, error: { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE } };
    }
    return { ok: true, value: options };
  } catch (e) {
    return { ok: false, error: describePublishError(e) };
  }
}

/**
 * The obra the dialog starts on: the one this file was sent to, else the one the app says this
 * takeoff is in (a file saved before the link was recorded, or on another machine). Only if it is
 * still listed.
 */
export function defaultObraId(project: Project, options: PublishOptions | null): string | null {
  if (!options) return null;
  const listed = (id: string | null | undefined) =>
    id && options.projects.some((p) => p._id === id) ? id : null;
  return listed(project.sentToApp?.obraId) ?? listed(options.current?.projectId);
}

/** The payload for `project` (which must already have its id) going to `obra`. */
export function publishArgs(project: Project, obra: PublishObra): PublishArgs {
  if (!project.id) throw new Error("O takeoff precisa de um id antes do envio");
  return buildPublishBudget(project, { externalId: project.id, projectId: obra._id });
}

/** A budget the app cannot take as is (currency), before anything is sent. */
export function budgetProblem(project: Project): PublishError | null {
  const currency = unsupportedCurrencyError(project.currency);
  return currency ? { code: "UNSUPPORTED_CURRENCY", message: currency } : null;
}

export interface SentBudget {
  result: PublishResult;
  /** What to record in the project file. */
  sentToApp: SentToApp;
}

/**
 * Send the approved budget. The caller has the user's confirmation that the client approved it
 * and has given the project its id; on success the returned `sentToApp` goes into the file.
 */
export async function sendApprovedBudget(input: {
  client: PublishClient;
  signedIn: boolean;
  project: Project;
  obra: PublishObra;
  /** The signed-in account's name, recorded as who sent it. */
  userName?: string;
  now?: () => number;
}): Promise<Outcome<SentBudget>> {
  const { client, project, obra } = input;
  if (!input.signedIn) {
    return { ok: false, error: { code: "SIGNED_OUT", message: SIGNED_OUT_MESSAGE } };
  }
  const problem = budgetProblem(project);
  if (problem) return { ok: false, error: problem };
  let args: PublishArgs;
  try {
    args = publishArgs(project, obra);
  } catch (e) {
    return { ok: false, error: describePublishError(e) };
  }
  try {
    const result = await client.publish(args);
    return {
      ok: true,
      value: {
        result,
        sentToApp: {
          obraId: obra._id,
          obraName: obra.name,
          obraSlug: obra.slug,
          sentAt: (input.now ?? Date.now)(),
          ...(input.userName ? { sentBy: input.userName } : {}),
        },
      },
    };
  } catch (e) {
    return { ok: false, error: describePublishError(e) };
  }
}

/** "3 novas · 2 atualizadas · 1 removida · 5 sem mudança". */
export function resultCounts(result: PublishResult): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    part(result.inserted, "nova", "novas"),
    part(result.updated, "atualizada", "atualizadas"),
    part(result.removed, "removida", "removidas"),
    part(result.unchanged, "sem mudança", "sem mudança"),
  ].join(" · ");
}

/** Why purchasing kept a line the desktop changed or removed. */
export const KEPT_REASON: Record<PublishResult["kept"][number]["reason"], string> = {
  changed_in_desktop: "alterada aqui, mas a Compras já trabalhou nela: ficou como estava no app",
  removed_in_desktop:
    "saiu do orçamento aqui, mas a Compras já trabalhou nela: continua no app, marcada como removida",
};
