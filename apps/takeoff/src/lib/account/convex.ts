import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import type { RemoteCatalog } from "../catalog";
import { parseRemoteCatalogResponse } from "../catalog";
import type { ProposalBody, SendOutcome, SignedInProposal } from "../catalogRemote";
import { CONVEX_URL } from "./config";
import { getJwt, SignedOutError } from "./session";

/**
 * Typed calls to the company backend as the signed-in user: the backend's own function
 * references and types (`api.*` from @rlpapp/backend), authenticated with the account's JWT.
 * Access follows the user's permissions there (engineering or purchasing).
 */

let client: ConvexHttpClient | null = null;
const getClient = (): ConvexHttpClient => {
  client ??= new ConvexHttpClient(CONVEX_URL);
  return client;
};

/**
 * Run a call with the current JWT. A refusal that is not a domain error (ConvexError) may be an
 * expired or rotated JWT: renew it and try once more. A revoked device token surfaces as
 * SignedOutError from the renewal.
 */
async function asUser<T>(call: (c: ConvexHttpClient) => Promise<T>): Promise<T> {
  const c = getClient();
  c.setAuth(await getJwt());
  try {
    return await call(c);
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    c.setAuth(await getJwt(true));
    return await call(c);
  }
}

/** The company catalog (`takeoffCatalog.current`), parsed like the token route's JSON. */
export async function fetchCatalogAsUser(): Promise<RemoteCatalog> {
  const snapshot = await asUser((c) => c.query(api.takeoffCatalog.current, {}));
  return parseRemoteCatalogResponse(snapshot);
}

export type FamilyPriceHistory = FunctionReturnType<typeof api.priceEvents.familyHistory>;

/**
 * Price history of the comparable item a company material belongs to (its family): every
 * variant with its reference and every supplier's quotes of the last twelve months.
 */
export function fetchFamilyHistoryAsUser(materialId: string): Promise<FamilyPriceHistory> {
  return asUser((c) =>
    c.query(api.priceEvents.familyHistory, {
      materialId: materialId as Id<"materials">,
      now: Date.now(),
    }),
  );
}

/** Only the fields the mutation accepts: queued bodies of older versions may carry others. */
export function signedInProposalArgs(body: ProposalBody): SignedInProposal {
  return {
    clientId: body.clientId,
    materialId: body.materialId,
    name: body.name,
    variantLabel: body.variantLabel,
    spec: body.spec,
    category: body.category,
    unit: body.unit,
    dimensions: body.dimensions,
    unitPrice: body.unitPrice,
    priceDate: body.priceDate,
    takeoffName: body.takeoffName,
  };
}

export const PROPOSAL_FORBIDDEN_MESSAGE =
  "sua conta não tem permissão para enviar materiais a compras (é preciso engenharia ou " +
  "compras); peça o acesso a um administrador";

/**
 * What a failed `proposeAsUser` call means for the queued proposal. Domain refusals (ConvexError:
 * invalid proposal, unknown material) are final. Access refusals (FORBIDDEN: an account with
 * only the takeoff access, or deactivated; UNAUTHENTICATED) are about the account, not the
 * proposal: it stays queued for when the account gets the access or another one signs in.
 * Anything else is retried later too.
 */
export function proposalFailure(e: unknown): Exclude<SendOutcome, { kind: "sent" }> {
  if (e instanceof ConvexError) {
    const data = e.data as { code?: unknown; message?: unknown } | string;
    if (typeof data === "string") return { kind: "rejected", message: data };
    if (data?.code === "FORBIDDEN") {
      return {
        kind: "retry",
        message: /desativado/i.test(String(data.message ?? ""))
          ? "sua conta está desativada no app da empresa"
          : PROPOSAL_FORBIDDEN_MESSAGE,
      };
    }
    if (data?.code === "UNAUTHENTICATED") {
      return { kind: "retry", message: "entre de novo com a conta da empresa" };
    }
    const message =
      typeof data?.message === "string" ? data.message : String(data?.code ?? "recusado");
    return { kind: "rejected", message };
  }
  return { kind: "retry", message: e instanceof Error ? e.message : String(e) };
}

/**
 * `takeoffMaterials.proposeAsUser`: the requester is the signed-in user. Failures are classified
 * by `proposalFailure`. SignedOutError propagates: the caller drops the session and keeps the
 * proposal queued.
 */
export async function sendProposalAsUser(body: ProposalBody): Promise<SendOutcome> {
  try {
    const result = await asUser((c) =>
      c.mutation(api.takeoffMaterials.proposeAsUser, signedInProposalArgs(body)),
    );
    return { kind: "sent", result };
  } catch (e) {
    if (e instanceof SignedOutError) throw e;
    return proposalFailure(e);
  }
}

// ---------------------------------------------------------------------------
// Approved budget → company app (takeoffs.desktopPublishOptions / publishFromDesktop /
// removeFromDesktop)
// ---------------------------------------------------------------------------

/** Whether the user may send, the obras to choose from and where this takeoff already went. */
export type PublishOptions = FunctionReturnType<typeof api.takeoffs.desktopPublishOptions>;
export type PublishObra = PublishOptions["projects"][number];
export type PublishArgs = FunctionArgs<typeof api.takeoffs.publishFromDesktop>;
export type PublishResult = FunctionReturnType<typeof api.takeoffs.publishFromDesktop>;

