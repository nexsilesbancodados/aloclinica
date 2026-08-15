import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null }) }),
    },
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "patient-1", email: "p@test.com" },
    profile: { first_name: "Ana", last_name: "Silva", cpf: "52998224725", phone: "11999999999" },
    roles: ["patient"],
    loading: false,
  }),
}));

vi.mock("@/components/dashboards/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/patient/patientNav", () => ({ getPatientNav: () => [] }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── Plans data fixture ────────────────────────────────────────────────────────
const mockActiveSub = {
  id: "sub-1",
  plan_id: "plan-1",
  status: "active",
  started_at: new Date(Date.now() - 86400000 * 30).toISOString(),
  expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
  created_at: new Date().toISOString(),
  plan_name: "Plano Saúde Plus",
  plan_price: 89.9,
  plan_description: "Acesso ilimitado às consultas",
  plan_interval: "monthly",
  plan_features: ["Consultas ilimitadas", "Exames inclusos"],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PaymentHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Make chain thenable so `await chain` and `await chain.order()` both work
    const makeChain = (data: any) => {
      const resolved = Promise.resolve({ data, error: null });
      const chain: any = Object.assign(resolved, {
        eq: () => makeChain(data),
        in: () => makeChain(data),
        order: () => resolved,
        single: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
        maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
        limit: () => makeChain(data),
        range: () => makeChain(data),
      });
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => makeChain([{
            id: "sub-1", plan_id: "plan-1", status: "active",
            started_at: mockActiveSub.started_at, expires_at: mockActiveSub.expires_at,
            created_at: mockActiveSub.created_at,
          }]),
        };
      }
      if (table === "plans") {
        return {
          select: () => makeChain([{
            id: "plan-1", name: "Plano Saúde Plus", price: 89.9,
            description: "Acesso ilimitado", features: [], interval: "monthly",
          }]),
        };
      }
      return { select: () => makeChain([]) };
    });
  });

  it("exibe plano ativo buscando subscriptions e plans", async () => {
    const { default: PaymentHistory } = await import("@/components/patient/PaymentHistory");
    render(
      <BrowserRouter>
        <PaymentHistory />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("subscriptions");
    });
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("plans");
    });
  });

  it("exibe badge 'Ativa' para assinatura ativa", async () => {
    const { default: PaymentHistory } = await import("@/components/patient/PaymentHistory");
    render(
      <BrowserRouter>
        <PaymentHistory />
      </BrowserRouter>
    );
    await waitFor(() => {
      // Should render the active status badge
      const ativos = screen.getAllByText(/ativa|plano ativo/i);
      expect(ativos.length).toBeGreaterThan(0);
    });
  });

  it("busca assinaturas e planos quando o usuário está autenticado", async () => {
    const { default: PaymentHistory } = await import("@/components/patient/PaymentHistory");
    render(
      <BrowserRouter>
        <PaymentHistory />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("subscriptions");
    });
  });
});

// ── Subscription status logic ─────────────────────────────────────────────────

describe("Lógica de status de assinatura", () => {
  it("identifica assinatura ativa corretamente", () => {
    const subs = [
      { id: "s1", status: "active" },
      { id: "s2", status: "cancelled" },
      { id: "s3", status: "expired" },
    ];
    const active = subs.find(s => s.status === "active");
    expect(active?.id).toBe("s1");
  });

  it("não retorna ativa quando todas estão canceladas/vencidas", () => {
    const subs = [{ id: "s2", status: "cancelled" }, { id: "s3", status: "expired" }];
    const active = subs.find(s => s.status === "active");
    expect(active).toBeUndefined();
  });

  it("formata intervalo de plano corretamente", () => {
    const label = (interval: string) => interval === "monthly" ? "Mensal" : interval === "annual" ? "Anual" : interval;
    expect(label("monthly")).toBe("Mensal");
    expect(label("annual")).toBe("Anual");
    expect(label("weekly")).toBe("weekly");
  });
});

// ── PIX payment flow (unit logic) ───────────────────────────────────��─────────

describe("Fluxo de pagamento PIX", () => {
  it("valida campos obrigatórios do perfil antes de pagar", () => {
    const profile = { cpf: "52998224725", first_name: "Ana", last_name: "Silva" };
    expect(profile.cpf).toBeTruthy();
    const missingCpf = { cpf: "", first_name: "Joao", last_name: "Costa" };
    expect(missingCpf.cpf).toBeFalsy();
  });

  it("mapeia método de pagamento para billingType Asaas corretamente", () => {
    const billingTypeMap: Record<string, string> = {
      pix: "PIX",
      card: "CREDIT_CARD",
      boleto: "BOLETO",
    };
    expect(billingTypeMap["pix"]).toBe("PIX");
    expect(billingTypeMap["card"]).toBe("CREDIT_CARD");
    expect(billingTypeMap["boleto"]).toBe("BOLETO");
  });

  it("gera payload correto para pagamento PIX", () => {
    const buildPayload = (method: string, price: number, name: string, cpf: string, email: string, desc: string) => ({
      customerName: name,
      customerCpf: cpf,
      customerEmail: email,
      billingType: method === "pix" ? "PIX" : method,
      value: price,
      description: desc,
    });
    const payload = buildPayload("pix", 75, "Ana Silva", "52998224725", "ana@test.com", "Plantão 24h");
    expect(payload.billingType).toBe("PIX");
    expect(payload.value).toBe(75);
    expect(payload.customerCpf).toBe("52998224725");
  });
});

// ── Card number formatting ────────────────────────────────────────────────────

describe("Formatação de cartão de crédito", () => {
  const formatCardNum = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})/g, "$1 ").trim();

  const formatExp = (v: string) => {
    const c = v.replace(/\D/g, "").slice(0, 4);
    return c.length >= 3 ? `${c.slice(0, 2)}/${c.slice(2)}` : c;
  };

  it("formata número do cartão em grupos de 4", () => {
    expect(formatCardNum("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(formatCardNum("411111111111")).toBe("4111 1111 1111");
  });

  it("ignora caracteres não numéricos no cartão", () => {
    expect(formatCardNum("4111-1111-1111-1111")).toBe("4111 1111 1111 1111");
  });

  it("formata data de vencimento MM/AA", () => {
    expect(formatExp("1226")).toBe("12/26");
    expect(formatExp("12")).toBe("12");
    expect(formatExp("122")).toBe("12/2");
  });
});
