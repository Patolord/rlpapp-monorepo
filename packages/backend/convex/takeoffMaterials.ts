import { engineeringOrPurchasingMutation } from "./lib/rbac";
import {
  proposeTakeoffMaterialAsUser,
  takeoffMaterialProposalArgs,
  takeoffMaterialProposalResultValidator,
} from "./model/procurement/takeoffProposals";

const { requestedBy: _requestedBy, ...signedInProposalArgs } =
  takeoffMaterialProposalArgs;

/**
 * Material proposal from the RLP Takeoff desktop app, signed in with the
 * company account (see `takeoffAuth.ts`): the requester is the signed-in user.
 *
 * Expected failures throw `ConvexError({ code })` so the app can tell a bad
 * proposal (dropped from its outbox) from a transient one (retried):
 * `INVALID_PROPOSAL` or `MATERIAL_NOT_FOUND`. Plain errors are redacted in
 * production and mean "try again later".
 */
export const proposeAsUser = engineeringOrPurchasingMutation({
  args: signedInProposalArgs,
  returns: takeoffMaterialProposalResultValidator,
  handler: async (ctx, args) => await proposeTakeoffMaterialAsUser(ctx, ctx.user, args),
});
