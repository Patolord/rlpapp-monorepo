import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  allocateNextSku,
  buildMaterialIdentityKey,
  buildMaterialSearchText,
  deriveVariantLabel,
  findMaterialByIdentity,
  normalizeUnit,
  sanitizeDimensions,
  type MaterialDimensions,
} from "../../lib/compras/catalog";
import { normalizeText } from "../../lib/compras/procurement";
import { materialDimensions, materialStatus } from "../../schema";
import { catalogStatus } from "./takeoffCatalog";

// ---------------------------------------------------------------------------
// Material proposals coming from the RLP Takeoff desktop app
// ---------------------------------------------------------------------------
//
// Adding materials to the catalog is purchasing's job. A takeoff user can only
// *propose* one: the proposal creates a `draft` material (or links to the one
// that already exists with the same identity) and, when a price was given, an
// unreviewed price event in purchasing's review queue. Purchasing activates,
// edits or merges the draft with the tools it already has. Nothing here ever
// blocks the budget being edited in the desktop app: the call is idempotent
// per `clientId`, so the app can queue it and retry.

export const MAX_PROPOSAL_TEXT_LENGTH = 200;
export const MAX_PROPOSAL_SPEC_LENGTH = 1000;
export const MATERIAL_NOT_FOUND = "Material não encontrado";
/** Shown as the supplier of an estimate typed in the takeoff. */
export const TAKEOFF_PRICE_SUPPLIER = "RLP Takeoff";

export const takeoffMaterialProposalArgs = {
  clientId: v.string(),
  // Existing material (price proposal only). Unchecked string: a bad id must
  // answer 404, not fail validation.
  materialId: v.optional(v.string()),
  name: v.optional(v.string()),
  variantLabel: v.optional(v.string()),
  spec: v.optional(v.string()),
  category: v.optional(v.string()),
  unit: v.optional(v.string()),
  dimensions: v.optional(materialDimensions),
  // Reais, as the takeoff stores them; converted to cents here.
  unitPrice: v.optional(v.number()),
  priceDate: v.optional(v.number()),
  requestedBy: v.optional(v.string()),
  takeoffName: v.optional(v.string()),
};

export type TakeoffMaterialProposalInput = {
  clientId: string;
  materialId?: string;
  name?: string;
  variantLabel?: string;
  spec?: string;
  category?: string;
  unit?: string;
  dimensions?: MaterialDimensions;
  unitPrice?: number;
  priceDate?: number;
  requestedBy?: string;
  /** Signed-in desktop user (takeoffMaterials.proposeAsUser); never from a body. */
  requestedByUserId?: Id<"users">;
  takeoffName?: string;
};

export const takeoffMaterialProposalResultValidator = v.object({
  outcome: v.union(
    v.literal("created"),
    v.literal("matched"),
    v.literal("replayed")
  ),
  materialId: v.id("materials"),
  sku: v.union(v.string(), v.null()),
  materialStatus,
  mergedInto: v.union(v.id("materials"), v.null()),
  priceEventId: v.union(v.id("priceEvents"), v.null()),
});

export type TakeoffMaterialProposalResult = {
  outcome: "created" | "matched" | "replayed";
  materialId: Id<"materials">;
  sku: string | null;
  materialStatus: "draft" | "active" | "archived";
  mergedInto: Id<"materials"> | null;
  priceEventId: Id<"priceEvents"> | null;
};

// --- Request body parsing (pure; the HTTP handler answers 400 on error) -----

type ParseResult =
  | { ok: true; value: TakeoffMaterialProposalInput }
  | { ok: false; error: string };

const DIMENSION_KEYS = [
  "widthMm",
  "heightMm",
  "lengthMm",
  "thicknessMm",
  "diameterMm",
] as const;

