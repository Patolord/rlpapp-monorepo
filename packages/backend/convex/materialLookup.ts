import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { findCatalogMaterial } from "./model/procurement/materialLookup";

const lookupMaterialValidator = v.object({
  id: v.id("materials"),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  description: v.string(),
});

export const findMaterialResultValidator = v.union(
  v.object({
    status: v.literal("found"),
    matchedBy: v.union(
      v.literal("sku"),
      v.literal("alias"),
      v.literal("name"),
      v.literal("search")
    ),
    material: lookupMaterialValidator,
  }),
  v.object({
    status: v.literal("ambiguous"),
    candidates: v.array(lookupMaterialValidator),
  }),
  v.object({
    status: v.literal("not_found"),
    // Partial matches the caller may offer as "Talvez você queira".
    candidates: v.array(lookupMaterialValidator),
  })
);

/**
 * Deterministic lookup: SKU → exact alias → exact family name → full-text
 * search ranked by query-token coverage. Every returned value comes from the DB.
 */
export const findMaterial = internalQuery({
  args: { query: v.string() },
  returns: findMaterialResultValidator,
  handler: async (ctx, args) => await findCatalogMaterial(ctx, { query: args.query }),
});
