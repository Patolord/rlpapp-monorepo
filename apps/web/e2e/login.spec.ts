import { expect, test } from "@playwright/test";

test.describe("Login page", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/");

    // CardTitle renders a div, not a heading element, so match by text.
    await expect(
      page.getByText("RLP Engenharia", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Acesse sua conta para continuar"),
    ).toBeVisible();

    await expect(page.getByLabel("Usuário")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
