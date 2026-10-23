import { invoke } from "@tauri-apps/api/core";
import type { Item, Project } from "./types";

/** The unit a line is budgeted in (mirrors unitForKind without importing the catalog module). */
const lineUnit = (item: Item): string =>
  item.unit ?? (item.kind === "linear" ? "m" : item.kind === "area" ? "m²" : "pç");

/**
 * The company app (app.rlpeng.com.br, Convex backend) publishes the material catalog for this
 * app at `GET /takeoff/catalog` and receives material proposals at `POST /takeoff/materials`,
 * both behind the same bearer token (`TAKEOFF_CATALOG_TOKEN` on the deployment).
 */
export const DEFAULT_CATALOG_URL = "https://rosy-crow-250.convex.site/takeoff/catalog";

const CATALOG_PATH = "/takeoff/catalog";
const PROPOSALS_PATH = "/takeoff/materials";

/** The URL to fetch: the configured one, else the company's production catalog. */
export const catalogUrl = (remoteUrl: string): string => remoteUrl.trim() || DEFAULT_CATALOG_URL;

/** The proposals route lives next to the catalog route on the same deployment. */
export function proposalsUrl(remoteUrl: string): string {
  const url = catalogUrl(remoteUrl);
  if (url.endsWith(CATALOG_PATH)) return url.slice(0, -CATALOG_PATH.length) + PROPOSALS_PATH;
  return new URL(PROPOSALS_PATH, url).toString();
}

export interface HttpResponse {
  status: number;
  body: string;
}

const isTauri = () => "__TAURI_INTERNALS__" in window;

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
  if (status === 401) return "Token recusado: confira o token do catálogo (rodapé do Ctrl+K)";
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

/** Body of `POST /takeoff/materials`. */
export interface ProposalBody {
  clientId: string;
  materialId?: string;
  name?: string;
  unit?: string;
  category?: string;
  unitPrice?: number;
  priceDate?: number;
  requestedBy?: string;
  takeoffName?: string;
}

export interface ProposalResult {
  outcome: "created" | "matched" | "replayed";
  materialId: string;
  sku: string | null;
  materialStatus: "draft" | "active" | "archived";
  mergedInto: string | null;
  priceEventId: string | null;
}

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
 * proposes its price; an unlinked one proposes the material itself (it becomes a draft there).
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
    body.name = item.name;
    body.unit = lineUnit(item);
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
export async function sendProposal(
  remoteUrl: string,
  token: string,
  body: ProposalBody,
): Promise<SendOutcome> {
  let res: HttpResponse;
  try {
    res = await httpRequest({
      method: "POST",
      url: proposalsUrl(remoteUrl),
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
