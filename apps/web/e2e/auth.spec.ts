import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// Credenciais do usuário de teste do Clerk (instância dev), definidas no .env.local.
const username = process.env.E2E_CLERK_USER_USERNAME;
const password = process.env.E2E_CLERK_USER_PASSWORD;

test.describe("Authenticated login", () => {
  test.skip(
    !username || !password,
    "E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD não configurados",
  );

  test("signs in through the login form and reaches /app", async ({
    page,
  }) => {
    // Injeta o Testing Token para o Clerk não bloquear o login como bot.
    await setupClerkTestingToken({ page });

    await page.goto("/");

    // A página é renderizada no servidor; espera o Clerk carregar no cliente
    // (garante hidratação) antes de submeter, senão o form faz submit nativo.
    await page.waitForFunction(
      () =>
        (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    );

    await page.getByLabel("Usuário").fill(username!);
    await page.getByLabel("Senha").fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("**/app");
    await expect(
      page.getByText("Acesse sua conta para continuar"),
    ).not.toBeVisible();
  });
});
