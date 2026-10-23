import { internalMutation } from "./_generated/server";
import {
  proposeTakeoffMaterial,
  takeoffMaterialProposalArgs,
  takeoffMaterialProposalResultValidator,
} from "./model/procurement/takeoffProposals";

/**
 * Material proposal from the RLP Takeoff desktop app, reached through
 * `POST /takeoff/materials` (see `http.ts`). Internal: the route checks the
 * token and validates the body.
 */
export const propose = internalMutation({
  args: takeoffMaterialProposalArgs,
  returns: takeoffMaterialProposalResultValidator,
  handler: async (ctx, args) => {
    return await proposeTakeoffMaterial(ctx, args);
  },
});
