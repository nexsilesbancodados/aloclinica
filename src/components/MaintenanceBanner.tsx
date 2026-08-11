/**
 * MaintenanceBanner — banner global mostrado quando admin ativou modo manutenção.
 *
 * Lê `app_settings.maintenance_mode` via RPC pública. Se enabled=true:
 *   - Mostra banner amarelo no topo
 *   - Mensagem custom + ETA (se setado)
 *   - block_users=true: usuários comuns ficam bloqueados em um overlay
 *   - administradores sempre mantêm acesso para desligar a manutenção
 */
import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type MaintenanceConfig = {
  enabled?: boolean;
  message?: string;
  expected_back_at?: string | null;
  allow_admin?: boolean;
  block_users?: boolean;
};

export function MaintenanceBanner() {
  const { roles } = useAuth();
  const [cfg, setCfg] = useState<MaintenanceConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchCfg = async () => {
      try {
        const { data, error } = await (db as any).rpc("get_maintenance_status");
        if (!error && !cancelled) setCfg(data as MaintenanceConfig);
      } catch {}
    };
    fetchCfg();
    // Re-checa a cada 60s pra detectar mudanças
    const id = setInterval(fetchCfg, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!cfg?.enabled) return null;

  const isAdmin = roles?.includes("admin");
  const blocksUsers = Boolean(cfg.enabled && !isAdmin && cfg.block_users === true);
  const eta = cfg.expected_back_at ? new Date(cfg.expected_back_at) : null;
  const etaText = eta ? format(eta, "dd/MM 'às' HH:mm", { locale: ptBR }) : null;

  if (blocksUsers) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 px-6 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-label="Plataforma em manutenção">
        <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-card p-7 text-center shadow-2xl">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground">Plataforma em manutenção</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {cfg.message || "Estamos realizando uma atualização importante. O acesso será liberado assim que o serviço estiver seguro e estável."}
          </p>
          {etaText && <p className="mt-3 text-xs font-semibold text-amber-700">Previsão de retorno: {etaText}</p>}
          <p className="mt-5 text-xs text-muted-foreground">Tente novamente em alguns minutos.</p>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 shadow-md"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <div className="flex-1">
          <strong>Modo manutenção:</strong>{" "}
          {cfg.message || "Estamos fazendo melhorias na plataforma. Algumas funções podem estar indisponíveis."}
          {etaText && (
            <>
              {" — "}previsão de retorno: <strong>{etaText}</strong>
            </>
          )}
          {isAdmin && (
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-amber-700 text-amber-50 font-bold">
              VOCÊ É ADMIN — pode usar normalmente
            </span>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-amber-600 rounded"
          aria-label="Dispensar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default MaintenanceBanner;
