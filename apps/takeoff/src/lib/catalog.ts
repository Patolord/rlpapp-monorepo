import {
  DEFAULT_DUCT_NORMAS,
  type DuctNormaDefaults,
  defaultGaugeWeights,
  GAUGES,
  type GaugeLimits,
  type GaugeWeights,
} from "@rlpapp/shared/engenharia/ducts";
import { normalizeKitSku } from "@rlpapp/shared/takeoff/kits";
import { isLaborPriceKey, type LaborPrices, laborPricesOf } from "@rlpapp/shared/takeoff/labor";
import {
  isDiameter,
  SEED_BRANDS,
  sameBrand,
  type VrfBrand,
  type YkitRow,
} from "@rlpapp/shared/takeoff/vrfBrands";
import {
  type BasePrices,
  isBaseMaterialKey,
  SEED_WEIGHTS,
  sameWeightRow,
  type WeightRow,
  weightKey,
} from "@rlpapp/shared/takeoff/weights";
import { invoke } from "@tauri-apps/api/core";
import type { QueuedProposal } from "./catalogRemote";
import {
  effectiveKits,
  type Kit,
  type KitOverrides,
  kitDefaults,
  migrateKitLabels,
  overridesFromLegacyKits,
  sameKit,
} from "./kits";
import {
  applyOverrides,
  applyRecordOverrides,
  defaultsOf,
  diffOverrides,
  diffRecordOverrides,
  type OverrideRules,
  sameList,
  sameRecord,
} from "./overrides";
import { isTauri } from "./platform";
import { foldName } from "./text";
import { DEFAULT_GROUP } from "./types";
import type { Kind } from "./units";
import { sheetCatalogEntries, weightCatalogEntries } from "./weights";

