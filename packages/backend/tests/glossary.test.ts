// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { DOMAIN_DEPENDENCIES } from "../eslint.config.mjs";

// CONTEXT.md (raiz do repo) é a linguagem do domínio: toda tabela e todo
// domínio de convex/model/ aparecem lá, e o mapa de contextos do ESLint cobre
// exatamente os domínios que existem.
const glossary = readFileSync(fileURLToPath(new URL("../../../CONTEXT.md", import.meta.url)), "utf8");
const modelDomains = readdirSync(fileURLToPath(new URL("../convex/model", import.meta.url)), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("CONTEXT.md", () => {
  test("defines every table", () => {
    const missing = Object.keys(schema.tables).filter((table) => !glossary.includes(`\`${table}\``));
    expect(missing, "tabelas sem verbete em CONTEXT.md").toEqual([]);
  });

  test("lists every model domain in the context map", () => {
    const missing = modelDomains.filter((domain) => !glossary.includes(`| \`${domain}\` |`));
    expect(missing, "domínios fora do mapa de contextos de CONTEXT.md").toEqual([]);
  });

  test("the ESLint context map covers exactly the model domains", () => {
    expect(Object.keys(DOMAIN_DEPENDENCIES).sort()).toEqual(modelDomains);
  });
});
