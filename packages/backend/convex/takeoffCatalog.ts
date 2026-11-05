import { v } from "convex/values";
import { engineeringOrPurchasingQuery } from "./lib/rbac";
import {
  listTakeoffCatalog,
  takeoffCatalogItemValidator,
} from "./model/procurement/takeoffCatalog";
import {
  listPublishedTakeoffKits,
  takeoffKitValidator,
} from "./model/procurement/takeoffKits";
import {
  listPublishedTakeoffSettings,
  takeoffSettingsValidator,
} from "./model/procurement/takeoffSettings";

/**
 * Catalog consumed by the RLP Takeoff desktop app, signed in with the company
 * account (see `takeoffAuth.ts`): called with the user's own JWT, so access
 * follows the user's permissions. The materials with their current price plus
 * the company's kit presets (`takeoffKits`) and the other settings
 * (`takeoffSettings`: weights, prices per kg, VRF brands, labour, duct
 * normas), which the app takes as its defaults and caches for offline use.
 */
export const current = engineeringOrPurchasingQuery({
  args: {},
  returns: v.object({
    generatedAt: v.number(),
    items: v.array(takeoffCatalogItemValidator),
    kits: v.array(takeoffKitValidator),
    ...takeoffSettingsValidator.fields,
  }),
  handler: async (ctx) => {
    const generatedAt = Date.now();
    return {
      generatedAt,
      items: await listTakeoffCatalog(ctx, generatedAt),
      kits: await listPublishedTakeoffKits(ctx),
      ...(await listPublishedTakeoffSettings(ctx)),
    };
  },
});