function readText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`"${key}" must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`"${key}" must have at most ${maxLength} characters`);
  }
  return trimmed || undefined;
}

function readNumber(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number } = {}
): number | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`"${key}" must be a finite number`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`"${key}" must be >= ${options.min}`);
  }
  return value;
}

function readDimensions(
  body: Record<string, unknown>
): MaterialDimensions | undefined {
  const value = body.dimensions;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error('"dimensions" must be an object');
  }
  const record = value as Record<string, unknown>;
  const dimensions: MaterialDimensions = {};
  for (const key of DIMENSION_KEYS) {
    const read = readNumber(record, key, { min: 0 });
    // sanitizeDimensions rejects 0 later with a plain error (a 500 / an
    // endless retry in the app): refuse it here, as a bad request.
    if (read === 0) throw new Error(`"dimensions.${key}" must be > 0`);
    if (read !== undefined) dimensions[key] = read;
  }
  return dimensions;
}

export function parseTakeoffMaterialProposal(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;
  try {
    const clientId = readText(record, "clientId", MAX_PROPOSAL_TEXT_LENGTH);
    if (!clientId) return { ok: false, error: '"clientId" is required' };
    const materialId = readText(record, "materialId", MAX_PROPOSAL_TEXT_LENGTH);
    const name = readText(record, "name", MAX_PROPOSAL_TEXT_LENGTH);
    if (!materialId && !name) {
      return { ok: false, error: 'Either "materialId" or "name" is required' };
    }
    return {
      ok: true,
      value: {
        clientId,
        materialId,
        name,
        variantLabel: readText(record, "variantLabel", MAX_PROPOSAL_TEXT_LENGTH),
        spec: readText(record, "spec", MAX_PROPOSAL_SPEC_LENGTH),
        category: readText(record, "category", MAX_PROPOSAL_TEXT_LENGTH),
        unit: readText(record, "unit", MAX_PROPOSAL_TEXT_LENGTH),
        dimensions: readDimensions(record),
        unitPrice: readNumber(record, "unitPrice", { min: 0 }),
        priceDate: readNumber(record, "priceDate", { min: 0 }),
        requestedBy: readText(record, "requestedBy", MAX_PROPOSAL_TEXT_LENGTH),
        takeoffName: readText(record, "takeoffName", MAX_PROPOSAL_TEXT_LENGTH),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid body",
    };
  }
}

// --- Mutation logic ---------------------------------------------------------

function toResult(
  outcome: TakeoffMaterialProposalResult["outcome"],
  material: Doc<"materials">,
  priceEventId: Id<"priceEvents"> | null
): TakeoffMaterialProposalResult {
  return {
    outcome,
    materialId: material._id,
    sku: material.sku ?? null,
    materialStatus: catalogStatus(material),
    mergedInto: material.mergedIntoId ?? null,
    priceEventId,
  };
}

async function findOrCreateFamily(
  ctx: MutationCtx,
  name: string,
  category: string | undefined,
  unit: string | undefined,
  now: number
): Promise<Doc<"materialFamilies">> {
  const nameNormalized = normalizeText(name);
  const existing = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  if (existing) return existing;
  const familyId = await ctx.db.insert("materialFamilies", {
    name,
    nameNormalized,
    category,
    baseUnit: unit,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const family = await ctx.db.get("materialFamilies", familyId);
  if (!family) throw new Error("Falha ao criar família de material");
  return family;
}

/** Links to the identical material when it exists, otherwise creates a draft. */
async function resolveMaterial(
  ctx: MutationCtx,
  input: TakeoffMaterialProposalInput,
  now: number
): Promise<{ material: Doc<"materials">; created: boolean }> {
  if (input.materialId) {
    const id = ctx.db.normalizeId("materials", input.materialId);
    const material = id ? await ctx.db.get("materials", id) : null;
    if (!material) throw new Error(MATERIAL_NOT_FOUND);
    return { material, created: false };
  }

  const name = input.name?.trim();
  if (!name) throw new Error("Informe o nome do material");
  const unit = normalizeUnit(input.unit);
  const family = await findOrCreateFamily(ctx, name, input.category, unit, now);
  const dimensions = sanitizeDimensions(input.dimensions);
  const variantLabel = deriveVariantLabel({
    variantLabel: input.variantLabel,
    dimensions,
  });
  const identityKey = buildMaterialIdentityKey({
    familyId: family._id,
    unit,
    variantLabel,
    dimensions,
  });
  const existing = await findMaterialByIdentity(ctx, { identityKey });
  if (existing) return { material: existing, created: false };

  const sku = await allocateNextSku(ctx);
  const category = input.category ?? family.category;
  const materialId = await ctx.db.insert("materials", {
    name: family.name,
    familyId: family._id,
    variantLabel,
    dimensions,
    identityKey,
    sku,
    category,
    unit,
    spec: input.spec,
    searchText: buildMaterialSearchText({
      name: family.name,
      variantLabel,
      sku,
      category,
      spec: input.spec,
    }),
    trackInventory: true,
    active: true,
    // Purchasing promotes the draft to "active" (or merges it) in the web app.
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  const material = await ctx.db.get("materials", materialId);
  if (!material) throw new Error("Falha ao criar material");
  return { material, created: true };
}

async function recordEstimate(
  ctx: MutationCtx,
  material: Doc<"materials">,
  input: TakeoffMaterialProposalInput,
  now: number
): Promise<Id<"priceEvents"> | null> {
  if (input.unitPrice === undefined) return null;
  const context = [input.takeoffName, input.requestedBy]
    .filter(Boolean)
    .join(" — ");
  return await ctx.db.insert("priceEvents", {
    rawDescription: [material.name, material.variantLabel]
      .filter(Boolean)
      .join(" — "),
    materialId: material._id,
    supplierNameRaw: TAKEOFF_PRICE_SUPPLIER,
    unitPriceCents: Math.round(input.unitPrice * 100),
    unit: normalizeUnit(input.unit) ?? material.unit,
    source: "manual",
    occurredAt: input.priceDate ?? now,
    notes: context
      ? `Estimativa do RLP Takeoff (${context})`
      : "Estimativa do RLP Takeoff",
    // Always queued for purchasing: an estimate must not displace real quotes
    // until someone reviews it (see pickCurrentPriceEvent).
    reviewStatus: "unreviewed",
    needsReview: true,
    createdAt: now,
  });
}

export async function proposeTakeoffMaterial(
  ctx: MutationCtx,
  input: TakeoffMaterialProposalInput
): Promise<TakeoffMaterialProposalResult> {
  const previous = await ctx.db
    .query("takeoffMaterialProposals")
    .withIndex("by_client_id", (q) => q.eq("clientId", input.clientId))
    .unique();
  if (previous) {
    const material = await ctx.db.get("materials", previous.materialId);
    if (!material) throw new Error(MATERIAL_NOT_FOUND);
    return toResult("replayed", material, previous.priceEventId ?? null);
  }

  const now = Date.now();
  const { material, created } = await resolveMaterial(ctx, input, now);
  const priceEventId = await recordEstimate(ctx, material, input, now);
  const outcome = created ? "created" : "matched";
  await ctx.db.insert("takeoffMaterialProposals", {
    clientId: input.clientId,
    materialId: material._id,
    priceEventId: priceEventId ?? undefined,
    outcome,
    requestedName: input.name,
    requestedUnit: input.unit,
    requestedBy: input.requestedBy,
    requestedByUserId: input.requestedByUserId,
    takeoffName: input.takeoffName,
    createdAt: now,
  });
  return toResult(outcome, material, priceEventId);
}
