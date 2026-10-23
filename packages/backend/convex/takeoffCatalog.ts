import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
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
