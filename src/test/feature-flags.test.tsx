import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * O contrato central das feature flags: a AVALIAÇÃO é do servidor. O cliente só
 * lê o booleano. Estes testes travam o comportamento de fallback, que é o que
 * decide se uma falha de rede esconde um recurso novo (correto) ou derruba um
 * recurso existente (inaceitável).
 */

const { mockRpc, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

vi.mock("@/integrations/supabase/untyped", () => ({
  db: { rpc: mockRpc, auth: { onAuthStateChange: mockOnAuthStateChange } },
}));

vi.mock("@/lib/logger", () => ({ warn: vi.fn(), logError: vi.fn() }));

import { FeatureFlagsProvider, useFeatureFlag } from "@/hooks/use-feature-flags";

const wrapper = ({ children }: { children: ReactNode }) => (
  <FeatureFlagsProvider>{children}</FeatureFlagsProvider>
);

describe("useFeatureFlag", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lê o valor avaliado pelo servidor", async () => {
    mockRpc.mockResolvedValue({ data: { nova_agenda: true, beta: false }, error: null });
    const { result } = renderHook(() => useFeatureFlag("nova_agenda"), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("respeita false vindo do servidor", async () => {
    mockRpc.mockResolvedValue({ data: { beta: false }, error: null });
    const { result } = renderHook(() => useFeatureFlag("beta", true), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("usa o fallback quando a flag não existe", async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useFeatureFlag("inexistente", true), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("recurso NOVO fica escondido quando a avaliação falha", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("rede") });
    const { result } = renderHook(() => useFeatureFlag("recurso_novo"), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("kill switch permanece LIGADO quando a avaliação falha", async () => {
    // Uma queda de rede não pode derrubar um recurso que já está em produção.
    mockRpc.mockResolvedValue({ data: null, error: new Error("rede") });
    const { result } = renderHook(() => useFeatureFlag("teleconsulta", true), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("ignora valores não-booleanos em vez de tratá-los como truthy", async () => {
    mockRpc.mockResolvedValue({ data: { estranha: "sim", ok: true }, error: null });
    const { result } = renderHook(() => useFeatureFlag("estranha"), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("reavalia quando a sessão muda", async () => {
    mockRpc.mockResolvedValue({ data: { x: true }, error: null });
    renderHook(() => useFeatureFlag("x"), { wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    const calls = mockOnAuthStateChange.mock.calls as unknown as Array<[(e: string) => void]>;
    calls[0][0]("SIGNED_IN");
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
  });
});
