import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { isFeatureEnabled } from "@/lib/featureFlags";

/**
 * useIcpAvailable — verifica se a assinatura ICP-Brasil (VIDaaS) está
 * configurada e disponível no ambiente atual.
 *
 * Combina:
 *   1. Feature flag `icp_brasil_signature` (kill switch global)
 *   2. Health-check da edge function `vidaas-sign` (action=status):
 *      retorna se `VIDAAS_CLIENT_ID` e `VIDAAS_CLIENT_SECRET` estão setados.
 *
 * Cache de 5 min por sessão evita chamar a edge function a cada navegação.
 *
 * Estados:
 *   - "loading": ainda checando
 *   - "ready": ICP-Brasil disponível, pode oferecer ao médico
 *   - "fallback": flag/secret indisponível, usa assinatura simplificada
 */

type IcpStatus = "loading" | "ready" | "fallback";

const CACHE_KEY = "alo:icp-status";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedStatus = { status: "ready" | "fallback"; cachedAt: number };

function readCache(): CachedStatus | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStatus;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(status: "ready" | "fallback") {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ status, cachedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function useIcpAvailable(): { status: IcpStatus; isReady: boolean } {
  const [status, setStatus] = useState<IcpStatus>("loading");

  useEffect(() => {
    if (!isFeatureEnabled("icp_brasil_signature")) {
      setStatus("fallback");
      return;
    }
    const cached = readCache();
    if (cached) {
      setStatus(cached.status);
      return;
    }
    let cancelled = false;
    db.functions
      .invoke("vidaas-sign", { body: { action: "status" } })
      .then(({ data }) => {
        if (cancelled) return;
        const next: "ready" | "fallback" = data?.configured ? "ready" : "fallback";
        writeCache(next);
        setStatus(next);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("fallback");
      });
    return () => { cancelled = true; };
  }, []);

  return { status, isReady: status === "ready" };
}
