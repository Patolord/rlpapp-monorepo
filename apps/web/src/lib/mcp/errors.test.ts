import { describe, expect, test } from "vitest";

import { sanitizeErrorMessage } from "./errors";

describe("sanitizeErrorMessage", () => {
  test("keeps known authorization errors", () => {
    expect(sanitizeErrorMessage(new Error("Acesso restrito à área de engenharia"))).toBe(
      "Acesso restrito à área de engenharia"
    );
  });

  test("hides unexpected errors", () => {
    expect(sanitizeErrorMessage(new Error("ECONNREFUSED 127.0.0.1:3210"))).toBe(
      "Unable to complete request"
    );
  });
});
