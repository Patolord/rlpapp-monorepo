import { api } from "@rlpapp/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { RemoteCatalog } from "../catalog";
import { parseRemoteCatalogResponse } from "../catalog";
import type { ProposalBody, SendOutcome, SignedInProposal } from "../catalogRemote";
import { CONVEX_URL } from "./config";
import { getJwt, SignedOutError } from "./session";

/**
 * Typed calls to the company backend as the signed-in user: the backend's own function
 * references and types (`api.*` from @rlpapp/backend), authenticated with the account's JWT.
 * Access follows the user's permissions there (engineering or purchasing).
 */

let client: ConvexHttpClient | null = null;
const getClient = (): ConvexHttpClient => {
  client ??= new ConvexHttpClient(CONVEX_URL);
  return client;
};

/**
 * Run a call with the current JWT. A refusal that is not a domain error (ConvexError) may be an
 * expired or rotated JWT: renew it and try once more. A revoked device token surfaces as
 * SignedOutError from the renewal.
 */
async function asUser<T>(call: (c: ConvexHttpClient) => Promise<T>): Promise<T> {
  const c = getClient();
  c.setAuth(await getJwt());
  try {
    return await call(c);
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    c.setAuth(await getJwt(true));
    return await call(c);
  }
}

/** The company catalog (`takeoffCatalog.current`), parsed like the token route's JSON. */
export async function fetchCatalogAsUser(): Promise<RemoteCatalog> {
  const snapshot = await asUser((c) => c.query(api.takeoffCatalog.current, {}));
  return parseRemoteCatalogResponse(snapshot);
}

/** Only the fields the mutation accepts: queued bodies of older versions may carry others. */
export function signedInProposalArgs(body: ProposalBody): SignedInProposal {
  return {
    clientId: body.clientId,
    materialId: body.materialId,
    name: body.name,
    variantLabel: body.variantLabel,
    spec: body.spec,
    category: body.category,
    unit: body.unit,
    dimensions: body.dimensions,
    unitPrice: body.unitPrice,
    priceDate: body.priceDate,
    takeoffName: body.takeoffName,
  };
}

/**
 * `takeoffMaterials.proposeAsUser`: the requester is the signed-in user. Domain refusals
 * (ConvexError: invalid proposal, unknown material) are final; anything else is retried later.
 * SignedOutError propagates: the caller drops the session and keeps the proposal queued.
 */
export async function sendProposalAsUser(body: ProposalBody): Promise<SendOutcome> {
  try {
    const result = await asUser((c) =>
      c.mutation(api.takeoffMaterials.proposeAsUser, signedInProposalArgs(body)),
    );
    return { kind: "sent", result };
  } catch (e) {
    if (e instanceof SignedOutError) throw e;
    if (e instanceof ConvexError) {
      const data = e.data as { code?: unknown; message?: unknown } | string;
      const message =
        typeof data === "string"
          ? data
          : typeof data?.message === "string"
            ? data.message
            : String(data?.code ?? "recusado");
      return { kind: "rejected", message };
    }
    return { kind: "retry", message: e instanceof Error ? e.message : String(e) };
  }
}
