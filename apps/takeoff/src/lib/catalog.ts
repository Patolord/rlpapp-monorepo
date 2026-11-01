import { defaultGaugeWeights, type GaugeWeights } from "@rlpapp/shared/engenharia/ducts";
import { invoke } from "@tauri-apps/api/core";
import seed from "../data/catalog.seed.json";
import {
  CATALOG_URL,
  describeHttpFailure,
  httpRequest,
  type QueuedProposal,
} from "./catalogRemote";
import { type Kit, migrateKitLabels, SEED_KITS } from "./kits";
import { isTauri } from "./platform";
import { foldName } from "./text";
import type { Kind } from "./units";
import { cloneBrands, SEED_BRANDS, type VrfBrand } from "./vrf";
import {
  type BasePrices,
  cloneWeights,
  SEED_WEIGHTS,
  sheetCatalogEntries,
  type WeightRow,
  weightCatalogEntries,
} from "./weights";

export { CATALOG_URL } from "./catalogRemote";

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
  /**
   * Company catalog only: the material's id there, its SKU and full description. A company
   * material is a family ("Exaustor") plus a variant ("Sicflux SONORA 18"); the entry is named
   * after the product (the description) so variants can be told apart, searched and budgeted.
   */
  catalogId?: string;
  sku?: string;
  description?: string;
  /** What tells the product apart within its family; undefined when the family has one product. */
  variant?: string;
  /** Company catalog only: when the price was quoted and until when it holds (ms epoch). */
  priceDate?: number;
  priceValidUntil?: number;
  /** Company catalog only: "draft" was proposed from a takeoff and awaits purchasing. */
  status?: "draft" | "active";
  /** Priced by weight (see lib/weights): base material key and kg per unit; the price derives. */
  baseMaterial?: string;
  kgPerUnit?: number;
}

/** What is persisted locally: the user's own entries plus the last remote fetch. */
export interface CatalogStore {
  saved: CatalogEntry[];
  remote: CatalogEntry[];
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
  /** Materials priced by weight (copper tubes…): editable table, seeded with the supplier's. */
  weights: WeightRow[];
  /** Sheet weight (kg/m²) of each duct gauge, editable; seeded with the supplier's (Salviaco). */
  gaugeWeights: GaugeWeights;
  /** Price per kg of the base materials (cobre, chapa…); empty = the bundled defaults. */
  basePrices: BasePrices;
  /** VRF makers' rules (tube sizing by HP, Y-kit models), editable; seeded from the workbook. */
  vrfBrands: VrfBrand[];
}

export const SEED: CatalogEntry[] = (seed as CatalogEntry[]).map((e) => ({ ...e, source: "seed" }));

