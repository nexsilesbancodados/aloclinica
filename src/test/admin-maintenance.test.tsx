import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

const { mockInvoke, mockRefresh } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/integrations/supabase/untyped", () => ({
  db: { functions: { invoke: mockInvoke } },
}));

vi.mock("@/hooks/use-service-health", () => ({
  useServiceHealth: () => ({
    loading: false,
    mode: "server",
    lastRun: new Date("2026-08-10T12:00:00.000Z"),
    services: [{ key: "database", label: "Database", status: "ok", detail: "Conectado", latencyMs: 18 }],
    summary: { ok: 1, down: 0, unconfigured: 0 },
    refresh: mockRefresh,
  }),
}));

vi.mock("@/components/dashboards/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}));

vi.mock("@/components/admin/AdminPageHeader", () => ({
  AdminPageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1><p>{description}</p>{actions}</header>
  ),
}));

vi.mock("@/components/admin/AdminStateBlocks", () => ({
  AdminEmpty: ({ title, description }: { title: string; description: string }) => <div>{title} {description}</div>,
  AdminLoading: () => <div>Carregando</div>,
}));

vi.mock("@/components/admin/adminNav", () => ({
  getAdminNav: () => [],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("AdminMaintenanceCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((name: string, options?: { body?: { action?: string } }) => name === "admin-secret-manager" && options?.body?.action === "status"
      ? Promise.resolve({
          data: {
            secrets: [
              { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Role", group: "Base", required: true, editable: false, description: "Acesso protegido.", configured: true },
              { key: "SUPABASE_ANON_KEY", label: "Supabase Anon", group: "Base", required: true, editable: false, description: "Chave pública.", configured: true },
              { key: "INTERNAL_FUNCTION_SECRET", label: "Internal Function Secret", group: "Base", required: true, editable: false, description: "Segredo interno.", configured: true },
              { key: "PROJECT_SECRETS_MANAGEMENT_TOKEN", label: "Project Secrets Management Token", group: "Administração e jobs", required: false, editable: false, description: "Token de controle.", configured: true },
              { key: "ADMIN_BOOTSTRAP_SECRET", label: "Admin Bootstrap Secret", group: "Administração e jobs", required: false, description: "Bootstrap.", configured: false },
              { key: "BREVO_API_KEY", label: "Brevo", group: "Comunicação", required: true, editable: true, description: "E-mail.", configured: true },
              { key: "RESEND_API_KEY", label: "Resend (B2B)", group: "Comunicação", required: false, description: "Leads.", configured: false },
              { key: "VIDAAS_CLIENT_ID", label: "VIDAAS Client ID", group: "Assinatura digital", required: false, description: "Assinatura.", configured: false },
            ],
            flags: [
              { key: "ALLOW_INSECURE_EVOLUTION_HTTP", label: "Evolution HTTP inseguro", severity: "danger", description: "TLS.", enabled: false },
            ],
          },
          error: null,
        })
      : Promise.resolve({ data: { updated: 1 }, error: null }));
  });

  it("mostra diagnóstico, todos os grupos de integração e não expõe valores", async () => {
    const { default: AdminMaintenanceCenter } = await import("@/components/admin/AdminMaintenanceCenter");

    render(<BrowserRouter><AdminMaintenanceCenter /></BrowserRouter>);

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("admin-secret-manager", { body: { action: "status" } }));
    expect(screen.getByRole("heading", { name: "Centro de manutenção" })).toBeInTheDocument();
    expect(screen.getByText("Saúde dos serviços")).toBeInTheDocument();
    expect(screen.getAllByText("Administração e jobs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Assinatura digital").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resend (B2B)").length).toBeGreaterThan(0);
    expect(screen.getByText("Flags de risco do runtime")).toBeInTheDocument();
    expect(screen.getByText("Desativada")).toBeInTheDocument();
    expect(screen.queryByText("valor-super-secreto")).not.toBeInTheDocument();
  });

  it("envia somente os campos preenchidos e limpa o valor após salvar", async () => {
    const { default: AdminMaintenanceCenter } = await import("@/components/admin/AdminMaintenanceCenter");
    render(<BrowserRouter><AdminMaintenanceCenter /></BrowserRouter>);

    const brevoInput = await waitFor(() => {
      const input = document.getElementById("secret-input-BREVO_API_KEY");
      if (!input) throw new Error("Brevo input not rendered yet");
      return input;
    });
    fireEvent.change(brevoInput, { target: { value: "valor-super-secreto" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar chaves" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("admin-secret-manager", {
      body: { updates: [{ key: "BREVO_API_KEY", value: "valor-super-secreto" }] },
    }));
    await waitFor(() => expect(brevoInput).toHaveValue(""));
  });

  it("mantém chaves gerenciadas fora do painel bloqueadas", async () => {
    const { default: AdminMaintenanceCenter } = await import("@/components/admin/AdminMaintenanceCenter");
    render(<BrowserRouter><AdminMaintenanceCenter /></BrowserRouter>);

    await waitFor(() => expect(document.getElementById("secret-input-SUPABASE_SERVICE_ROLE_KEY")).toBeDisabled());
    expect(document.getElementById("secret-input-SUPABASE_ANON_KEY")).toBeDisabled();
    expect(document.getElementById("secret-input-INTERNAL_FUNCTION_SECRET")).toBeDisabled();
    expect(document.getElementById("secret-input-BREVO_API_KEY")).not.toBeDisabled();
  });
});
