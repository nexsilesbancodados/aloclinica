import { AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import { useIcpAvailable } from "@/hooks/useIcpAvailable";

/**
 * Aviso dinâmico sobre o tipo de assinatura digital ativo no momento.
 *
 * - "loading": ainda checando vidaas-sign status
 * - "ready": ICP-Brasil real via VIDaaS — verde, sem warning
 * - "fallback": hash SHA-256 local — amber, explica o que falta
 */
const PrescriptionSignatureNotice = () => {
  const { status } = useIcpAvailable();

  if (status === "loading") {
    return (
      <div className="mb-4 rounded-2xl border border-border/40 bg-muted/30 p-3 text-xs flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Verificando configuração de assinatura digital…</span>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-300/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">Assinatura ICP-Brasil ativa</p>
            <p className="text-emerald-800/80 dark:text-emerald-200/80 leading-relaxed mt-0.5">
              As receitas serão assinadas via VIDaaS com o seu e-CPF (certificado ICP-Brasil). Válido inclusive
              para receitas controladas (CFM 2.314/2022).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-900 dark:text-amber-100">Assinatura simplificada ativa</p>
          <p className="text-amber-800/80 dark:text-amber-200/80 leading-relaxed mt-0.5">
            As receitas são assinadas com hash SHA-256 + carimbo digital (válido para uso comum).
            Para receitas controladas que exigem ICP-Brasil, peça ao admin para configurar os secrets
            <code className="ml-1 mr-1 px-1 rounded bg-amber-100/60 dark:bg-amber-900/40 font-mono">VIDAAS_CLIENT_ID</code>e
            <code className="ml-1 px-1 rounded bg-amber-100/60 dark:bg-amber-900/40 font-mono">VIDAAS_CLIENT_SECRET</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionSignatureNotice;
