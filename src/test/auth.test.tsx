import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  listener: null as ((event: string, session: any) => void) | null,
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: authMocks.onAuthStateChange.mockImplementation((callback) => {
        authMocks.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: authMocks.getSession.mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => table === "profiles"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) }
      : { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }),
  },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const TestConsumer = () => {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? "logged-in" : "guest"}</span>
    </div>
  );
};

describe("AuthContext", () => {
  it("provides default guest state", async () => {
    await act(async () => {
      render(
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </BrowserRouter>
      );
    });
    // Initially loading, then resolves to guest
    expect(screen.getByTestId("user")).toHaveTextContent("guest");
  });

  it("mantém o dashboard montado durante renovação do token", async () => {
    const session = { user: { id: "user-1", email: "user@example.com" } };
    authMocks.getSession.mockResolvedValueOnce({ data: { session } });

    await act(async () => {
      render(
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(authMocks.listener).toBeTypeOf("function");

    await act(async () => {
      authMocks.listener?.("TOKEN_REFRESHED", session);
    });

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("user")).toHaveTextContent("logged-in");
  });
});