export function fetchPublishOptionsAsUser(externalId?: string): Promise<PublishOptions> {
  return asUser((c) => c.query(api.takeoffs.desktopPublishOptions, { externalId }));
}

/**
 * `takeoffs.publishFromDesktop`: creates or updates the approved budget of `externalId`. A retry
 * after a refused JWT (see `asUser`) is safe: publishing the same budget twice is idempotent.
 */
export function publishBudgetAsUser(args: PublishArgs): Promise<PublishResult> {
  return asUser((c) => c.mutation(api.takeoffs.publishFromDesktop, args));
}

export type RemoveArgs = FunctionArgs<typeof api.takeoffs.removeFromDesktop>;
export type RemoveResult = FunctionReturnType<typeof api.takeoffs.removeFromDesktop>;

/**
 * `takeoffs.removeFromDesktop`: deletes the approved budget of `externalId` from the app, with
 * its lines. A retry after a refused JWT (see `asUser`) that finds the budget already gone comes
 * back as a `BUDGET_NOT_FOUND` ConvexError, which the flow treats as done.
 */
export function removeBudgetAsUser(args: RemoveArgs): Promise<RemoveResult> {
  return asUser((c) => c.mutation(api.takeoffs.removeFromDesktop, args));
}

// ---------------------------------------------------------------------------
// Memory of the AI agent, shared by the company (takeoffAgentMemory.*)
// ---------------------------------------------------------------------------

export type AgentMemoryRows = FunctionReturnType<typeof api.takeoffAgentMemory.list>;
export type AgentMemoryAddArgs = FunctionArgs<typeof api.takeoffAgentMemory.add>;
export type AgentMemoryAddResult = FunctionReturnType<typeof api.takeoffAgentMemory.add>;

/** Every entry of the company's memory, in use and proposed. */
export function fetchAgentMemoryAsUser(): Promise<AgentMemoryRows> {
  return asUser((c) => c.query(api.takeoffAgentMemory.list, {}));
}

/**
 * `takeoffAgentMemory.add`. A retry after a refused JWT (see `asUser`) is safe for notes and
 * terms (the same lesson is not stored twice); a symbol could be stored twice, which shows in
 * the list and is removed there.
 */
export function addAgentMemoryAsUser(args: AgentMemoryAddArgs): Promise<AgentMemoryAddResult> {
  return asUser((c) => c.mutation(api.takeoffAgentMemory.add, args));
}

export function approveAgentMemoryAsUser(id: string): Promise<null> {
  return asUser((c) =>
    c.mutation(api.takeoffAgentMemory.approve, { id: id as Id<"takeoffAgentMemory"> }),
  );
}

export function removeAgentMemoryAsUser(id: string): Promise<null> {
  return asUser((c) =>
    c.mutation(api.takeoffAgentMemory.remove, { id: id as Id<"takeoffAgentMemory"> }),
  );
}

// ---------------------------------------------------------------------------
// Built-in AI agent (takeoffAgent.*)
// ---------------------------------------------------------------------------

export type AgentStatus = FunctionReturnType<typeof api.takeoffAgent.getStatus>;
export type AgentRunStartResult = FunctionReturnType<typeof api.takeoffAgent.startRun>;
export type AgentReviewStatsInput = {
  pending: number;
  accepted: number;
  edited: number;
  rejected: number;
};

/** Company AI settings, user permission, and current-month budget meters. */
export function fetchAgentStatusAsUser(): Promise<AgentStatus> {
  return asUser((c) => c.query(api.takeoffAgent.getStatus, { now: Date.now() }));
}

export function startAgentRunAsUser(args: {
  takeoffName?: string;
  takeoffExternalId?: string;
}): Promise<AgentRunStartResult> {
  return asUser((c) =>
    c.mutation(api.takeoffAgent.startRun, {
      takeoffName: args.takeoffName,
      takeoffExternalId: args.takeoffExternalId,
    }),
  );
}

export function finishAgentRunAsUser(args: {
  runId: string;
  status: "completed" | "aborted" | "error";
  errorMessage?: string;
}): Promise<null> {
  return asUser((c) =>
    c.mutation(api.takeoffAgent.finishRun, {
      runId: args.runId as Id<"takeoffAgentRuns">,
      status: args.status,
      errorMessage: args.errorMessage,
    }),
  );
}

export function reportAgentReviewStatsAsUser(args: {
  runId: string;
  reviewStats: AgentReviewStatsInput;
}): Promise<null> {
  return asUser((c) =>
    c.mutation(api.takeoffAgent.reportReviewStats, {
      runId: args.runId as Id<"takeoffAgentRuns">,
      ...args.reviewStats,
    }),
  );
}

/** The reason the backend gave for refusing a call (`ConvexError` data), else the error's own. */
export function refusalMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { code?: unknown; message?: unknown } | string;
    if (typeof data === "string") return data;
    if (typeof data?.message === "string") return data.message;
    return String(data?.code ?? "recusado");
  }
  return e instanceof Error ? e.message : String(e);
}
