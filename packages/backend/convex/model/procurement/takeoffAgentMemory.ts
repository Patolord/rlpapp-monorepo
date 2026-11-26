import { ConvexError, v } from "convex/values";
import {
  type AgentMemoryInput,
  agentMemoryKey,
  agentMemoryProblem,
  cleanAgentMemoryInput,
  MAX_MEMORY_ENTRIES,
  MAX_MEMORY_SYMBOLS,
} from "@rlpapp/shared/takeoff/agentMemory";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  takeoffAgentMemoryKind,
  takeoffAgentMemoryOrigin,
  takeoffAgentMemoryStatus,
} from "../../schema/procurement";

/**
 * Memory of the AI agent of the RLP Takeoff desktop app (`takeoffAgentMemory`): the company's
 * conventions about its drawings, shared by everyone who uses the app. The kinds, limits and
 * validation are the shared ones (@rlpapp/shared/takeoff/agentMemory); this file stores them.
 *
 * The whole table is the working set: the agent reads every active entry on every takeoff, so
 * it is capped (`MAX_MEMORY_ENTRIES`) and read in one bounded scan instead of through indexes.
 */

/** An entry as the app receives it. */
export const takeoffAgentMemoryEntryValidator = v.object({
  id: v.id("takeoffAgentMemory"),
  kind: takeoffAgentMemoryKind,
  scope: v.string(),
  text: v.string(),
  target: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  status: takeoffAgentMemoryStatus,
  origin: takeoffAgentMemoryOrigin,
  source: v.union(v.string(), v.null()),
  createdAt: v.number(),
  /** Name of who added it (or whose agent proposed it). */
  createdBy: v.union(v.string(), v.null()),
});

export type TakeoffAgentMemoryEntry = {
  id: Id<"takeoffAgentMemory">;
  kind: Doc<"takeoffAgentMemory">["kind"];
  scope: string;
  text: string;
  target: string | null;
  image: string | null;
  status: Doc<"takeoffAgentMemory">["status"];
  origin: Doc<"takeoffAgentMemory">["origin"];
  source: string | null;
  createdAt: number;
  createdBy: string | null;
};

/** What the app sends to create an entry. */
export const takeoffAgentMemoryInputValidator = v.object({
  kind: takeoffAgentMemoryKind,
  text: v.string(),
  scope: v.optional(v.string()),
  target: v.optional(v.string()),
  image: v.optional(v.string()),
  source: v.optional(v.string()),
});

export const takeoffAgentMemoryAddResultValidator = v.object({
  id: v.id("takeoffAgentMemory"),
  status: takeoffAgentMemoryStatus,
  /** False when the same note or term was already there (its entry is the one returned). */
  added: v.boolean(),
});

/** Every entry, oldest first. Bounded by the cap `addTakeoffAgentMemory` enforces. */
async function allEntries(ctx: QueryCtx): Promise<Doc<"takeoffAgentMemory">[]> {
  return await ctx.db.query("takeoffAgentMemory").take(MAX_MEMORY_ENTRIES + 1);
}

export async function listTakeoffAgentMemory(ctx: QueryCtx): Promise<TakeoffAgentMemoryEntry[]> {
  const rows = await allEntries(ctx);
  const names = new Map<Id<"users">, string | null>();
  const out: TakeoffAgentMemoryEntry[] = [];
  for (const row of rows) {
    if (!names.has(row.createdByUserId)) {
      names.set(row.createdByUserId, (await ctx.db.get("users", row.createdByUserId))?.name ?? null);
    }
    out.push({
      id: row._id,
      kind: row.kind,
      scope: row.scope,
      text: row.text,
      target: row.target ?? null,
      image: row.image ?? null,
      status: row.status,
      origin: row.origin,
      source: row.source ?? null,
      createdAt: row.createdAt,
      createdBy: names.get(row.createdByUserId) ?? null,
    });
  }
  return out;
}

const refuse = (code: "INVALID_MEMORY" | "MEMORY_FULL" | "MEMORY_NOT_FOUND", message: string) =>
  new ConvexError({ code, message });

/**
 * Store an entry. `proposed` marks what the user's AI agent suggested: it waits as a proposal
 * until a person approves it. A note or term already in memory is not duplicated; when a person
 * adds a lesson that was waiting as a proposal, that approves it.
 */
export async function addTakeoffAgentMemory(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: AgentMemoryInput,
  proposed: boolean
): Promise<{ id: Id<"takeoffAgentMemory">; status: "ativa" | "proposta"; added: boolean }> {
  const problem = agentMemoryProblem(input);
  if (problem) throw refuse("INVALID_MEMORY", `Memória não gravada: ${problem}`);
  const clean = cleanAgentMemoryInput(input);
  const key = agentMemoryKey(clean);
  const rows = await allEntries(ctx);

  const same = key === null ? undefined : rows.find((r) => r.dedupeKey === key);
  if (same) {
    if (same.status === "proposta" && !proposed) {
      await approveTakeoffAgentMemory(ctx, user, same._id);
      return { id: same._id, status: "ativa", added: false };
    }
    return { id: same._id, status: same.status, added: false };
  }

  if (rows.length >= MAX_MEMORY_ENTRIES) {
    throw refuse(
      "MEMORY_FULL",
      `A memória da IA já tem ${MAX_MEMORY_ENTRIES} entradas: apague as que não servem mais antes de acrescentar`
    );
  }
  if (
    clean.kind === "simbolo" &&
    rows.filter((r) => r.kind === "simbolo").length >= MAX_MEMORY_SYMBOLS
  ) {
    throw refuse(
      "MEMORY_FULL",
      `A memória da IA já tem ${MAX_MEMORY_SYMBOLS} símbolos: apague os que não servem mais antes de acrescentar`
    );
  }

  const status = proposed ? "proposta" : "ativa";
  const id = await ctx.db.insert("takeoffAgentMemory", {
    kind: clean.kind,
    scope: clean.scope,
    text: clean.text,
    target: clean.target,
    image: clean.image,
    status,
    origin: proposed ? "agente" : "usuario",
    source: clean.source,
    dedupeKey: key ?? undefined,
    createdAt: Date.now(),
    createdByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "takeoffAgentMemory",
    recordId: id,
    entityLabel: clean.text.slice(0, 80),
    details: proposed ? "Proposta pelo agente de IA" : undefined,
  });
  return { id, status, added: true };
}

/** Approve a proposal: from then on the agent reads it. Already active is fine. */
export async function approveTakeoffAgentMemory(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"takeoffAgentMemory">
): Promise<void> {
  const row = await ctx.db.get("takeoffAgentMemory", id);
  if (!row) throw refuse("MEMORY_NOT_FOUND", "Esta memória não existe mais");
  if (row.status === "ativa") return;
  await ctx.db.patch("takeoffAgentMemory", id, {
    status: "ativa",
    approvedAt: Date.now(),
    approvedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "takeoffAgentMemory",
    recordId: id,
    entityLabel: row.text.slice(0, 80),
    details: "Proposta da IA aprovada",
  });
}

/** Delete an entry (or discard a proposal). Already gone is fine. */
export async function removeTakeoffAgentMemory(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"takeoffAgentMemory">
): Promise<void> {
  const row = await ctx.db.get("takeoffAgentMemory", id);
  if (!row) return;
  await ctx.db.delete("takeoffAgentMemory", id);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "takeoffAgentMemory",
    recordId: id,
    entityLabel: row.text.slice(0, 80),
    details: row.status === "proposta" ? "Proposta da IA descartada" : undefined,
  });
}
