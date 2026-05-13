import { test, expect } from "@playwright/test";

/**
 * Smoke tests pra fluxo crítico paciente: descoberta → agendamento → checkout.
 *
 * Não dependem de auth real (CI roda sem credenciais Supabase). Validam:
 *  - páginas públicas carregam sem erros críticos
 *  - rotas redirecionam corretamente
 *  - elementos UI-críticos estão presentes
 *
 * Se algum desses quebra, é regressão de UX visível pro usuário.
 */
test.describe("Smoke — Fluxo Paciente (público)", () => {
  test("home → CTA agendar consulta", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // O hero deve ter pelo menos um CTA acionável
    const ctas = page.getByRole("link", { name: /agendar|consultar|sou paciente/i });
    expect(await ctas.count()).toBeGreaterThan(0);
  });

  test("/teleconsulta carrega", async ({ page }) => {
    await page.goto("/teleconsulta");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/pingo-card mostra planos", async ({ page }) => {
    await page.goto("/pingo-card");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
    // Deve mencionar preço ou plano em algum lugar (heurística leve)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).toMatch(/plano|mensal|anual|r\$/i);
  });

  test("/especialidades lista especialidades", async ({ page }) => {
    await page.goto("/especialidades");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/faq lista perguntas", async ({ page }) => {
    await page.goto("/faq");
    await page.waitForLoadState("domcontentloaded");
    const bodyText = await page.locator("body").innerText();
    // FAQ deve ter pelo menos uma pergunta visível
    expect(bodyText.length).toBeGreaterThan(200);
  });

  test("/dashboard sem login → redireciona pra /auth", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForURL(/\/(auth|login|paciente|medico)/i, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(auth|login|paciente|medico)/i);
  });
});

test.describe("Smoke — Páginas legais (LGPD/CFM)", () => {
  test("/termos, /privacidade, /lgpd, /termo-telemedicina carregam", async ({ page }) => {
    for (const path of ["/termos", "/privacidade", "/lgpd", "/termo-telemedicina"]) {
      const resp = await page.goto(path);
      // Não pode ser 404
      expect([200, 301, 302]).toContain(resp?.status() ?? 0);
      await page.waitForLoadState("domcontentloaded");
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length, `${path} parece estar vazia`).toBeGreaterThan(300);
    }
  });
});

test.describe("Smoke — Sitemap e SEO", () => {
  test("/sitemap.xml é XML válido", async ({ request }) => {
    const resp = await request.get("/sitemap.xml");
    // Se sitemap não existir como arquivo estático, função edge pode não estar
    // disponível em preview local — toleramos 404 mas 5xx é regressão.
    if (resp.status() === 404) test.skip();
    expect(resp.status()).toBeLessThan(500);
    const body = await resp.text();
    expect(body).toMatch(/<urlset|<sitemapindex/);
  });

  test("home page tem meta tags essenciais", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
  });
});
