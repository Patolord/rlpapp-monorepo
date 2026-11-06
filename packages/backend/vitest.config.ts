import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/**/*.test.ts"],
    // O primeiro `t.fetch` de cada arquivo carrega http.ts e todo o grafo de
    // módulos; sob `turbo run lint check-types test` em paralelo isso passa
    // dos 5 s padrão do vitest.
    testTimeout: 20_000,
  },
});
