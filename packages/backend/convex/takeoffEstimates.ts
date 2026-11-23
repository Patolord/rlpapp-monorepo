import { engineeringOrPurchasingQuery } from "./lib/rbac";
import {
  bathroomExhaustEstimateArgs,
  estimateBathroomExhaust,
  estimateResultValidator,
  estimateSplit,
  splitEstimateArgs,
} from "./model/procurement/takeoffEstimate";

/**
 * Quick estimates of the RLP Takeoff service calculators, for agents (MCP): the same quantities
 * as the desktop app's "Takeoff por estimativa", priced from the company catalog. Read only;
 * prices in reais.
 */

export const split = engineeringOrPurchasingQuery({
  args: splitEstimateArgs,
  returns: estimateResultValidator,
  handler: async (ctx, args) => {
    return await estimateSplit(ctx, args);
  },
});

export const bathroomExhaust = engineeringOrPurchasingQuery({
  args: bathroomExhaustEstimateArgs,
  returns: estimateResultValidator,
  handler: async (ctx, args) => {
    return await estimateBathroomExhaust(ctx, args);
  },
});
