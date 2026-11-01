import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { TOOLS } from "./manifest";
import { BUILT_IN_TOOL_NAMES } from "./tools";

/**
 * O manifesto aponta para funções do backend pelo nome. O catálogo gerado
 * (packages/backend/convex/mcp/catalog.generated.ts) é a lista autoritativa
 * de funções públicas, então toda entrada do manifesto precisa existir lá.
 */
function publicFunctionPaths(): Set<string> {
  const file = resolve(
    import.meta.dirname,
    "../../../../../packages/backend/convex/mcp/catalog.generated.ts"
  );
  const source = readFileSync(file, "utf8");
  const section = source.slice(source.indexOf("export const ACCESS_HINTS"));
  return new Set([...section.matchAll(/^\s+"([\w/]+:\w+)":/gm)].map((m) => m[1]!));
}

describe("manifesto de ferramentas", () => {
  test("toda ferramenta aponta para uma função pública existente", () => {
    const paths = publicFunctionPaths();
    expect(paths.size).toBeGreaterThan(100);
    const missing = TOOLS.filter((tool) => !paths.has(tool.function)).map(
      (tool) => `${tool.name} → ${tool.function}`
    );
    expect(missing).toEqual([]);
  });

  test("nomes são únicos, válidos e não colidem com as ferramentas embutidas", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(BUILT_IN_TOOL_NAMES.has(name)).toBe(false);
    }
    const functions = TOOLS.map((tool) => tool.function);
    expect(new Set(functions).size).toBe(functions.length);
  });

  test("nenhuma ferramenta expõe tokens de QR code ou uploads", () => {
    const forbidden =
      /^qrCodes:(getByToken|getFullContext|getBatchTokens|list|listWithEquipment|listByBatch|search|listByProject|listRegisteredForProject|listAvailableBatches)$|generateUploadUrl/;
    expect(TOOLS.filter((tool) => forbidden.test(tool.function))).toEqual([]);
  });
});
