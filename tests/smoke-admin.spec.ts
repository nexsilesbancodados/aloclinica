import { test, expect } from "@playwright/test";

/**
 * Smoke tests pra rotas admin (CI sem credenciais).
 *
 * Sem login real, todas as rotas admin DEVEM redirecionar pra /auth
 * (ou similar). Se algum dia uma rota admin renderizar pra anon, é
 * uma falha de segurança gritante.
 *
 * Em ambientes com seed de admin, vale expandir esses testes pra
 * abrir as páginas e validar elementos críticos. Por enquanto:
 * o foco é detectar regressão do guard.
 */

const ADMIN_ROUTES = [
  "/dashboard/admin/panel-center",
  "/dashboard/admin/users",
  "/dashboard/admin/patients",
  "/dashboard/admin/doctors",
  "/dashboard/admin/clinics",
  "/dashboard/admin/appointments",
  "/dashboard/admin/approvals",
  "/dashboard/admin/kyc-review",
  "/dashboard/admin/billing",
  "/dashboard/admin/financial",
  "/dashboard/admin/specialties",
  "/dashboard/admin/coupons",
  "/dashboard/admin/pingo-card",
  "/dashboard/admin/invite-codes",
  "/dashboard/admin/site-editor",
  "/dashboard/admin/theme",
  "/dashboard/admin/media",
  "/dashboard/admin/logs",
  "/dashboard/admin/platform-settings",
  "/dashboard/admin/notification-templates",
  "/dashboard/admin/broadcast",
  "/dashboard/admin/security",
  "/dashboard/admin/lgpd-exports",
  "/dashboard/admin/sla-medicos",
  "/dashboard/admin/doctor-applications",
];

test.describe("Smoke — Admin routes guard (anon)", () => {
  test.describe.configure({ mode: "parallel" });

  for (const route of ADMIN_ROUTES) {
    test(`${route} sem login não vaza UI admin`, async ({ page }) => {
      const resp = await page.goto(route);
      // Pode redirecionar (auth) ou retornar página 200 com auth screen — qualquer 5xx é bug
      expect(resp?.status() ?? 0).toBeLessThan(500);
      await page.waitForLoadState("domcontentloaded");

      // Sempre tem que parar fora da área admin OU mostrar tela de login.
      // Heurísticas: ou redirecionou pra /auth, ou body não contém termos
      // sensíveis de admin sem auth (PII, configurações, etc.).
      const url = page.url();
      const onAuthPage = /\/(auth|login|paciente|medico)/i.test(url);
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      const leakedAdminUI =
        bodyText.includes("usuários cadastrados") ||
        bodyText.includes("aprovações pendentes") ||
        bodyText.includes("kyc rejeitado") ||
        bodyText.includes("estornar");

      // OK: redirecionou OU mostrou auth gate
      if (onAuthPage) {
        expect(leakedAdminUI, `${route} mostrou conteúdo admin sem login`).toBe(false);
      } else {
        // Não redirecionou — tem que ter algum gate inline (loading, login form, etc.)
        // Falha se mostrar texto admin sensível
        expect(leakedAdminUI, `${route} vazou UI admin sem auth`).toBe(false);
      }
    });
  }
});

test.describe("Smoke — Admin routes status (não-5xx)", () => {
  test("rota admin inexistente retorna 200 SPA (não 5xx)", async ({ page }) => {
    const resp = await page.goto("/dashboard/admin/rota-que-nao-existe-xyz");
    // SPA sempre devolve 200 com index.html
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });
});
