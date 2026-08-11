import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { db } from "@/integrations/supabase/untyped";
import { warn } from "@/lib/logger";

/**
 * Feature flags avaliadas NO SERVIDOR.
 *
 * O cliente nunca decide se uma flag está ativa: chama `get_feature_flags()`,
 * que aplica a precedência usuário > papel > global e devolve só o booleano
 * final. Assim as regras (que incluem user_ids) não vazam para o navegador.
 *
 * Uso:
 *   const novaAgenda = useFeatureFlag("nova_agenda");            // default false
 *   const teleconsulta = useFeatureFlag("teleconsulta", true);   // kill switch
 *
 * O segundo argumento é o valor usado enquanto carrega e se a avaliação falhar.
 * Para recurso NOVO use false (não mostra algo pela metade). Para kill switch de
 * recurso existente use true (uma falha de rede não derruba a plataforma).
 */

type FlagMap = Record<string, boolean>;

interface FeatureFlagsContextValue {
  flags: FlagMap;
  loading: boolean;
  /** Recarrega a avaliação (após login/logout ou mudança no painel admin). */
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: {},
  loading: true,
  refresh: async () => {},
});

export const FeatureFlagsProvider = ({ children }: { children: ReactNode }) => {
  const [flags, setFlags] = useState<FlagMap>({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await db.rpc("get_feature_flags");
      if (error) throw error;
      if (!mounted.current) return;
      // A função devolve jsonb; qualquer valor não-booleano é descartado em vez
      // de virar truthy por acidente.
      const next: FlagMap = {};
      for (const [key, value] of Object.entries((data ?? {}) as Record<string, unknown>)) {
        if (typeof value === "boolean") next[key] = value;
      }
      setFlags(next);
    } catch (e) {
      // Falha de rede/RPC não pode derrubar a UI: cada chamador cai no próprio
      // fallback (o 2º argumento de useFeatureFlag).
      warn("feature flags: falha ao avaliar", e);
      if (mounted.current) setFlags({});
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();

    // Reavalia quando a sessão muda: as regras dependem do usuário e dos papéis.
    const { data: { subscription } } = db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ flags, loading, refresh: load }),
    [flags, loading, load],
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
};

/** Lê uma flag. `fallback` vale enquanto carrega e quando a avaliação falha. */
export const useFeatureFlag = (key: string, fallback = false): boolean => {
  const { flags, loading } = useContext(FeatureFlagsContext);
  if (loading) return fallback;
  return flags[key] ?? fallback;
};

/** Acesso ao mapa inteiro — para telas administrativas e depuração. */
export const useFeatureFlags = () => useContext(FeatureFlagsContext);
