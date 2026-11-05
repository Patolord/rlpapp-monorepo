import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { PROPOSAL_FORBIDDEN_MESSAGE, proposalFailure } from "./convex";

describe("proposalFailure", () => {
  it("keeps a proposal queued when the account lacks the permission (takeoff access only)", () => {
    // what engineeringOrPurchasingMutation throws for an account with only `takeoff`
    const forbidden = new ConvexError({
      code: "FORBIDDEN",
      message: "Acesso restrito à engenharia ou compras",
    });
    expect(proposalFailure(forbidden)).toEqual({
      kind: "retry",
      message: PROPOSAL_FORBIDDEN_MESSAGE,
    });
  });

  it("keeps it queued for a deactivated or unauthenticated account too", () => {
    expect(
      proposalFailure(new ConvexError({ code: "FORBIDDEN", message: "Usuário desativado" })),
    ).toEqual({ kind: "retry", message: "sua conta está desativada no app da empresa" });
    expect(proposalFailure(new ConvexError({ code: "UNAUTHENTICATED" })).kind).toBe("retry");
  });

  it("drops a proposal the server refuses on its merits", () => {
    expect(
      proposalFailure(new ConvexError({ code: "INVALID_PROPOSAL", message: "name obrigatório" })),
    ).toEqual({ kind: "rejected", message: "name obrigatório" });
    expect(proposalFailure(new ConvexError({ code: "MATERIAL_NOT_FOUND" })).kind).toBe("rejected");
  });

  it("retries anything else (offline, redacted server error)", () => {
    expect(proposalFailure(new Error("[Request ID: x] Server Error"))).toEqual({
      kind: "retry",
      message: "[Request ID: x] Server Error",
    });
  });
});
