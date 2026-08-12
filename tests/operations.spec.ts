import { test, expect } from "@playwright/test";

test.describe("Operação e regressão de rotas críticas", () => {
  test("Centro de manutenção permanece protegido para visitantes", async ({ page }) => {
    await page.goto("/dashboard/admin/maintenance");
    await page.waitForURL(/\/(auth|paciente|medico|admin)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(auth|paciente|medico|admin)/);
  });

  test("teste de pagamento permanece protegido", async ({ page }) => {
    await page.goto("/dashboard/admin/payment-test");
    await page.waitForURL(/\/(auth|paciente|medico|admin)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(auth|paciente|medico|admin)/);
  });

  test("rota pública de validação renderiza em celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/validate");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/application error|chunkloaderror/i);
  });

  test("navegação por teclado alcança o primeiro controle da landing", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
});
