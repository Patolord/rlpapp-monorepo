import type { api } from "@rlpapp/backend/convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { isTauri } from "./platform";
import { proposalMaterial } from "./proposalMaterial";
import { itemUnit } from "./quantities";
import type { Item, Project } from "./types";

/**
 * The company app (app.rlpeng.com.br, Convex backend) publishes the material catalog for this
 * app at `GET /takeoff/catalog` and receives material proposals at `POST /takeoff/materials`,
 * both behind the same bearer token (`TAKEOFF_CATALOG_TOKEN` on the deployment). The address
 * is fixed: users only hold the token. A build with `VITE_CATALOG_URL` set points at another
 * deployment (the dev mirror, https://dusty-ferret-162.convex.site/takeoff/catalog).
 *
 * This shared-token path is the fallback: signed in with the company account (lib/account), the
 * app calls the typed Convex functions as the user instead (lib/account/convex.ts).
 */
export const CATALOG_URL: string =
  (import.meta.env.VITE_CATALOG_URL as string | undefined)?.trim() ||
  "https://rosy-crow-250.convex.site/takeoff/catalog";

const CATALOG_PATH = "/takeoff/catalog";
const PROPOSALS_PATH = "/takeoff/materials";

/** The proposals route lives next to the catalog route on the same deployment. */
export const proposalsUrl = (catalogUrl: string): string =>
  catalogUrl.endsWith(CATALOG_PATH)
    ? catalogUrl.slice(0, -CATALOG_PATH.length) + PROPOSALS_PATH
    : new URL(PROPOSALS_PATH, catalogUrl).toString();

export const PROPOSALS_URL: string = proposalsUrl(CATALOG_URL);

export interface HttpResponse {
  status: number;
  body: string;
}

/** HTTP through Rust inside Tauri (no CORS); plain fetch in the browser dev build. */
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

/** Human message for a failed catalog call; the token hint matters most in practice. */
export function describeHttpFailure(status: number, body: string): string {
  if (status === 401)
    return "Token recusado: confira o token do catálogo (rodapé do Ctrl+K) ou entre com a conta da empresa";
  if (status === 503) return "Catálogo desligado no servidor (token não configurado lá)";
  if (status === 404) return "Rota não encontrada: confira a URL do catálogo";
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") detail = `: ${parsed.error}`;
  } catch {}
  return `HTTP ${status}${detail}`;
}

// ---------------------------------------------------------------------------
// Material proposals (an item the user chooses to send to purchasing)
// ---------------------------------------------------------------------------

/** Arguments of `takeoffMaterials.proposeAsUser` (the backend's own type). */
export type SignedInProposal = FunctionArgs<typeof api.takeoffMaterials.proposeAsUser>;

/**
 * A queued proposal: the signed-in mutation's arguments, plus the free-text requester the
 * shared-token route (`POST /takeoff/materials`) needs. Signed in, the server records the user.
 */
export type ProposalBody = SignedInProposal & { requestedBy?: string };

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
    requestedBy: project.estimator || undefined,
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

/** 4xx other than auth is a bad request that retrying will not fix; everything else is retried. */
export async function sendProposal(token: string, body: ProposalBody): Promise<SendOutcome> {
  let res: HttpResponse;
  try {
    res = await httpRequest({
      method: "POST",
      url: PROPOSALS_URL,
      token,
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { kind: "retry", message: e instanceof Error ? e.message : String(e) };
  }
  if (res.status >= 200 && res.status < 300) {
    return { kind: "sent", result: JSON.parse(res.body) as ProposalResult };
  }
  const message = describeHttpFailure(res.status, res.body);
  if (res.status === 400 || res.status === 404) return { kind: "rejected", message };
  return { kind: "retry", message };
}

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
