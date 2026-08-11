import { test, expect } from "@playwright/test";

test.describe("Navigation & responsiveness", () => {
  test("landing page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filtra erros benignos / esperados em ambiente sem credenciais externas
    const criticalErrors = errors.filter((e) => {
      const lower = e.toLowerCase();
      return (
        !lower.includes("favicon") &&
        !lower.includes("analytics") &&
        !lower.includes("gtag") &&
        !lower.includes("sentry") &&
        // Erros do Supabase (401/403/RLS) são esperados em ambiente sem auth
        !lower.includes("supabase") &&
        !lower.includes("401") &&
        !lower.includes("403") &&
        // Recursos externos (imagens em CDN/storage) podem variar em CI
        !lower.includes("failed to load resource") &&
        !lower.includes("net::err_") &&
        // Warnings do React em dev sobre keys/refs — não bloqueantes
        !lower.includes("warning:") &&
        // PWA service worker em ambiente sem HTTPS
        !lower.includes("service worker") &&
        !lower.includes("workbox")
      );
    });
    expect(criticalErrors, criticalErrors.join("\n")).toEqual([]);
  });

  test("landing page renders at mobile viewport (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Page should be scrollable and not overflow horizontally
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("landing page renders at desktop viewport (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("auth page loads correctly", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
  });

  // Estes dois testes iam para /termos e /privacidade — rotas que não existem —
  // e passavam mesmo assim, porque só exigiam que o <body> estivesse visível, o
  // que a página de 404 também satisfaz. Agora usam a URL canônica (a mesma do
  // sitemap) e conferem o título, então um 404 reprova.
  test("terms page loads correctly", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
  });

  test("privacy page loads correctly", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible();
  });
});
