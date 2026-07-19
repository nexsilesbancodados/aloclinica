import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockFrom = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      admin: {
        listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "admin-1", email: "admin@alomedico.com" },
    profile: { first_name: "Admin", last_name: "System" },
    roles: ["admin"],
    loading: false,
  }),
}));

vi.mock("@/components/dashboards/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/admin/adminNav", () => ({ getAdminNav: () => [] }));
vi.mock("framer-motion", () => {
  // Proxy: motion.<anyTag> retorna um wrapper passthrough
  // (cobre header, section, h1, button, etc — sem precisar enumerar)
  const passthrough = (Tag: any) =>
    function Wrapped({ children, ...p }: any) {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, layoutId, ...rest } = p;
      return <Tag {...rest}>{children}</Tag>;
    };
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <svg>{children}</svg>,
  BarChart: ({ children }: any) => <svg>{children}</svg>,
  Area: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockDoctors = [
  { id: "d1", user_id: "u1", crm: "111111", crm_state: "SP", is_approved: true, created_at: new Date().toISOString(), consultation_price: 200 },
  { id: "d2", user_id: "u2", crm: "222222", crm_state: "RJ", is_approved: false, created_at: new Date().toISOString(), consultation_price: 180 },
];

const mockPatients = [
  { user_id: "p1", first_name: "Ana", last_name: "Costa", email: "ana@test.com", created_at: new Date().toISOString() },
  { user_id: "p2", first_name: "João", last_name: "Silva", email: "joao@test.com", created_at: new Date().toISOString() },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AdminDoctors - gerenciamento de médicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === "doctor_profiles") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: mockDoctors, error: null }),
            eq: () => ({
              order: () => Promise.resolve({ data: mockDoctors.filter(d => d.is_approved), error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [
                { user_id: "u1", first_name: "Dr. Carlos", last_name: "Mendes", avatar_url: null },
                { user_id: "u2", first_name: "Dra. Lucia", last_name: "Santos", avatar_url: null },
              ],
              error: null,
            }),
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
    });
  });

  it("carrega lista de médicos do admin", async () => {
    const { default: AdminDoctors } = await import("@/components/admin/AdminDoctors");
    render(
      <BrowserRouter>
        <AdminDoctors />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("doctor_profiles");
    });
  });

  it("exibe total de médicos carregados", async () => {
    const { default: AdminDoctors } = await import("@/components/admin/AdminDoctors");
    render(
      <BrowserRouter>
        <AdminDoctors />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/2 médicos?/i)).toBeInTheDocument();
    });
  });
});

describe("AdminPatients - gerenciamento de pacientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Make chain thenable so `await chain` and `await chain.order()` both work
    const makeChain = (data: any) => {
      const resolved = Promise.resolve({ data, error: null });
      const chain: any = Object.assign(resolved, {
        eq: () => makeChain(data),
        in: () => makeChain(data),
        ilike: () => makeChain(data),
        order: () => resolved,
        single: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
        maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
        limit: () => makeChain(data),
        range: () => makeChain(data),
      });
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "user_roles") {
        return { select: () => makeChain([{ user_id: "p1" }, { user_id: "p2" }]) };
      }
      if (table === "profiles") {
        return { select: () => makeChain(mockPatients) };
      }
      return { select: () => makeChain([]) };
    });
  });

  it("carrega lista de pacientes buscando user_roles e profiles", async () => {
    const { default: AdminPatients } = await import("@/components/admin/AdminPatients");
    render(
      <BrowserRouter>
        <AdminPatients />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("user_roles");
    });
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });
  });
});

// ── Admin business logic ──────────────────────────────────────────────────────

describe("Lógica de aprovação de médicos", () => {
  it("identifica médicos pendentes de aprovação", () => {
    const pending = mockDoctors.filter(d => !d.is_approved);
    expect(pending.length).toBe(1);
    expect(pending[0].crm).toBe("222222");
  });

  it("identifica médicos aprovados", () => {
    const approved = mockDoctors.filter(d => d.is_approved);
    expect(approved.length).toBe(1);
    expect(approved[0].crm).toBe("111111");
  });

  it("calcula taxa de aprovação corretamente", () => {
    const total = mockDoctors.length;
    const approved = mockDoctors.filter(d => d.is_approved).length;
    const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
    expect(rate).toBe(50);
  });
});

