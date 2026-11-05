import { describe, expect, it } from "vitest";
import { internalRedirect } from "./safe-redirect";

describe("internalRedirect", () => {
  it("keeps internal paths with query and hash", () => {
    expect(internalRedirect("/app")).toBe("/app");
    expect(internalRedirect("/takeoff/conectar?port=53000&state=abc#x")).toBe(
      "/takeoff/conectar?port=53000&state=abc#x"
    );
  });

  it("rejects anything that leaves the site", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r\n/evil.example",
      "https://evil.example/app",
      "javascript:alert(1)",
      "app",
      "",
      undefined,
      42,
    ]) {
      expect(internalRedirect(value)).toBeNull();
    }
  });
});
