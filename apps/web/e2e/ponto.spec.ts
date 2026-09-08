import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_CLERK_USER_USERNAME;
const password = process.env.E2E_CLERK_USER_PASSWORD;
const hasCredentials = Boolean(username && password);

async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await page.waitForFunction(
    () => (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
  );
  await page.getByLabel("Usuário").fill(username!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/app");
}

async function openPonto(page: Page) {
  await page.goto("/rh/ponto");
  if (!page.url().includes("/rh/ponto")) {
    test.info().annotations.push({
      type: "unverified",
      description: "A conta E2E não tem acesso a RH; cobertura de ponto autenticada não pôde ser exercitada.",
    });
    test.skip(true, "E2E user is not RH/admin/director");
  }
}

test.describe("Ponto", () => {
  test("unauthenticated visits redirect away from /rh/ponto", async ({ page }) => {
    await page.goto("/rh/ponto");
    await page.waitForURL((url) => !url.pathname.startsWith("/rh/ponto"));
    await expect(page.getByText("Acesse sua conta para continuar")).toBeVisible();
  });

  test("production service worker keeps attendance online-only", async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_PWA !== "1",
      "Service worker de produção não é exercitado no Vite dev server. A exclusão está em vite.config.ts (NetworkOnly para /rh/ponto e /attendance/photo) e em attendance-cache-cleanup.js.",
    );
    await page.goto("/rh/ponto");
    const leftover = await page.evaluate(async () => {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (/^\/rh\/ponto(?:\/|$)/.test(url.pathname) || url.pathname === "/attendance/photo") {
            return request.url;
          }
        }
      }
      return null;
    });
    expect(leftover).toBeNull();
  });
});

test.describe("Authenticated ponto", () => {
  test.skip(!hasCredentials, "E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD não configurados");

  test("navigates dashboard, reports and settings on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await openPonto(page);
    await expect(page.getByRole("heading", { name: "Marcações de ponto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Atualizar agora" })).toBeVisible();
    await expect(page.getByText("Com marcação")).toBeVisible();
    await expect(page.getByText("Sem marcação")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filtros" })).toBeHidden();
    await page.getByRole("link", { name: "Relatórios" }).click();
    await expect(page.getByRole("heading", { name: "Relatórios de ponto" })).toBeVisible();
    await expect(page.getByText("Estimativa operacional")).toBeVisible();
    await page.getByRole("link", { name: "Vínculos e ajustes" }).click();
    await expect(page.getByRole("heading", { name: "Vínculos e ajustes" })).toBeVisible();
    await expect(page.getByText("Diária de referência")).toBeVisible();
  });

  test("uses filter sheet and map/list switch on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await openPonto(page);
    await expect(page.getByRole("button", { name: "Filtros" })).toBeVisible();
    await page.getByRole("button", { name: "Filtros" }).click();
    await expect(page.getByRole("heading", { name: "Filtros" })).toBeVisible();
    await expect(page.getByPlaceholder("Buscar por nome")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();
    await page.getByRole("button", { name: "Mapa" }).click();
    await expect(page.getByLabel("Mapa da última marcação com localização")).toBeVisible();
    await page.getByRole("button", { name: "Lista" }).click();
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
  });
});
