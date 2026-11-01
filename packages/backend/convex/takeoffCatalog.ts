import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { engineeringOrPurchasingQuery } from "./lib/rbac";
import {
  listTakeoffCatalog,
  takeoffCatalogItemValidator,
} from "./model/procurement/takeoffCatalog";

/**
 * Catalog consumed by the RLP Takeoff desktop app through
 * `GET /takeoff/catalog` (see `http.ts`). Internal: the route checks the token.
 */
export const list = internalQuery({
  args: { now: v.number() },
  returns: v.array(takeoffCatalogItemValidator),
  handler: async (ctx, args) => {
    return await listTakeoffCatalog(ctx, args.now);
  },
});

/**
 * Same catalog for a desktop app signed in with the company account (see
 * `takeoffAuth.ts`): called with the user's own JWT, so access follows the
 * user's permissions instead of a shared token. Same shape as the HTTP route.
 */
export const current = engineeringOrPurchasingQuery({
  args: {},
  returns: v.object({
    generatedAt: v.number(),
    items: v.array(takeoffCatalogItemValidator),
  }),
  handler: async (ctx) => {
    const generatedAt = Date.now();
    return { generatedAt, items: await listTakeoffCatalog(ctx, generatedAt) };
  },
});
