import { ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import { engineeringOrPurchasingMutation } from "./lib/rbac";
import {
  MATERIAL_NOT_FOUND,
  parseTakeoffMaterialProposal,
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

const { requestedBy: _requestedBy, ...signedInProposalArgs } =
  takeoffMaterialProposalArgs;

/**
 * Same proposal from a desktop app signed in with the company account (see
 * `takeoffAuth.ts`): the requester is the signed-in user, not free text.
 *
 * Expected failures throw `ConvexError({ code })` so the app can tell a bad
 * proposal (dropped from its outbox) from a transient one (retried):
 * `INVALID_PROPOSAL` or `MATERIAL_NOT_FOUND`. Plain errors are redacted in
 * production and mean "try again later".
 */
export const proposeAsUser = engineeringOrPurchasingMutation({
  args: signedInProposalArgs,
  returns: takeoffMaterialProposalResultValidator,
  handler: async (ctx, args) => {
    // Same limits as the HTTP route (lengths, dimensions, prices >= 0).
    const parsed = parseTakeoffMaterialProposal(args);
    if (!parsed.ok) {
      throw new ConvexError({ code: "INVALID_PROPOSAL", message: parsed.error });
    }
    try {
      return await proposeTakeoffMaterial(ctx, {
        ...parsed.value,
        requestedBy: ctx.user.name,
        requestedByUserId: ctx.user._id,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes(MATERIAL_NOT_FOUND)) {
        throw new ConvexError({
          code: "MATERIAL_NOT_FOUND",
          message: MATERIAL_NOT_FOUND,
        });
      }
      // Catalog validation (lib/compras/catalog.ts) the parser does not
      // repeat: still a bad proposal, never worth retrying.
      if (error instanceof Error && error.message.startsWith("Dimensão inválida")) {
        throw new ConvexError({ code: "INVALID_PROPOSAL", message: error.message });
      }
      throw error;
    }
  },
});
