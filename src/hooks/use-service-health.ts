/**
 * useServiceHealth — saúde dos serviços para o alerta e a página do admin.
 *
 * Estratégia em 2 camadas (resiliente):
 *  1. Tenta a edge function `service-health` — verificação REAL no servidor
 *     (WhatsApp, e-mail, vídeo, KYC, pagamentos, NFS-e) usando os secrets.
 *  2. Se a função ainda não estiver publicada, cai para uma VERIFICAÇÃO BÁSICA
 *     no navegador dos serviços críticos que dá para checar do cliente
 *     (Banco, Autenticação, Storage e CompreFace/KYC — o que mais costuma cair).
 *
 * Só roda para administradores. Com `poll: true`, revalida periodicamente.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { SERVICES_PENDING_SETUP } from "@/config/service-status";

export type ServiceStatus = "ok" | "down" | "unconfigured";
export type HealthMode = "server" | "browser";

export interface ServiceCheck {
  key: string;
  label: string;
  status: ServiceStatus;
  detail?: string;
  latencyMs?: number;
  critical?: boolean;
}

export interface HealthResult {
  checkedAt: string;
  services: ServiceCheck[];
}

const POLL_MS = 4 * 60 * 1000; // 4 min

// ── Fallback: verificação básica no navegador ──────────────────────────────
async function runBrowserChecks(): Promise<ServiceCheck[]> {
  const out: ServiceCheck[] = [];
  const check = async (
    key: string, label: string, critical: boolean,
    fn: () => Promise<{ status: ServiceStatus; detail: string }>,
  ) => {
    const t0 = performance.now();
    try {
      const r = await fn();
      out.push({ key, label, critical, status: r.status, detail: r.detail, latencyMs: Math.round(performance.now() - t0) });
    } catch (e) {
      out.push({ key, label, critical, status: "down", detail: e instanceof Error ? e.message : "Sem resposta", latencyMs: Math.round(performance.now() - t0) });
    }
  };

  await check("database", "Banco de Dados", true, async () => {
    const { error } = await db.from("specialties").select("id").limit(1);
    return error ? { status: "down", detail: error.message } : { status: "ok", detail: "Respondendo" };
  });
  await check("auth", "Autenticação", true, async () => {
    await db.auth.getSession();
    return { status: "ok", detail: "Ativo" };
  });
  await check("storage", "Armazenamento", true, async () => {
    const { error } = await db.storage.from("avatars").list("", { limit: 1 });
    return error ? { status: "down", detail: error.message } : { status: "ok", detail: "Acessível" };
  });
  await check("kyc", "KYC facial (CompreFace)", true, async () => {
    const url = (import.meta.env.VITE_COMPREFACE_URL as string | undefined) ?? "https://face.aloclinica.com.br";
    await fetch(url, { mode: "no-cors", signal: AbortSignal.timeout(6000) });
    return { status: "ok", detail: "Acessível" };
  });

  return out;
}

export function useServiceHealth(options?: { enabled?: boolean; poll?: boolean }) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const active = isAdmin && options?.enabled !== false;

  const [data, setData] = useState<HealthResult | null>(null);
  const [mode, setMode] = useState<HealthMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await db.functions.invoke("service-health");
      if (fnErr) throw fnErr;
      setData(res as HealthResult);
      setMode("server");
    } catch {
      // Função ainda não publicada → verificação básica no navegador.
      try {
        const services = await runBrowserChecks();
        setData({ checkedAt: new Date().toISOString(), services });
        setMode("browser");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Falha ao verificar serviços");
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!active) return undefined;
    refresh();
    if (!options?.poll) return undefined;
    timer.current = setInterval(refresh, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active, options?.poll, refresh]);

  // Serviços marcados como "pendentes de configuração" (pré-lançamento) não
  // contam como falha — aparecem em âmbar e NÃO disparam o alerta vermelho.
  const services = (data?.services ?? []).map((s) =>
    SERVICES_PENDING_SETUP.includes(s.key) && s.status === "down"
      ? { ...s, status: "unconfigured" as ServiceStatus, detail: "Pendente de configuração (pré-lançamento)" }
      : s,
  );
  const down = services.filter((s) => s.status === "down");
  const criticalDown = down.filter((s) => s.critical);
  const summary = {
    total: services.length,
    ok: services.filter((s) => s.status === "ok").length,
    down: down.length,
    criticalDown: criticalDown.length,
    unconfigured: services.filter((s) => s.status === "unconfigured").length,
  };

  return {
    data,
    services,
    downServices: down,
    summary,
    mode,
    loading,
    error,
    lastRun: data?.checkedAt ? new Date(data.checkedAt) : null,
    refresh,
    isAdmin,
  };
}

export default useServiceHealth;