/** A reusable material: what an item is created from. */
export interface CatalogEntry {
  name: string;
  group: string;
  /** pç, cj, vb, m, m² */
  unit: string;
  materialPrice: number;
  laborPrice: number;
  /**
   * Set when the labour price did not come with the entry: "default" = an air terminal took the
   * usual installation price (see withAirTerminalLabor). ("seed", the labour of the sheets once
   * bundled with the app, is no longer produced; old lines may still carry it.)
   */
  laborSource?: LaborSource;
  /** Budget system the entry came from (informative). */
  system?: string;
  /**
   * Where the entry comes from: saved by the user, fetched from the company app, or derived
   * from the app's tables ("seed": the weight table and the sheet-metal rows priced per kg).
   */
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

export type LaborSource = "seed" | "default";

/** What is persisted locally: the user's own entries plus the last remote fetch. */
export interface CatalogStore {
  saved: CatalogEntry[];
  remote: CatalogEntry[];
  fetchedAt: string | null;
  /** `generatedAt` of the last company catalog received (ms epoch). */
  remoteGeneratedAt: number | null;
  /** Materials purchasing merged into another: old catalog id → surviving id. */
  redirects: Record<string, string>;
  /** Material proposals not yet accepted by the server (retried on every refresh). */
  outbox: QueuedProposal[];
  /**
   * Kit presets in use (one drawn run creates several items): the company defaults with the
   * local overrides applied (see lib/kits.ts). Derived from the three fields below and kept
   * here for the components; recomputed on load and whenever either side changes.
   */
  kits: Kit[];
  /** Kit defaults published by the company app with the catalog; null until received. */
  remoteKits: Kit[] | null;
  /** The user's own kit versions (an edited default or a kit that exists only here). */
  kitOverrides: Kit[];
  /** Ids of company defaults the user removed here. */
  kitRemoved: string[];
  /**
   * Materials priced by weight (copper tubes…) in use: the company's table (the supplier's
   * until the company publishes one) with the local overrides applied. Derived, like `kits`.
   */
  weights: WeightRow[];
  remoteWeights: WeightRow[] | null;
  /** The user's own rows (an edited default or a row that exists only here), by folded name. */
  weightOverrides: WeightRow[];
  /** Folded names of company rows the user removed here. */
  weightRemoved: string[];
  /**
   * Sheet weight (kg/m²) of each duct gauge in use: the supplier's (Salviaco), the company's
   * over it, the user's over both. Derived from the two fields below.
   */
  gaugeWeights: GaugeWeights;
  remoteGaugeWeights: GaugeWeights | null;
  /** Only the gauges the user set on this machine. */
  gaugeWeightOverrides: GaugeWeights;
  /**
   * Price per kg of the base materials (cobre, chapa…) in use: the company's prices with the
   * user's over them; a key absent here falls back to the bundled default (see basePrice).
   * Derived from the two fields below.
   */
  basePrices: BasePrices;
  remoteBasePrices: BasePrices | null;
  /** Only the prices the user set on this machine. */
  basePriceOverrides: BasePrices;
  /**
   * VRF makers' rules (tube sizing by HP, Y-kit models) in use: the company's brands (the
   * workbook's until the company publishes any) with the local overrides applied. Derived.
   */
  vrfBrands: VrfBrand[];
  remoteVrfBrands: VrfBrand[] | null;
  /** The user's own brands (an edited default or a brand that exists only here), by id. */
  vrfBrandOverrides: VrfBrand[];
  /** Ids of company brands the user removed here. */
  vrfBrandRemoved: string[];
  /**
   * Labour prices in use (ducts per kg, VRF per evaporator): the company's over the workbook's.
   * A takeoff may set its own value; these apply where it does not. Derived from the field below.
   */
  labor: Required<LaborPrices>;
  remoteLabor: LaborPrices | null;
  /**
   * Duct parameters per norma in use (gauge limits, thicknesses, allowances): the company's
   * table, else the workbook's. A takeoff copies its norma's row and may adjust it. Derived.
   */
  ductNormas: DuctNormaDefaults[];
  remoteDuctNormas: DuctNormaDefaults[] | null;
}

/** The company's norma table in use: the published one, else the workbook's. */
export const ductNormaDefaults = (
  remote: readonly DuctNormaDefaults[] | null | undefined,
): readonly DuctNormaDefaults[] => defaultsOf(remote, DEFAULT_DUCT_NORMAS);

export const WEIGHT_RULES: OverrideRules<WeightRow> = { key: weightKey, same: sameWeightRow };
export const BRAND_RULES: OverrideRules<VrfBrand> = { key: (b) => b.id, same: sameBrand };

/** The company's weight table in use: the published one, else the supplier's. */
export const weightDefaults = (remote: readonly WeightRow[] | null | undefined) =>
  defaultsOf(remote, SEED_WEIGHTS);
/** The company's VRF brands in use: the published ones, else the workbook's. */
export const brandDefaults = (remote: readonly VrfBrand[] | null | undefined) =>
  defaultsOf(remote, SEED_BRANDS);
/** kg/m² per gauge before the user's overrides: the supplier's, the company's over them. */
export const gaugeWeightDefaults = (remote: GaugeWeights | null | undefined): GaugeWeights => ({
  ...defaultGaugeWeights(),
  ...(remote ?? {}),
});
/** Prices per kg before the user's overrides: the company's (the bundled ones live in basePrice). */
export const basePriceDefaults = (remote: BasePrices | null | undefined): BasePrices => ({
  ...(remote ?? {}),
});

/** Spellings of the same budget unit, folded (see unitKey). */
const UNIT_SYNONYMS: Record<string, string> = {
  un: "pc",
  und: "pc",
  unid: "pc",
  unidade: "pc",
  unidades: "pc",
  peca: "pc",
  pecas: "pc",
  metro: "m",
  metros: "m",
  mt: "m",
  ml: "m",
  conjunto: "cj",
  conjuntos: "cj",
  quilograma: "kg",
  quilogramas: "kg",
  litro: "l",
  litros: "l",
};

/**
 * Comparison key of a unit: folded, without spaces or dots, ² read as 2, synonyms joined
 * ("un"/"pç"/"peça" → "pc", "metro" → "m", "m²"/"m2", "conjunto" → "cj").
 */
export function unitKey(unit: string): string {
  const k = foldName(unit)
    .replace(/²/g, "2")
    .replace(/[^a-z0-9]/g, "");
  return UNIT_SYNONYMS[k] ?? k;
}

/** Installation price RLP charges per air terminal (grille, diffuser, louvre) when nothing else is known. */
export const AIR_TERMINAL_LABOR = 45;

const AIR_TERMINAL_GROUP = /boca|grelha|difusor|venezian/;
const AIR_TERMINAL_NAME = /grelha|difusor|venezian|boca de ar/;

/** Grilles, diffusers and louvres: the "Bocas de Ar" group, or named as one. */
export const isAirTerminal = (e: Pick<CatalogEntry, "name" | "group">): boolean =>
  AIR_TERMINAL_GROUP.test(foldName(e.group)) || AIR_TERMINAL_NAME.test(foldName(e.name));

/**
 * An air terminal sold by the piece with no labour price gets the usual installation price
 * (R$ 45 a piece), marked `laborSource: "default"`, so the budget already carries it. Anything
 * priced, not an air terminal, or priced per metre (a linear diffuser by length) is returned
 * as is.
 */
export function withAirTerminalLabor(e: CatalogEntry): CatalogEntry {
  if (e.laborPrice > 0 || unitKey(e.unit) !== "pc" || !isAirTerminal(e)) return e;
  return { ...e, laborPrice: AIR_TERMINAL_LABOR, laborSource: "default" };
}

export const emptyCatalogStore = (): CatalogStore => ({
  saved: [],
  remote: [],
  fetchedAt: null,
  remoteGeneratedAt: null,
  redirects: {},
  outbox: [],
  kits: effectiveKits(kitDefaults(null), { kitOverrides: [], kitRemoved: [] }),
  remoteKits: null,
  kitOverrides: [],
  kitRemoved: [],
  weights: [...weightDefaults(null)],
  remoteWeights: null,
  weightOverrides: [],
  weightRemoved: [],
  gaugeWeights: gaugeWeightDefaults(null),
  remoteGaugeWeights: null,
  gaugeWeightOverrides: {},
  basePrices: {},
  remoteBasePrices: null,
  basePriceOverrides: {},
  vrfBrands: [...brandDefaults(null)],
  remoteVrfBrands: null,
  vrfBrandOverrides: [],
  vrfBrandRemoved: [],
  labor: laborPricesOf(null),
  remoteLabor: null,
  ductNormas: [...ductNormaDefaults(null)],
  remoteDuctNormas: null,
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
 * Saved entries first, then the company catalog, then the weight table and the sheet-metal rows
 * (priced from the catalog's prices per kg); later sources never duplicate earlier names. There
 * is no bundled catalog any more: without the company's, the user has their own entries and
 * the weight table. Air terminals from the company catalog still without labour get the usual
 * price (withAirTerminalLabor); the user's own entries are left as saved.
 */
export function mergeCatalog(store: CatalogStore): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (list: CatalogEntry[], source: CatalogEntry["source"]) => {
    for (const e of list) {
      const k = foldName(e.name);
      if (seen.has(k)) continue;
      seen.add(k);
      const entry = { ...e, source };
      out.push(source === "saved" ? entry : withAirTerminalLabor(entry));
    }
  };
  add(store.saved, "saved");
  add(store.remote, "remote");
  add(weightCatalogEntries(store.weights ?? [], store.basePrices), "seed");
  add(sheetCatalogEntries(store.basePrices), "seed");
  return out;
}

/**
 * The catalog entry a kit component stands for: the company material with its code (whatever
 * its name is now), else the entry of the same name. Undefined when neither exists (a custom
 * item, created without a price).
 */
export function kitComponentEntry(
  entries: readonly CatalogEntry[],
  component: { name: string; sku?: string },
): CatalogEntry | undefined {
  const sku = normalizeKitSku(component.sku);
  if (sku) {
    const bySku = entries.find((e) => e.source === "remote" && normalizeKitSku(e.sku) === sku);
    if (bySku) return bySku;
  }
  const name = foldName(component.name);
  return entries.find((e) => foldName(e.name) === name);
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
  /** The company's kit defaults; null when the response has none (a server before kits). */
  kits: Kit[] | null;
  /** The company's weight table and kg/m² per gauge; null when the response has none. */
  weights: { rows: WeightRow[]; gaugeWeights: GaugeWeights } | null;
  /** The company's prices per kg; null when the response has none. */
  basePrices: BasePrices | null;
  /** The company's VRF brands; null when the response has none. */
  vrfBrands: VrfBrand[] | null;
  /** The company's labour prices; null when the response has none. */
  labor: LaborPrices | null;
  /** The company's duct parameters per norma; null when the response has none. */
  ductNormas: DuctNormaDefaults[] | null;
}

/** The fields a refresh or a save may change before the lists in use are recomputed. */
export type CompanyDefaultsPatch = Partial<
  Pick<
    CatalogStore,
    | "remoteKits"
    | "remoteWeights"
    | "weightOverrides"
    | "weightRemoved"
    | "remoteGaugeWeights"
    | "gaugeWeightOverrides"
    | "remoteBasePrices"
    | "basePriceOverrides"
    | "remoteVrfBrands"
    | "vrfBrandOverrides"
    | "vrfBrandRemoved"
    | "remoteLabor"
    | "remoteDuctNormas"
  > &
    KitOverrides
>;

/**
 * The settings the user works with after the company defaults or the overrides changed: every
 * derived list is recomputed from its defaults and overrides. A list keeps its identity when
 * nothing in it changed (a refresh that brought the same defaults), so what watches it (an open
 * dialog, a memoised bill) is not reset for nothing.
 */
export const withCompanyDefaults = (
  store: CatalogStore,
  patch: CompanyDefaultsPatch = {},
): CatalogStore => {
  const next = { ...store, ...patch };
  const keep = <T>(prev: T[], computed: T[], same: (a: T, b: T) => boolean) =>
    sameList(prev, computed, same) ? prev : computed;
  const keepRecord = (prev: Record<string, number>, computed: Record<string, number>) =>
    sameRecord(prev, computed) ? prev : computed;
  return {
    ...next,
    kits: keep(store.kits, effectiveKits(kitDefaults(next.remoteKits), next), sameKit),
    weights: keep(
      store.weights,
      applyOverrides(
        weightDefaults(next.remoteWeights),
        { overrides: next.weightOverrides, removed: next.weightRemoved },
        WEIGHT_RULES,
      ),
      sameWeightRow,
    ),
    gaugeWeights: keepRecord(
      store.gaugeWeights,
      applyRecordOverrides(gaugeWeightDefaults(next.remoteGaugeWeights), next.gaugeWeightOverrides),
    ),
    basePrices: keepRecord(
      store.basePrices,
      applyRecordOverrides(basePriceDefaults(next.remoteBasePrices), next.basePriceOverrides),
    ),
    vrfBrands: keep(
      store.vrfBrands,
      applyOverrides(
        brandDefaults(next.remoteVrfBrands),
        { overrides: next.vrfBrandOverrides, removed: next.vrfBrandRemoved },
        BRAND_RULES,
      ),
      sameBrand,
    ),
    labor: keepRecord(store.labor, laborPricesOf(next.remoteLabor)) as Required<LaborPrices>,
    ductNormas: keep(
      store.ductNormas,
      [...ductNormaDefaults(next.remoteDuctNormas)],
      (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ),
  };
};

/** The kits the user works with after the defaults or the overrides changed (see withCompanyDefaults). */
export const withEffectiveKits = withCompanyDefaults;

/** What of an edited weight table is the user's own (see diffOverrides). */
export const diffWeights = (
  store: Pick<CatalogStore, "remoteWeights" | "weightOverrides" | "weightRemoved">,
  rows: readonly WeightRow[],
): Pick<CatalogStore, "weightOverrides" | "weightRemoved"> => {
  const d = diffOverrides(weightDefaults(store.remoteWeights), rows, WEIGHT_RULES, {
    overrides: store.weightOverrides,
    removed: store.weightRemoved,
  });
  return { weightOverrides: d.overrides, weightRemoved: d.removed };
};

/** What of an edited brand list is the user's own (see diffOverrides). */
export const diffVrfBrands = (
  store: Pick<CatalogStore, "remoteVrfBrands" | "vrfBrandOverrides" | "vrfBrandRemoved">,
  brands: readonly VrfBrand[],
): Pick<CatalogStore, "vrfBrandOverrides" | "vrfBrandRemoved"> => {
  const d = diffOverrides(brandDefaults(store.remoteVrfBrands), brands, BRAND_RULES, {
    overrides: store.vrfBrandOverrides,
    removed: store.vrfBrandRemoved,
  });
  return { vrfBrandOverrides: d.overrides, vrfBrandRemoved: d.removed };
};

/**
 * The gauges the user set: a value equal to the default (the company's, else the supplier's)
 * is not an override, and an empty or zero value means back to the default.
 */
export const diffGaugeWeights = (
  store: Pick<CatalogStore, "remoteGaugeWeights">,
  values: GaugeWeights,
): GaugeWeights => {
  const defaults = gaugeWeightDefaults(store.remoteGaugeWeights);
  const set: GaugeWeights = {};
  for (const [k, v] of Object.entries(values)) if (v > 0 && k in defaults) set[k] = v;
  return diffRecordOverrides(defaults, set);
};

const KIT_KINDS = new Set(["count", "linear", "area"]);

/**
 * The `kits` list of the company response, in the app's shape; entries that are not kits are
 * skipped. Null when the response carries no list (a server from before kit defaults).
 */
export function parseRemoteKits(json: unknown): Kit[] | null {
  if (!Array.isArray(json)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const kits: Kit[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.id);
    const name = str(o.name);
    if (!id || !name || !Array.isArray(o.components)) continue;
    const components = o.components.flatMap((c) => {
      if (!c || typeof c !== "object") return [];
      const comp = c as Record<string, unknown>;
      const cname = str(comp.name);
      const kind = str(comp.kind);
      if (!cname || !KIT_KINDS.has(kind)) return [];
      const factor = typeof comp.factor === "number" && comp.factor > 0 ? comp.factor : 1;
      const system = str(comp.system);
      const sku = normalizeKitSku(str(comp.sku));
      return [
        {
          name: cname,
          ...(sku ? { sku } : {}),
          group: str(comp.group) || DEFAULT_GROUP,
          ...(system ? { system } : {}),
          kind: kind as Kit["components"][number]["kind"],
          factor,
        },
      ];
    });
    if (components.length === 0) continue;
    const label = typeof o.label === "string" ? o.label.trim() : undefined;
    kits.push({
      id,
      name,
      mode: o.mode === "count" ? "count" : "linear",
      ...(label !== undefined ? { label } : {}),
      components,
    });
  }
  return kits;
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
 * Accepts the snapshot the company app publishes (`takeoffCatalog.current`:
 * `{ generatedAt, items }`).
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
      group: str(pick(o, ["group", "grupo", "categoria", "category"])) ?? DEFAULT_GROUP,
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
  const bare = Array.isArray(root);
  return {
    entries,
    redirects,
    generatedAt: generatedAt ?? null,
    kits: bare ? null : parseRemoteKits(root.kits),
    weights: bare ? null : parseRemoteWeights(root.weights),
    basePrices: bare ? null : parseRemoteBasePrices(root.basePrices),
    vrfBrands: bare ? null : parseRemoteVrfBrands(root.vrfBrands),
    labor: bare ? null : parseRemoteLabor(root.labor),
    ductNormas: bare ? null : parseRemoteDuctNormas(root.ductNormas),
  };
}

/** The `labor` record of the company response (R$ by labour key), or null. */
export function parseRemoteLabor(json: unknown): LaborPrices | null {
  if (!isRecord(json)) return null;
  return parsePositiveRecord(json, isLaborPriceKey);
}

/**
 * The `ductNormas` list of the company response: a row per norma with four ascending gauge
 * limits and non-negative values; anything else is skipped. Null when the response has none.
 */
export function parseRemoteDuctNormas(json: unknown): DuctNormaDefaults[] | null {
  if (!Array.isArray(json)) return null;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const out: DuctNormaDefaults[] = [];
  const seen = new Set<number>();
  for (const raw of json) {
    if (!isRecord(raw)) continue;
    const norma = raw.norma;
    if (norma !== 1 && norma !== 2 && norma !== 3) continue;
    if (seen.has(norma)) continue;
    const limits = raw.gaugeLimits;
    if (
      !Array.isArray(limits) ||
      limits.length !== 4 ||
      !limits.every((v, i) => positive(v) && (i === 0 || v > (limits[i - 1] as number)))
    ) {
      continue;
    }
    const sheet = raw.sheetSlackPct;
    if (
      !num(raw.insulThickness) ||
      !num(raw.flangeSpacing) ||
      !num(raw.rechapThickness) ||
      !num(raw.insulSlackPct) ||
      !num(raw.supportsPct) ||
      !(sheet === null || num(sheet))
    ) {
      continue;
    }
    seen.add(norma);
    out.push({
      norma,
      gaugeLimits: [limits[0], limits[1], limits[2], limits[3]] as GaugeLimits,
      insulThickness: raw.insulThickness,
      flangeSpacing: raw.flangeSpacing,
      rechapThickness: raw.rechapThickness,
      sheetSlackPct: sheet,
      insulSlackPct: raw.insulSlackPct,
      supportsPct: raw.supportsPct,
    });
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A record of positive numbers out of the response, keys filtered by `allowed`. */
function parsePositiveRecord(
  json: unknown,
  allowed: (k: string) => boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(json)) return out;
  for (const [k, v] of Object.entries(json)) if (allowed(k) && positive(v)) out[k] = v;
  return out;
}

/**
 * The `weights` object of the company response: the rows of the weight table and the kg/m² per
 * duct gauge. Rows without a name, a known base material or a positive weight are skipped; a
 * gauge the app does not know is skipped. Null when the response carries no object.
 */
export function parseRemoteWeights(json: unknown): RemoteCatalog["weights"] {
  if (!isRecord(json) || !Array.isArray(json.rows)) return null;
  const rows: WeightRow[] = [];
  for (const raw of json.rows) {
    if (!isRecord(raw)) continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const material = typeof raw.material === "string" ? raw.material : "";
    if (!name || !isBaseMaterialKey(material) || !positive(raw.kgPerUnit)) continue;
    rows.push({
      name,
      group: (typeof raw.group === "string" && raw.group.trim()) || "Tubulações",
      unit: raw.unit === "pç" ? "pç" : "m",
      material,
      kgPerUnit: raw.kgPerUnit,
    });
  }
  const known = new Set<string>(GAUGES.map((g) => g.name));
  return { rows, gaugeWeights: parsePositiveRecord(json.gaugeWeights, (k) => known.has(k)) };
}

/** The `basePrices` record of the company response (R$/kg by base material key), or null. */
export function parseRemoteBasePrices(json: unknown): BasePrices | null {
  if (!isRecord(json)) return null;
  return parsePositiveRecord(json, isBaseMaterialKey);
}

/**
 * The `vrfBrands` list of the company response. A brand needs an id, a name and the three
 * sizing tables with at least one valid row each; rows with unknown diameters are skipped.
 */
export function parseRemoteVrfBrands(json: unknown): VrfBrand[] | null {
  if (!Array.isArray(json)) return null;
  const hp = (r: Record<string, unknown>) =>
    typeof r.hp === "number" && Number.isFinite(r.hp) && r.hp >= 0 ? r.hp : undefined;
  const hpRows = (v: unknown) =>
    Array.isArray(v)
      ? v.flatMap((r) => {
          if (!isRecord(r)) return [];
          const h = hp(r);
          const gas = typeof r.gas === "string" && isDiameter(r.gas) ? r.gas : undefined;
          const liquid =
            typeof r.liquid === "string" && isDiameter(r.liquid) ? r.liquid : undefined;
          return h === undefined || !gas || !liquid ? [] : [{ hp: h, gas, liquid }];
        })
      : [];
  const ykits = (v: unknown): YkitRow[] =>
    Array.isArray(v)
      ? v.flatMap((r) => {
          if (!isRecord(r)) return [];
          const h = hp(r);
          const model = typeof r.model === "string" ? r.model.trim() : "";
          return h === undefined || !model ? [] : [{ hp: h, model }];
        })
      : [];
  const brands: VrfBrand[] = [];
  for (const raw of json) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!id || !name) continue;
    const brand: VrfBrand = {
      id,
      name,
      main: hpRows(raw.main),
      trunk: hpRows(raw.trunk),
      branch: hpRows(raw.branch),
      ykit: ykits(raw.ykit),
    };
    if (!brand.main.length || !brand.trunk.length || !brand.branch.length) continue;
    brands.push(brand);
  }
  return brands;
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
      | (Partial<CatalogStore> & { remoteUrl?: string; remoteToken?: string })
      | CatalogEntry[];
    if (Array.isArray(parsed)) return { ...emptyCatalogStore(), saved: parsed };
    // settings of earlier versions: remoteUrl (the address is fixed now) and remoteToken (the
    // shared catalog token, replaced by the company account); dropped so the next save forgets
    // them
    const { remoteUrl: _legacyUrl, remoteToken: _legacyToken, ...rest } = parsed;
    const store = { ...emptyCatalogStore(), ...rest };
    // a catalog fetched by an earlier version named entries after the family only
    store.remote = store.remote.map(upgradeRemoteEntry);
    // before company defaults, `kits` was the whole list (the presets cloned and edited in
    // place): read it as overrides of the bundled presets. Kits saved before kits had a drawing
    // label take their seed's first.
    if (rest.kitOverrides === undefined && Array.isArray(rest.kits)) {
      Object.assign(store, overridesFromLegacyKits(migrateKitLabels(rest.kits)));
    }
    // likewise the weight table, the gauges, the prices per kg and the VRF brands: the whole
    // lists of before, read as overrides of the bundled seeds
    if (rest.weightOverrides === undefined && Array.isArray(rest.weights)) {
      Object.assign(store, diffWeights({ ...store, remoteWeights: null }, rest.weights));
    }
    if (rest.gaugeWeightOverrides === undefined && isRecord(rest.gaugeWeights)) {
      store.gaugeWeightOverrides = diffGaugeWeights(
        { remoteGaugeWeights: null },
        rest.gaugeWeights,
      );
    }
    if (rest.basePriceOverrides === undefined && isRecord(rest.basePrices)) {
      store.basePriceOverrides = { ...rest.basePrices };
    }
    if (rest.vrfBrandOverrides === undefined && Array.isArray(rest.vrfBrands)) {
      Object.assign(store, diffVrfBrands({ ...store, remoteVrfBrands: null }, rest.vrfBrands));
    }
    return withCompanyDefaults(store);
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
