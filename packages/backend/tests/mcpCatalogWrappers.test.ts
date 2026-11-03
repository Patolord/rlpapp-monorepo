import { describe, expect, test } from "vitest";

/**
 * Todo wrapper de função exportado por lib/rbac.ts precisa de uma dica em
 * WRAPPER_HINTS (scripts/generate-mcp-catalog.mjs); sem ela, as funções que o
 * usam somem do catálogo MCP e da API `/api/v1` em silêncio.
 */
const sources = import.meta.glob(["../convex/lib/rbac.ts", "../scripts/generate-mcp-catalog.mjs"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("catálogo MCP", () => {
  test("conhece todos os wrappers de lib/rbac.ts", () => {
    const rbac = sources["../convex/lib/rbac.ts"]!;
    const generator = sources["../scripts/generate-mcp-catalog.mjs"]!;
    const hintsBlock = generator.slice(
      generator.indexOf("const WRAPPER_HINTS"),
      generator.indexOf("};", generator.indexOf("const WRAPPER_HINTS"))
    );
    const wrappers = [...rbac.matchAll(/^export const (\w+(?:Query|Mutation)) =/gm)].map(
      (m) => m[1]!
    );
    expect(wrappers).toContain("engineeringOrPurchasingMutation");
    const missing = wrappers.filter((w) => !new RegExp(`\\b${w}:`).test(hintsBlock));
    expect(missing).toEqual([]);
  });
});
