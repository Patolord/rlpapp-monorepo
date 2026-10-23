import { invoke } from "@tauri-apps/api/core";
import seed from "../data/catalog.seed.json";
import { catalogUrl, describeHttpFailure, httpRequest, type QueuedProposal } from "./catalogRemote";
import { type Kit, SEED_KITS } from "./kits";
import type { Kind } from "./units";

export { catalogUrl, DEFAULT_CATALOG_URL } from "./catalogRemote";

/** A reusable material: what an item is created from. */
export interface CatalogEntry {
  name: string;
  group: string;
  /** pç, cj, vb, m, m² */
  unit: string;
  materialPrice: number;
  laborPrice: number;
  /** Budget system the entry came from (informative). */
  system?: string;
  /** Where the entry comes from: saved by the user, fetched from the company app, or bundled. */
  source?: "saved" | "remote" | "seed";
  /** Company catalog only: the material's id there, its SKU and full description. */
  catalogId?: string;
  sku?: string;
  description?: string;
  /** Company catalog only: when the price was quoted and until when it holds (ms epoch). */
  priceDate?: number;
  priceValidUntil?: number;
  /** Company catalog only: "draft" was proposed from a takeoff and awaits purchasing. */
  status?: "draft" | "active";
}

/** What is persisted locally: the user's own entries plus the last remote fetch. */
export interface CatalogStore {
  saved: CatalogEntry[];
  remote: CatalogEntry[];
  /** Company catalog URL; empty = the production default (see DEFAULT_CATALOG_URL). */
  remoteUrl: string;
  /** Bearer token for the company catalog (kept in app data, never in a project file). */
  remoteToken: string;
  fetchedAt: string | null;
  /** `generatedAt` of the last company catalog received (ms epoch). */
  remoteGeneratedAt: number | null;
  /** Materials purchasing merged into another: old catalog id → surviving id. */
  redirects: Record<string, string>;
  /** Material proposals not yet accepted by the server (retried on every refresh). */
  outbox: QueuedProposal[];
  /** Kit presets (one drawn run creates several items). */
  kits: Kit[];
}

export const SEED: CatalogEntry[] = (seed as CatalogEntry[]).map((e) => ({ ...e, source: "seed" }));

export const emptyCatalogStore = (): CatalogStore => ({
  saved: [],
  remote: [],
  remoteUrl: "",
  remoteToken: "",
  fetchedAt: null,
  remoteGeneratedAt: null,
  redirects: {},
  outbox: [],
  kits: SEED_KITS.map((k) => ({ ...k, components: k.components.map((c) => ({ ...c })) })),
});

export function kindForUnit(unit: string): Kind {
  const u = unit.toLowerCase();
  if (u === "m" || u === "mt" || u === "ml") return "linear";
  if (u === "m²" || u === "m2") return "area";
  return "count";
}

export function unitForKind(kind: Kind, unit = "pç"): string {
  if (kind === "linear") return "m";
  if (kind === "area") return "m²";
  return unit === "cj" || unit === "vb" ? unit : "pç";
}

/** Map the worksheet names found in past budgets onto the canonical discipline names. */
export function normalizeDiscipline(system: string | undefined): string | undefined {
  if (!system) return undefined;
  const s = system
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/pressuriza/.test(s)) return "Pressurização de Escadas";
  if (/tomada de ar|\btae\b/.test(s)) return "TAE (Tomada de Ar Externo)";
  if (/detec/.test(s)) return "Detecção de Incêndio";
  if (/infra/.test(s)) return "Infra AC";
  if (/\bac\b|ar condicionado|split|vrf|climatiza/.test(s)) return "AC Áreas Comuns";
  if (/exaust|coifa|chapeu|duto/.test(s)) return "Exaustão";
  return system.trim();
}

export const foldName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Saved entries first, then the remote catalog, then the seed; later sources never duplicate earlier names. */
export function mergeCatalog(store: CatalogStore): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (list: CatalogEntry[], source: CatalogEntry["source"]) => {
    for (const e of list) {
      const k = foldName(e.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...e, source });
    }
  };
  add(store.saved, "saved");
  add(store.remote, "remote");
  // once the company catalog is in use, the bundled seed is only a fallback
  if (store.remote.length === 0) add(SEED, "seed");
  return out;
}

