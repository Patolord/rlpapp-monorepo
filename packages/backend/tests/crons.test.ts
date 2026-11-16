import { expect, test } from "vitest";

// O deploy analisa crons.ts e recusa o push inteiro se um nome de cron não for
// ASCII imprimível; nenhum outro teste carrega este arquivo.
test("crons.ts carrega (nomes de cron válidos para o Convex)", async () => {
  await expect(import("../convex/crons")).resolves.toHaveProperty("default");
});
