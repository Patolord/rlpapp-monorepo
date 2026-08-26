import { describe, expect, test } from "vitest";

import { isAllowedHost, parseAllowedHosts } from "./host";

describe("MCP host allow-list", () => {
  test("parses comma-separated hosts", () => {
    expect(parseAllowedHosts("localhost:3001, app.rlpeng.com.br ")).toEqual([
      "localhost:3001",
      "app.rlpeng.com.br",
    ]);
  });

  test("accepts an allowed Host header", () => {
    const allowed = parseAllowedHosts("localhost:3001,app.rlpeng.com.br");
    expect(isAllowedHost("localhost:3001", allowed)).toBe(true);
    expect(isAllowedHost("APP.RLPENG.COM.BR", allowed)).toBe(true);
  });

  test("rejects a missing or unknown Host header", () => {
    const allowed = parseAllowedHosts("app.rlpeng.com.br");
    expect(isAllowedHost(null, allowed)).toBe(false);
    expect(isAllowedHost("evil.example", allowed)).toBe(false);
  });
});