export const emptyCatalogStore = (): CatalogStore => ({
  saved: [],
  remote: [],
  remoteToken: "",
  fetchedAt: null,
  remoteGeneratedAt: null,
  redirects: {},
  outbox: [],
  kits: SEED_KITS.map((k) => ({ ...k, components: k.components.map((c) => ({ ...c })) })),
  weights: cloneWeights(SEED_WEIGHTS),
  gaugeWeights: defaultGaugeWeights(),
  basePrices: {},
  vrfBrands: cloneBrands(SEED_BRANDS),
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
  const s = foldName(system);
  if (/pressuriza/.test(s)) return "Pressurização de Escadas";
  if (/tomada de ar|\btae\b/.test(s)) return "TAE (Tomada de Ar Externo)";
  if (/detec/.test(s)) return "Detecção de Incêndio";
  if (/infra/.test(s)) return "Infra AC";
  if (/\bac\b|ar condicionado|split|vrf|climatiza/.test(s)) return "AC Áreas Comuns";
  if (/exaust|coifa|chapeu|duto/.test(s)) return "Exaustão";
  return system.trim();
}

/**
 * Saved entries first, then the remote catalog, then the weight table and the sheet-metal rows
 * (priced from the catalog's prices per kg), then the seed; later sources never duplicate
 * earlier names.
 */
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
  add(weightCatalogEntries(store.weights ?? [], store.basePrices), "seed");
  add(sheetCatalogEntries(store.basePrices), "seed");
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
    // the user's own entries first, then the ones whose price follows the R$/kg of the takeoff
    if (ok) {
      const boost = e.source === "saved" ? -10 : e.kgPerUnit ? -6 : 0;
      scored.push({ e, score: score + e.name.length / 100 + boost });
    }
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
 * A variant label is short ("Sicflux SONORA 18", "Verin VRC-MSA - Convencional - 12/24VCC");
 * a spec is prose ("cadastro histórico genérico: fabricante, modelo…"), far longer than this.
 */
const MAX_VARIANT_LENGTH = 80;

/**
 * The company app describes a material as "family — variant — spec" ("Exaustor — Sicflux SONORA
 * 18 — motor 220V"). The entry is named "family — variant", so the products of a family can be
 * told apart, searched and budgeted; the spec stays in the description. The variant comes from
 * the payload when it carries one, else from the description, where a segment of prose length is
 * a spec, not a variant.
 */
export function productName(
  family: string,
  description: string | undefined,
  variant?: string,
): Pick<CatalogEntry, "name" | "variant"> {
  const name = family.trim();
  let label = variant?.trim();
  if (!label) {
    const sep = `${name} — `;
    const full = description?.trim() ?? "";
    const segment = full.startsWith(sep) ? full.slice(sep.length).split(" — ")[0].trim() : "";
    if (segment && segment.length <= MAX_VARIANT_LENGTH) label = segment;
  }
  return label ? { name: `${name} — ${label}`, variant: label } : { name };
}

/** A company entry saved by a version that named it after the family only. */
export const upgradeRemoteEntry = (e: CatalogEntry): CatalogEntry =>
  e.variant ? e : { ...e, ...productName(e.name, e.description) };

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
    const description = str(o.description);
    entries.push({
      ...productName(name, description, str(pick(o, ["variant", "variantLabel", "variante"]))),
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
      description,
      priceDate: ms(o.priceDate),
      priceValidUntil: ms(o.priceValidUntil),
      status: o.status === "draft" ? "draft" : catalogId ? "active" : undefined,
    });
  }
  const generatedAt = Array.isArray(root) ? undefined : ms(root.generatedAt);
  return { entries, redirects, generatedAt: generatedAt ?? null };
}

const LS_KEY = "takeoff.catalog";

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
    const parsed = JSON.parse(text) as
      | (Partial<CatalogStore> & { remoteUrl?: string })
      | CatalogEntry[];
    if (Array.isArray(parsed)) return { ...emptyCatalogStore(), saved: parsed };
    // remoteUrl: a setting of earlier versions; the address is fixed now
    const { remoteUrl: _legacy, ...rest } = parsed;
    const store = { ...emptyCatalogStore(), ...rest };
    // a catalog fetched by an earlier version named entries after the family only
    store.remote = store.remote.map(upgradeRemoteEntry);
    // kits saved before kits had a drawing label take their seed's
    store.kits = migrateKitLabels(store.kits);
    return store;
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

/** After this long without a fetch the Ctrl+K footer asks for an update. */
export const CATALOG_STALE_DAYS = 7;

/** Never fetched, or fetched more than CATALOG_STALE_DAYS ago. */
export const isCatalogStale = (fetchedAt: string | null, now = Date.now()): boolean =>
  !fetchedAt || now - new Date(fetchedAt).getTime() > CATALOG_STALE_DAYS * 86_400_000;

/** Fetch the company catalog (through Rust inside Tauri, so CORS does not apply). */
export async function fetchRemoteCatalog(token: string): Promise<RemoteCatalog> {
  const res = await httpRequest({ method: "GET", url: CATALOG_URL, token });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(describeHttpFailure(res.status, res.body));
  }
  return parseRemoteCatalogResponse(JSON.parse(res.body));
}

/**
 * The words every name in a result list starts with ("Damper de Regulagem Manual Reforçado
 * (Descarga do Ventilador) dim."): shown dimmed so the part that differs stands out.
 * Empty when there is nothing meaningful in common.
 */
export function commonWordPrefix(names: readonly string[], minLength = 12): string {
  if (names.length < 2) return "";
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length < minLength) return "";
  }
  // never cut a word in half: back up to the last space, keeping it
  const cut = prefix.lastIndexOf(" ");
  if (cut < 0) return "";
  const result = prefix.slice(0, cut + 1);
  return result.trim().length >= minLength && names.every((n) => n.length > result.length)
    ? result
    : "";
}
