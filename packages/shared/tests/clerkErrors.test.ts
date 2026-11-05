import { describe, expect, it, vi } from "vitest";

import {
  findExistingClerkSessionId,
  getClerkLoginErrorMessage,
} from "../src/clerkErrors";

const sessionExists = { errors: [{ code: "session_exists" }] };

function clientWith(...usernames: string[]) {
  return {
    reload: vi.fn(async () => ({
      sessions: usernames.map((username, i) => ({
        id: `sess_${i}`,
        user: { username },
      })),
    })),
  };
}

describe("findExistingClerkSessionId", () => {
  it("returns the session when it belongs to the typed user", async () => {
    await expect(
      findExistingClerkSessionId(sessionExists, clientWith("ana"), "ana")
    ).resolves.toBe("sess_0");
  });

  it("never resumes another user's session", async () => {
    await expect(
      findExistingClerkSessionId(sessionExists, clientWith("ana"), "bruno")
    ).resolves.toBeNull();
  });

  it("ignores other errors without calling Clerk", async () => {
    const client = clientWith("ana");
    await expect(
      findExistingClerkSessionId(
        { errors: [{ code: "form_password_incorrect" }] },
        client,
        "ana"
      )
    ).resolves.toBeNull();
    expect(client.reload).not.toHaveBeenCalled();
  });

  it("returns null when the client is missing or the reload fails", async () => {
    await expect(
      findExistingClerkSessionId(sessionExists, undefined, "ana")
    ).resolves.toBeNull();
    await expect(
      findExistingClerkSessionId(
        sessionExists,
        { reload: () => Promise.reject(new Error("offline")) },
        "ana"
      )
    ).resolves.toBeNull();
  });
});

describe("getClerkLoginErrorMessage", () => {
  it("translates session_exists", () => {
    expect(getClerkLoginErrorMessage(sessionExists)).toMatch(
      /outra conta conectada/
    );
  });
});
