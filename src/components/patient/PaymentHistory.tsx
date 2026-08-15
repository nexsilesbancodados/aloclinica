import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, Clock, XCircle, Shield, Wifi, Sparkles, ArrowRight } from "lucide-react";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPatientNav } from "./patientNav";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import mascotWave from "@/assets/mascot-wave.png";
import type { Json } from "@/integrations/supabase/types";

interface SubscriptionEntry {
  id: string;
  plan_id: string;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  created_at: string;
  plan_name: string;
  plan_price: number;
  plan_description: string;
  plan_interval: string;
  plan_features: Json;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  active: { label: "Ativa", icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: "bg-[hsl(var(--p-success-soft))] text-success border-success/20" },
  cancelled: { label: "Cancelada", icon: <XCircle className="w-3.5 h-3.5" />, className: "bg-[hsl(var(--p-danger-soft))] text-destructive border-destructive/20" },
  expired: { label: "Vencida", icon: <Clock className="w-3.5 h-3.5" />, className: "bg-muted text-muted-foreground border-border" },
};

const PaymentHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<SubscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) fetchPayments(); }, [user]);

  const fetchPayments = async () => {
    const { data: subsData } = await db
      .from("subscriptions")
      .select("id, plan_id, status, started_at, expires_at, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!subsData || subsData.length === 0) { setLoading(false); return; }

    const planIds = [...new Set(subsData.map((s) => s.plan_id))];
    const { data: plans } = await db
      .from("plans")
      .select("id, name, price, description, features, interval")
      .in("id", planIds);
    const planMap = new Map((plans as any[])?.map((p: any) => [p.id, p]) ?? []);

    setSubs(subsData.map((s: any) => ({
      ...s,
      plan_name: (planMap.get(s.plan_id) as any)?.name ?? "—",
      plan_price: (planMap.get(s.plan_id) as any)?.price ?? 0,
      plan_description: (planMap.get(s.plan_id) as any)?.description ?? "",
      plan_interval: (planMap.get(s.plan_id) as any)?.interval ?? "monthly",
      plan_features: (planMap.get(s.plan_id) as any)?.features ?? [],
    })));
    setLoading(false);
  };

  const activeSub = subs.find((s) => s.status === "active");

  const generateReceipt = (s: SubscriptionEntry) => {
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 52, 127);
    doc.rect(0, 0, w, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("AloClínica", 20, 22);
    doc.setFontSize(10);
    doc.text("Recibo de Pagamento", 20, 32);
    doc.setTextColor(40, 40, 40);
    let y = 55;
    const line = (label: string, value: string) => {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(label, 20, y);
      doc.setFont("helvetica", "bold"); doc.text(value, 90, y); y += 10;
    };
    line("Plano:", s.plan_name);
    line("Valor:", `R$ ${Number(s.plan_price).toFixed(2)}`);
    line("Status:", s.status === "active" ? "Ativa" : s.status === "cancelled" ? "Cancelada" : "Vencida");
    line("Data:", format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }));
    line("ID:", s.id.slice(0, 8).toUpperCase());
    doc.save(`recibo-aloclinica-${s.id.slice(0, 8)}.pdf`);
  };

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("payments")} role="patient">
      <div className="w-full mx-auto max-w-2xl pb-24 md:pb-6 space-y-5">

        {/* ═══ ACTIVE PLAN — Gradient Card ═══ */}
        {!loading && activeSub && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#00347F] to-[#1A4BA1] p-6 text-white"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.06] blur-[40px]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="relative z-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
                Plano Ativo
              </p>
              <p className="font-[Manrope] text-[34px] font-extrabold mt-1 tabular-nums">
                R$ {Number(activeSub.plan_price).toFixed(2)}
              </p>
              <p className="text-[13px] text-white/60 mt-1">
                {activeSub.plan_name} · {activeSub.plan_interval === "monthly" ? "Mensal" : activeSub.plan_interval}
              </p>
              {activeSub.expires_at && (
                <p className="text-[12px] text-white/50 mt-0.5">
                  Vencimento: {format(new Date(activeSub.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  className="rounded-full bg-white text-[#00347F] gap-2 font-bold text-sm shadow-[var(--p-shadow-btn)] hover:bg-white/90"
                  onClick={() => navigate("/dashboard/plans")}
                >
                  <CreditCard className="w-4 h-4" /> Gerenciar
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ CARD VISUAL ═══ */}
        {!loading && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--p-primary))]/10 flex items-center justify-center">
                  <CreditCard className="w-3.5 h-3.5 text-[hsl(var(--p-primary))]" />
                </div>
                <h2 className="text-base font-bold text-foreground font-[Manrope]">Meus Cartões</h2>
              </div>
              <button className="text-sm font-semibold text-[hsl(var(--p-primary))]">+ Novo</button>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(240,30%,12%)] to-[hsl(240,25%,20%)] p-5 text-white shadow-[var(--p-shadow-elevated)]">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <Wifi className="w-6 h-6 text-white/50 rotate-90" />
                  <Sparkles className="w-5 h-5 text-white/30" />
                </div>
                <p className="text-lg font-semibold tracking-[0.25em] font-mono">
                  •••• •••• •••• 8821
                </p>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-white/50 uppercase tracking-wider">Titular</p>
                  <p className="text-xs text-white/50">12/28</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PAYMENT HISTORY ═══ */}
        {!loading && subs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[hsl(var(--p-success-soft))] flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              </div>
              <h2 className="text-base font-bold text-foreground font-[Manrope]">Histórico de Pagamentos</h2>
            </div>
            <div className="space-y-2.5">
              {subs.map((s, i) => {
                const cfg = statusConfig[s.status] ?? statusConfig.expired;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border/20 shadow-[var(--p-shadow-card)] hover:shadow-[var(--p-shadow-elevated)] transition-shadow"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.className}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{s.plan_name}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-bold text-foreground tabular-nums font-[Manrope]">R$ {Number(s.plan_price).toFixed(2)}</p>
                      <button
                        className="text-[12px] font-semibold text-[hsl(var(--p-primary))] flex items-center gap-0.5 ml-auto"
                        onClick={() => generateReceipt(s)}
                      >
                        Recibo <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ EMPTY STATE ═══ */}
        {!loading && subs.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-dashed border-border/40 bg-muted/10">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <CreditCard className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="font-bold text-foreground mb-1 font-[Manrope]">Nenhum pagamento</p>
            <p className="text-[13px] text-muted-foreground mb-5">Seus pagamentos aparecerão aqui</p>
            <Button className="rounded-full shadow-[var(--p-shadow-btn)] bg-[#00347F] text-white" onClick={() => navigate("/dashboard/plans")}>
              Ver planos disponíveis
            </Button>
          </div>
        )}

        {/* ═══ SECURITY CARD ═══ */}
        {!loading && subs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl p-5 flex items-center gap-4 bg-[hsl(var(--p-warning-soft))] border border-warning/15"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-4 h-4 text-warning" />
                <p className="text-[14px] font-bold text-foreground">Segurança em primeiro lugar</p>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Todos os pagamentos são protegidos com criptografia de ponta a ponta.
              </p>
            </div>
            <img src={mascotWave} alt="Pingo" className="w-20 h-20 object-contain shrink-0" loading="lazy" />
          </motion.div>
        )}

        {/* ═══ LOADING ═══ */}
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-3xl" />
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PaymentHistory;
