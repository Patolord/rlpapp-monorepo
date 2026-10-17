import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_CLERK_USER_USERNAME;
const password = process.env.E2E_CLERK_USER_PASSWORD;

const PONTO_PATH = /^\/rh\/ponto(?:\/|$)/;

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

/** Abre o ponto; pula o teste quando a conta E2E não é do RH/admin. */
async function openPonto(page: Page) {
  await page.goto("/rh/ponto");
  const allowed = await page
    .getByRole("heading", { name: "Ponto (RHID)" })
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!allowed, "Conta E2E sem acesso ao RH; fluxo do ponto não exercitado");
}

/** Os títulos dos cards se repetem em subtítulos; casa só o texto exato. */
function metric(page: Page, title: string) {
  return page.getByText(title, { exact: true }).first();
}

test.describe("Ponto", () => {
  test("sem login, /rh/ponto pede autenticação", async ({ page }) => {
    await page.goto("/rh/ponto");
    await expect(page.getByText("Acesse sua conta para continuar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ponto (RHID)" })).toHaveCount(0);
  });

  test("service worker de produção não guarda o ponto em cache", async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_PWA !== "1",
      "O service worker só existe no build de produção (vite build + preview). Regra em vite.config.ts e limpeza em public/ponto-cache-cleanup.js.",
    );
    await page.goto("/rh/ponto");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const leftover = await page.evaluate(async (pattern) => {
      const regex = new RegExp(pattern);
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (regex.test(url.pathname) || url.pathname.startsWith("/time-clock/photo/")) {
            return request.url;
          }
        }
      }
      return null;
    }, PONTO_PATH.source);
    expect(leftover).toBeNull();
  });
});

test.describe("Ponto autenticado", () => {
  test.skip(
    !username || !password,
    "E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD não configurados",
  );

  test("navega por Agora, Dia, Mensal e Vínculos", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await openPonto(page);

    const tabs = page.getByRole("navigation", { name: "Seções do ponto" });

    await expect(page.getByRole("button", { name: "Atualizar agora" })).toBeVisible();
    await expect(metric(page, "Na obra agora")).toBeVisible();
    await expect(metric(page, "Sem marcação")).toBeVisible();
    await expect(page.getByLabel("Onde está", { exact: true })).toBeVisible();

    await tabs.getByRole("link", { name: "Dia" }).click();
    await expect(page).toHaveURL(/\/rh\/ponto\/dia/);
    await expect(metric(page, "Presentes")).toBeVisible();
    await expect(metric(page, "Ausentes")).toBeVisible();
    await expect(page.getByPlaceholder("Buscar pessoa, departamento ou obra…")).toBeVisible();

    await tabs.getByRole("link", { name: "Mensal" }).click();
    await expect(page).toHaveURL(/\/rh\/ponto\/mensal/);
    await expect(metric(page, "Homem-dia")).toBeVisible();
    await expect(metric(page, "Custo estimado")).toBeVisible();

    await tabs.getByRole("link", { name: "Vínculos" }).click();
    await expect(page).toHaveURL(/\/rh\/ponto\/vinculos/);
    await expect(metric(page, "Pessoas do RHID × funcionários")).toBeVisible();
    await expect(metric(page, "Cercas do RHID × obras")).toBeVisible();
  });

  test("foto de marcação abre num diálogo, sob demanda", async ({ page }) => {
    await signIn(page);
    await openPonto(page);
    await page.goto("/rh/ponto/dia");

    const photoButtons = page.getByRole("button", { name: /^Ver foto da marcação/ });
    const firstPerson = page.getByRole("row").nth(1);
    if ((await firstPerson.count()) === 0) test.skip(true, "Sem marcações no dia de hoje");
    await firstPerson.click();
    if ((await photoButtons.count()) === 0) test.skip(true, "Marcação selecionada sem foto");

    await photoButtons.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/^Foto da marcação/)).toBeVisible();
    await expect(
      dialog.getByRole("img").or(dialog.getByRole("alert")),
    ).toBeVisible({ timeout: 20_000 });
  });
});
