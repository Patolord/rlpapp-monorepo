import type { api } from "@rlpapp/backend/convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { isTauri } from "./platform";
import { proposalMaterial } from "./proposalMaterial";
import { itemUnit } from "./quantities";
import type { Item, Project } from "./types";

/**
 * The company catalog and material proposals reach the company app (app.rlpeng.com.br, Convex
 * backend) only as the signed-in user: typed Convex functions called with the account's JWT
 * (lib/account/convex.ts). Both work offline: the last catalog received is cached on disk and a
 * proposal waits in the local outbox until the next refresh while signed in.
 */

export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * HTTP through Rust inside Tauri (no CORS); plain fetch in the browser dev build. Used by the
 * sign-in routes (code exchange, JWT renewal, revocation: lib/account/session.ts).
 */
export async function httpRequest(req: {
  method: "GET" | "POST";
  url: string;
  token?: string;
  body?: string;
}): Promise<HttpResponse> {
  const headers: Record<string, string> = {};
  if (req.token) headers.Authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (isTauri()) {
    return await invoke<HttpResponse>("http_request", {
      method: req.method,
      url: req.url,
      headers,
      body: req.body ?? null,
    });
  }
  const res = await fetch(req.url, { method: req.method, headers, body: req.body });
  return { status: res.status, body: await res.text() };
}

// ---------------------------------------------------------------------------
// Material proposals (an item the user chooses to send to purchasing)
// ---------------------------------------------------------------------------

/** Arguments of `takeoffMaterials.proposeAsUser` (the backend's own type). */
export type SignedInProposal = FunctionArgs<typeof api.takeoffMaterials.proposeAsUser>;

/**
 * A queued proposal: the signed-in mutation's arguments (the server records the user as the
 * requester). Bodies queued by earlier versions may carry more fields, such as a free-text
 * `requestedBy`; `signedInProposalArgs` drops them before sending.
 */
export type ProposalBody = SignedInProposal;

/** What the server answers to a proposal (the backend's own type). */
export type ProposalResult = FunctionReturnType<typeof api.takeoffMaterials.proposeAsUser>;

/** A proposal waiting to be sent; it survives restarts and is retried on every catalog refresh. */
export interface QueuedProposal {
  clientId: string;
  itemId: string;
  itemName: string;
  body: ProposalBody;
  createdAt: number;
  lastError?: string;
}

export const newClientId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * What the company gets from a budget line. A line already linked to a catalog material only
 * proposes its price; an unlinked one proposes the material itself (it becomes a draft there),
 * split into family, variant and dimensions when its name carries them.
 * Prices of 0 are not sent: they are placeholders, not estimates.
 */
export function buildProposal(item: Item, project: Project, clientId: string): ProposalBody {
  const body: ProposalBody = {
    clientId,
    takeoffName: project.name || undefined,
  };
  if (item.catalogId) body.materialId = item.catalogId;
  else {
    const unit = itemUnit(item, project.unit);
    // family + size, so purchasing matches it to the existing material (lib/proposalMaterial)
    const material = proposalMaterial(item, unit);
    body.name = material.name;
    if (material.variantLabel) body.variantLabel = material.variantLabel;
    if (material.dimensions) body.dimensions = material.dimensions;
    if (material.spec) body.spec = material.spec;
    body.unit = unit;
    body.category = item.group || undefined;
  }
  if (item.materialPrice > 0) {
    body.unitPrice = item.materialPrice;
    body.priceDate = item.priceDate ?? Date.now();
  }
  return body;
}

export type SendOutcome =
  | { kind: "sent"; result: ProposalResult }
  | { kind: "rejected"; message: string }
  | { kind: "retry"; message: string };

/**
 * Follow catalog redirects (materials purchasing merged into another) on the budget lines,
 * keeping their frozen prices. Returns the same array when nothing changes.
 */
export function applyRedirects(items: Item[], redirects: Record<string, string>): Item[] {
  let changed = false;
  const out = items.map((item) => {
    let id = item.catalogId;
    for (let hops = 0; id && redirects[id] && hops < 10; hops++) id = redirects[id];
    if (id === item.catalogId) return item;
    changed = true;
    return { ...item, catalogId: id };
  });
  return changed ? out : items;
}
