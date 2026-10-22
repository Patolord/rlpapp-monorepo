import { invoke } from "@tauri-apps/api/core";
import seed from "../data/catalog.seed.json";
import type { Kind } from "./units";

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
}

/** What is persisted locally: the user's own entries plus the last remote fetch. */
export interface CatalogStore {
  saved: CatalogEntry[];
  remote: CatalogEntry[];
  remoteUrl: string;
  fetchedAt: string | null;
}

export const SEED: CatalogEntry[] = (seed as CatalogEntry[]).map((e) => ({ ...e, source: "seed" }));

export const emptyCatalogStore = (): CatalogStore => ({
  saved: [],
  remote: [],
  remoteUrl: "",
  fetchedAt: null,
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

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Saved entries first, then the remote catalog, then the seed; later sources never duplicate earlier names. */
export function mergeCatalog(store: CatalogStore): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (list: CatalogEntry[], source: CatalogEntry["source"]) => {
    for (const e of list) {
      const k = fold(e.name);
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
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return entries.slice(0, limit);
  const scored: { e: CatalogEntry; score: number }[] = [];
  for (const e of entries) {
    const hay = `${fold(e.name)} ${fold(e.group)}`;
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

/**
 * Accepts the JSON the company app will publish. Tolerates an array or an object with
 * `items`/`materials`/`data`, and Portuguese or English field names.
 */
export function parseRemoteCatalog(json: unknown): CatalogEntry[] {
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
  const out: CatalogEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = pick(o, ["name", "nome", "descricao", "descrição", "description"]);
    if (typeof name !== "string" || !name.trim()) continue;
    out.push({
      name: name.trim(),
      group: String(pick(o, ["group", "grupo", "categoria", "category"]) ?? "Diversos"),
      unit: String(pick(o, ["unit", "unidade", "un"]) ?? "pç"),
      materialPrice: num(
        pick(o, ["materialPrice", "material", "preco_material", "precoMaterial", "price", "preco"]),
      ),
      laborPrice: num(
        pick(o, ["laborPrice", "labor", "mao_de_obra", "maoDeObra", "preco_mao_obra"]),
      ),
      system: (pick(o, ["system", "sistema"]) as string | undefined) ?? undefined,
      source: "remote",
    });
  }
  return out;
}

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
export async function fetchRemoteCatalog(url: string): Promise<CatalogEntry[]> {
  const text = isTauri()
    ? await invoke<string>("fetch_text", { url })
    : await (await fetch(url)).text();
  return parseRemoteCatalog(JSON.parse(text));
}