/** Every query token must appear in the name or group; earlier/shorter matches rank first. */
export function searchCatalog(entries: readonly CatalogEntry[], query: string, limit = 40) {
  const tokens = foldName(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return entries.slice(0, limit);
  const scored: { e: CatalogEntry; score: number }[] = [];
  for (const e of entries) {
    const hay = `${foldName(e.name)} ${foldName(e.group)}`;
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const i = hay.indexOf(t);
      if (i < 0) {
        ok = false;
        break;
      }
      score += i + (hay.startsWith(t) ? -5 : 0);
    }
    if (ok)
      scored.push({ e, score: score + e.name.length / 100 + (e.source === "saved" ? -10 : 0) });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.e);
}

/** The company catalog response, split into usable entries and merge redirects. */
export interface RemoteCatalog {
  entries: CatalogEntry[];
  /** Archived materials that were merged: old id → surviving id. */
  redirects: Record<string, string>;
  /** Server time the catalog was generated at (ms epoch), when the response says. */
  generatedAt: number | null;
}

/**
 * Accepts the JSON the company app publishes (`GET /takeoff/catalog`: `{ generatedAt, items }`).
 * Still tolerates a bare array, other list keys and Portuguese field names, so a hand-made
 * JSON file works too. Archived materials are not entries: they only carry the redirect.
 */
export function parseRemoteCatalogResponse(json: unknown): RemoteCatalog {
  const root = json as Record<string, unknown> | unknown[];
  const list = Array.isArray(root)
    ? root
    : ((root?.items ?? root?.materials ?? root?.materiais ?? root?.data) as unknown[] | undefined);
  if (!Array.isArray(list)) throw new Error("JSON sem lista de materiais");
  const pick = (o: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
    return undefined;
  };
  const num = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
    return 0;
  };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const entries: CatalogEntry[] = [];
  const redirects: Record<string, string> = {};
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = pick(o, ["name", "nome", "descricao", "descrição", "description"]);
    if (typeof name !== "string" || !name.trim()) continue;
    const catalogId = str(pick(o, ["id", "_id", "materialId"]));
    if (o.status === "archived") {
      const target = str(o.mergedInto);
      if (catalogId && target) redirects[catalogId] = target;
      continue;
    }
    entries.push({
      name: name.trim(),
      group: String(pick(o, ["group", "grupo", "categoria", "category"]) ?? "Diversos"),
      unit: String(pick(o, ["unit", "unidade", "un"]) ?? "pç"),
      materialPrice: num(
        pick(o, ["materialPrice", "material", "preco_material", "precoMaterial", "price", "preco"]),
      ),
      laborPrice: num(
        pick(o, ["laborPrice", "labor", "mao_de_obra", "maoDeObra", "preco_mao_obra"]),
      ),
      system: str(pick(o, ["system", "sistema"])),
      source: "remote",
      catalogId,
      sku: str(o.sku),
      description: str(o.description),
      priceDate: ms(o.priceDate),
      priceValidUntil: ms(o.priceValidUntil),
      status: o.status === "draft" ? "draft" : catalogId ? "active" : undefined,
    });
  }
  const generatedAt = Array.isArray(root) ? undefined : ms(root.generatedAt);
  return { entries, redirects, generatedAt: generatedAt ?? null };
}

/** Entries only (see parseRemoteCatalogResponse). */
export const parseRemoteCatalog = (json: unknown): CatalogEntry[] =>
  parseRemoteCatalogResponse(json).entries;

const LS_KEY = "takeoff.catalog";
const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function loadCatalogStore(): Promise<CatalogStore> {
  try {
    let text: string | null = null;
    if (isTauri()) {
      const path = await invoke<string>("catalog_path");
      if (await invoke<boolean>("file_exists", { path }))
        text = await invoke<string>("read_text", { path });
    } else {
      text = localStorage.getItem(LS_KEY);
    }
    if (!text) return emptyCatalogStore();
    const parsed = JSON.parse(text) as Partial<CatalogStore> | CatalogEntry[];
    if (Array.isArray(parsed)) return { ...emptyCatalogStore(), saved: parsed };
    return { ...emptyCatalogStore(), ...parsed };
  } catch {
    return emptyCatalogStore();
  }
}

export async function saveCatalogStore(store: CatalogStore): Promise<void> {
  const contents = JSON.stringify(store, null, 2);
  if (isTauri()) {
    const path = await invoke<string>("catalog_path");
    await invoke("write_text", { path, contents });
  } else {
    localStorage.setItem(LS_KEY, contents);
  }
}

/** Fetch the company catalog (through Rust inside Tauri, so CORS does not apply). */
export async function fetchRemoteCatalog(remoteUrl: string, token: string): Promise<RemoteCatalog> {
  const res = await httpRequest({ method: "GET", url: catalogUrl(remoteUrl), token });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(describeHttpFailure(res.status, res.body));
  }
  return parseRemoteCatalogResponse(JSON.parse(res.body));
}
