/**
 * Feature flags — controle simples de features experimentais ou desativadas.
 *
 * Uso:
 *   import { isFeatureEnabled } from "@/lib/featureFlags";
 *   if (isFeatureEnabled("first_tour")) { ... }
 *
 * Resolução (em ordem de prioridade):
 *   1. localStorage `feature:<key>` ("true" / "false") — override pra QA/admin
 *   2. env Vite `VITE_FEATURE_<KEY>` ("true" / "false") — override de build
 *   3. DEFAULT_FLAGS — valor padrão
 *
 * Por que: permite esconder features experimentais do usuário sem deletar o código.
 */

export const FEATURE_FLAGS = {
  /** Mock de pagamentos (apenas dev/QA). */
  mock_payments: false,
  /** Tour interativo da primeira consulta. */
  first_tour: true,
  /** Assinatura ICP-Brasil real via VIDaaS (caso contrário usa hash local). */
  icp_brasil_signature: false,
} as const;

export type FeatureKey = keyof typeof FEATURE_FLAGS;

const LOCAL_PREFIX = "feature:";

export function isFeatureEnabled(key: FeatureKey): boolean {
  // 1. localStorage override
  if (typeof window !== "undefined") {
    try {
      const local = window.localStorage.getItem(`${LOCAL_PREFIX}${key}`);
      if (local === "true") return true;
      if (local === "false") return false;
    } catch { /* private mode etc */ }
  }

  // 2. env override
  const envKey = `VITE_FEATURE_${key.toUpperCase()}` as const;
  const envVal = (import.meta as any).env?.[envKey];
  if (envVal === "true") return true;
  if (envVal === "false") return false;

  // 3. default
  return FEATURE_FLAGS[key];
}

/** Override em runtime (admin / QA). Persiste em localStorage. */
export function setFeatureOverride(key: FeatureKey, enabled: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled === null) {
      window.localStorage.removeItem(`${LOCAL_PREFIX}${key}`);
    } else {
      window.localStorage.setItem(`${LOCAL_PREFIX}${key}`, String(enabled));
    }
  } catch { /* ignore */ }
}

/** Retorna snapshot atual (defaults + overrides) — útil pra UI de admin. */
export function getAllFlags(): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  (Object.keys(FEATURE_FLAGS) as FeatureKey[]).forEach((k) => {
    out[k] = isFeatureEnabled(k);
  });
  return out;
}
