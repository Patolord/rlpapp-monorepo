import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Playwright roda fora do Vite, então carrega o .env.local manualmente.
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env.local", import.meta.url)));
} catch {
  // Sem .env.local (ex.: CI) — as variáveis devem vir do ambiente.
}

// @clerk/testing espera CLERK_PUBLISHABLE_KEY; o app usa o prefixo VITE_.
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
