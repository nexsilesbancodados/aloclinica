import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

/**
 * PanelCenter é a landing page do admin (Dashboard.tsx redireciona admins para
 * cá). Nenhum teste renderizava o componente, então um ícone usado sem import
 * passou pelo build — esbuild não faz typecheck — e virou ReferenceError em
 * runtime na primeira tela que todo admin vê. Estes testes montam o componente
 * de verdade justamente para travar essa classe de regressão.
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────
// PanelCenter usa `db` de @/integrations/supabase/untyped, que é só um re-export
// do client — mockar o client cobre os dois.
const mockPresence = [
  {
    user_id: "u1",
    current_page: "/dashboard/admin/users?role=admin",
    last_seen_at: new Date().toISOString(),
    is_online: true,
  },
];
const mockRoles = [
  { user_id: "u1", role: "admin" },
  { user_id: "u2", role: "doctor" },
  { user_id: "u3", role: "clinic" },
];
const mockProfiles = [{ user_id: "u1", first_name: "Ana", last_name: "Costa" }];

const tableData: Record<string, unknown[]> = {
  user_presence: mockPresence,
  user_roles: mockRoles,
  profiles: mockProfiles,
};

// Builder encadeável e "thenable": .select().eq().gte() resolve no mesmo
// resultado, sem precisar saber onde cada consulta termina o encadeamento.
const makeQuery = (table: string) => {
  const result = { data: tableData[table] ?? [], error: null };
  const chain: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") {
          return (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
            Promise.resolve(result).then(onOk, onErr);
        }
        return () => chain;
      },
    },
  );
  return chain;
};

const mockFrom = vi.fn((table: string) => makeQuery(table));
const mockRemoveChannel = vi.fn();
const mockChannel = vi.fn(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: [string]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...(args as [])),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
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
  const passthrough = (Tag: string) =>
    function Wrapped({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, layoutId, ...rest } = p;
      // `Tag` é uma string vinda do Proxy; em JSX uma variável capitalizada é
      // tratada como componente, então precisa ser tipada como ElementType.
      const Component = Tag as unknown as React.ElementType;
      return <Component {...rest}>{children}</Component>;
    };
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

import PanelCenter from "@/components/admin/PanelCenter";

const renderPanelCenter = () =>
  render(
    <BrowserRouter>
      <PanelCenter />
    </BrowserRouter>,
  );

describe("PanelCenter - landing page do admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monta sem erro de referência (todo ícone usado está importado)", async () => {
    // Um ícone não importado explode aqui: `quickActions` é montado no corpo do
    // componente, então o ReferenceError acontece durante o render.
    expect(() => renderPanelCenter()).not.toThrow();

    await waitFor(() => {
      expect(screen.getByTestId("layout")).toBeInTheDocument();
    });
  });

  it("renderiza todas as ações rápidas, incluindo Contratos", async () => {
    renderPanelCenter();

    await waitFor(() => {
      expect(screen.getByText("Ações Rápidas")).toBeInTheDocument();
    });

    for (const label of [
      "Aprovações",
      "Consultas",
      "Financeiro",
      "Relatórios",
      "Leads",
      "Broadcast",
      "Segurança",
      "Contratos",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("carrega presença e agrega os totais por painel", async () => {
    renderPanelCenter();

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("user_presence");
      expect(mockFrom).toHaveBeenCalledWith("user_roles");
    });

    // 3 usuários distintos em user_roles
    await waitFor(() => {
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });
  });

  it("assina realtime de presença e limpa o canal ao desmontar", async () => {
    const { unmount } = renderPanelCenter();

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("panel-center-presence");
    });

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