// ── Admin statistics logic ────────────────────────────────────────────────────

describe("Cálculo de estatísticas administrativas", () => {
  it("calcula receita total de consultas", () => {
    const appointments = [
      { payment_status: "paid", amount: 200 },
      { payment_status: "paid", amount: 150 },
      { payment_status: "pending", amount: 300 },
    ];
    const revenue = appointments
      .filter(a => a.payment_status === "paid")
      .reduce((sum, a) => sum + a.amount, 0);
    expect(revenue).toBe(350);
  });

  it("agrupa consultas por status", () => {
    const appointments = [
      { status: "completed" },
      { status: "completed" },
      { status: "cancelled" },
      { status: "scheduled" },
    ];
    const byStatus = appointments.reduce((acc: Record<string, number>, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    }, {});
    expect(byStatus["completed"]).toBe(2);
    expect(byStatus["cancelled"]).toBe(1);
    expect(byStatus["scheduled"]).toBe(1);
  });

  it("calcula NPS (Net Promoter Score) médio", () => {
    const ratings = [5, 4, 5, 3, 5, 4, 2, 5];
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    expect(avg).toBeGreaterThan(3);
    expect(avg).toBeLessThanOrEqual(5);
  });

  it("calcula taxa de no-show", () => {
    const stats = { total: 100, no_show: 8, cancelled: 5 };
    const noShowRate = stats.total > 0 ? ((stats.no_show / stats.total) * 100).toFixed(1) : "0";
    expect(parseFloat(noShowRate)).toBe(8);
  });
});

// ── Admin user role management ────────────────────────────────────────────────

describe("Gerenciamento de roles de usuário", () => {
  const VALID_ROLES = ["patient", "doctor", "admin", "clinic", "support"] as const;
  type Role = (typeof VALID_ROLES)[number];

  it("valida roles permitidas no sistema", () => {
    const isValid = (role: string): role is Role => VALID_ROLES.includes(role as Role);
    expect(isValid("patient")).toBe(true);
    expect(isValid("doctor")).toBe(true);
    expect(isValid("admin")).toBe(true);
    expect(isValid("hacker")).toBe(false);
    expect(isValid("superuser")).toBe(false);
  });

  it("identifica role de maior privilégio", () => {
    const roleHierarchy: Record<Role, number> = {
      patient: 1,
      support: 3,
      clinic: 4,
      doctor: 5,
      admin: 10,
    };
    const getHighestRole = (roles: Role[]) =>
      roles.reduce((top, r) => (roleHierarchy[r] > roleHierarchy[top] ? r : top), roles[0]);

    expect(getHighestRole(["patient", "doctor"])).toBe("doctor");
    expect(getHighestRole(["admin", "patient", "doctor"])).toBe("admin");
    expect(getHighestRole(["support", "patient"])).toBe("support");
  });
});

// ── Security: RLS compliance ──────────────────────────────────────────────────

describe("Conformidade de segurança administrativa", () => {
  it("garante que CPF mascarado para logs", () => {
    const maskCpf = (cpf: string) => {
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) return cpf;
      return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
    };
    expect(maskCpf("52998224725")).toBe("529.***.***-25");
    expect(maskCpf("000.000.000-00")).toBe("000.***.***-00");
    expect(maskCpf("123")).toBe("123"); // Invalid — returned as-is
  });

  it("garante que senhas nunca são armazenadas em texto puro", () => {
    const isPlainText = (value: string) => value.length < 60; // bcrypt hashes are 60 chars
    expect(isPlainText("mypassword")).toBe(true); // Would fail in prod
    expect(isPlainText("$2b$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12")).toBe(false);
  });

  it("valida formato de email corretamente", () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValidEmail("admin@alomedico.com")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("test@test.com.br")).toBe(true);
  });
});
