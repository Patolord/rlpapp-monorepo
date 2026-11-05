import { describe, expect, it } from "vitest";
import {
  formatDisplayName,
  formatUsername,
  normalizeUsername,
  sanitizeUsernameInput,
  suggestUsername,
} from "../src/usernames";

describe("usernames", () => {
  it("sanitizes live input to lowercase Clerk-safe chars", () => {
    expect(sanitizeUsernameInput("Jo ão.Silva_1-x!")).toBe("joo.silva_1-x");
  });

  it("normalizes on submit by trimming then sanitizing", () => {
    expect(normalizeUsername("  Rodrigo ")).toBe("rodrigo");
  });

  it("formats for display with the first letter uppercase", () => {
    expect(formatUsername("rodrigo")).toBe("Rodrigo");
    expect(formatUsername("joao.silva")).toBe("Joao.silva");
    expect(formatUsername("1abc")).toBe("1abc");
    expect(formatUsername("")).toBe("");
  });

  it("formats display names by capitalizing only the first letter", () => {
    expect(formatDisplayName("rodrigo")).toBe("Rodrigo");
    expect(formatDisplayName("Wellington Bispo")).toBe("Wellington Bispo");
    expect(formatDisplayName("joão de souza")).toBe("João de souza");
  });
});

describe("suggestUsername", () => {
  it("joins first and last name with a dot, without accents", () => {
    expect(suggestUsername("João", "Silva")).toBe("joao.silva");
    expect(suggestUsername(" Maria Clara ", "Souza Lima")).toBe("mariaclara.souzalima");
  });

  it("skips empty parts", () => {
    expect(suggestUsername("Ana", "")).toBe("ana");
    expect(suggestUsername("", "")).toBe("");
  });
});
