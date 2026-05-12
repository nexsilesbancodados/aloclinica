import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getDoctorNav } from "./doctorNav";
 import { TrendingUp, Wallet, ArrowUpRight, Clock, CheckCircle2, XCircle, Building2, AlertCircle, ArrowLeft, MoreHorizontal, Sparkles, History } from "lucide-react";
 import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import { cn } from "@/lib/utils";
 import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
 import { toast } from "sonner";
 import { motion, AnimatePresence } from "framer-motion";

const PLATFORM_PERCENT = 50;
const DEFAULT_DOCTOR_PERCENT = 50;
const MIN_WITHDRAWAL = 50;

const DoctorEarnings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, pending: 0, thisMonth: 0, totalAppts: 0, available: 0 });
  const [monthlyData, setMonthlyData] = useState<{ month: string; consultas: number; valor: number }[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixKey, setPixKey] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clinicInfo, setClinicInfo] = useState<{ name: string; percent: number } | null>(null);

  useEffect(() => { if (user) fetchEarnings(); }, [user]);

  const fetchEarnings = async () => {
    const { data: docProfile } = await db.from("doctor_profiles").select("id, consultation_price").eq("user_id", user!.id).single();
    if (!docProfile) { setLoading(false); return; }

    // Check clinic affiliation for commission percent (issue #16)
    const { data: affiliation } = await db
      .from("clinic_affiliations")
      .select("commission_percent, clinic_id, clinic_profiles(name)")
      .eq("doctor_id", docProfile.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const doctorPercent = affiliation ? Number(affiliation.commission_percent) : DEFAULT_DOCTOR_PERCENT;
    if (affiliation) {
      setClinicInfo({
        name: (affiliation as { clinic_profiles?: { name?: string } | null }).clinic_profiles?.name ?? "Clínica",
        percent: doctorPercent,
      });
    }

    const [confirmedRes, pendingRes, withdrawRes, walletRes] = await Promise.all([
      // Only count appointments with confirmed payment (issue #5)
      db
        .from("appointments")
        .select("id, scheduled_at, status, payment_status, price_at_booking")
        .eq("doctor_id", docProfile.id)
        .eq("status", "completed")
        .in("payment_status", ["approved", "confirmed", "received"])
        .order("scheduled_at", { ascending: false }),
      db
        .from("appointments")
        .select("id, scheduled_at, price_at_booking")
        .eq("doctor_id", docProfile.id)
        .eq("status", "completed")
        .eq("payment_status", "pending")
        .order("scheduled_at", { ascending: false }),
      db
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const confirmedAppts = confirmedRes.data ?? [];
    const pendingAppts = pendingRes.data ?? [];
    setWithdrawals(withdrawRes.data ?? []);

    const defaultPrice = Number(docProfile.consultation_price) || 89;

    // Use price_at_booking if available, otherwise fallback (issue #13)
    const getPrice = (appt: { price_at_booking?: number | null }) => Number(appt.price_at_booking) || defaultPrice;

    // Use wallet_transactions as source of truth if available
    const walletTxns = walletRes.data ?? [];
    const walletCredits = walletTxns.filter((t: any) => t.type === 'credit' || t.type === 'refund').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const walletDebits = walletTxns.filter((t: any) => t.type === 'withdrawal' || t.type === 'debit').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const hasWalletData = walletTxns.length > 0;

    const totalEarned = hasWalletData ? walletCredits : confirmedAppts.reduce((sum, a) => sum + getPrice(a) * (doctorPercent / 100), 0);
    const totalPending = pendingAppts.reduce((sum, a) => sum + getPrice(a) * (doctorPercent / 100), 0);
    const availableBalance = hasWalletData ? Math.max(0, walletCredits - walletDebits) : Math.max(0, totalEarned - (withdrawRes.data ?? []).filter(w => w.status === "approved").reduce((sum: number, w: { amount: number }) => sum + Number(w.amount), 0));

    const now = new Date();
    const monthStart = startOfMonth(now);
    const thisMonthAppts = confirmedAppts.filter(a => new Date(a.scheduled_at) >= monthStart);

    setStats({
      total: totalEarned,
      pending: totalPending,
      thisMonth: thisMonthAppts.reduce((sum, a) => sum + getPrice(a) * (doctorPercent / 100), 0),
      totalAppts: confirmedAppts.length,
      available: availableBalance,
    });

    // Last 6 months chart
    const chartData: { month: string; consultas: number; valor: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(now, i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const monthAppts = confirmedAppts.filter(a => {
        const d = new Date(a.scheduled_at);
        return d >= mStart && d <= mEnd;
      });
      chartData.push({
        month: format(m, "MMM", { locale: ptBR }),
        consultas: monthAppts.length,
        valor: monthAppts.reduce((sum, a) => sum + getPrice(a) * (doctorPercent / 100), 0),
      });
    }
    setMonthlyData(chartData);
    setLoading(false);
  };

  const requestWithdrawal = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < MIN_WITHDRAWAL) {
      toast.error(`Valor mínimo para saque: R$ ${MIN_WITHDRAWAL.toFixed(2)}`);
      return;
    }
    if (amount > stats.available) {
      toast.error("Valor superior ao saldo disponível");
      return;
    }
    if (!pixKey.trim()) {
      toast.error("Informe sua chave PIX");
      return;
    }
    setSubmitting(true);
    const { error } = await db.from("withdrawal_requests").insert({
      user_id: user!.id,
      amount,
      pix_key: pixKey,
    });
    if (error) {
      toast.error("Erro ao solicitar saque");
    } else {
      toast.success("Solicitação de saque enviada! Processamento em 3-5 dias úteis.");
      setWithdrawOpen(false);
      setWithdrawAmount("");
      setPixKey("");
      fetchEarnings();
    }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-secondary/10 text-secondary border-secondary/20 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Aprovado</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />Rejeitado</Badge>;
    return <Badge variant="outline" className="text-xs gap-1"><Clock className="w-3 h-3" />Pendente</Badge>;
  };

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("earnings")}>
      <div className="w-full mx-auto max-w-4xl space-y-6 pb-24 md:pb-6">
        {/* Modern Header */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground">Ganhos e Finanças</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Extrato Profissional</p>
              </div>
            </div>
            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-2xl h-11 px-6 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20">
                  <Wallet className="w-4 h-4" /> Sacar R$ {stats.available.toFixed(0)}
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader>
                  <DialogTitle>Solicitar Saque</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="p-4 rounded-2xl bg-muted/50 border border-border/10">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Saldo Disponível</p>
                    <p className="text-2xl font-black text-foreground">R$ {stats.available.toFixed(2)}</p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase px-1">Valor do Saque</label>
                      <Input type="number" placeholder={`Mínimo R$ ${MIN_WITHDRAWAL}`} value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="rounded-2xl h-12" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase px-1">Chave PIX</label>
                      <Input placeholder="CPF, e-mail ou telefone" value={pixKey} onChange={e => setPixKey(e.target.value)} className="rounded-2xl h-12" />
                    </div>
                  </div>
                  <Button className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={requestWithdrawal} disabled={submitting || !withdrawAmount || !pixKey.trim()}>
                    {submitting ? "Processando..." : "Confirmar Saque"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Affiliate info pill */}
          {clinicInfo && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                Repasse de {clinicInfo.percent}% pela {clinicInfo.name}
              </p>
              <Sparkles className="w-3.5 h-3.5 text-primary/40 ml-auto" />
            </div>
          )}
        </div>

        {/* Modern Bento Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Confirmado", value: `R$ ${stats.total.toFixed(0)}`, color: "text-emerald-600", icon: "💰", bg: "bg-emerald-50/50" },
            { label: "Ganhos Mensais", value: `R$ ${stats.thisMonth.toFixed(0)}`, color: "text-blue-600", icon: "📈", bg: "bg-blue-50/50" },
            { label: "Aguardando", value: `R$ ${stats.pending.toFixed(0)}`, color: "text-amber-600", icon: "⏳", bg: "bg-amber-50/50" },
            { label: "Disponível", value: `R$ ${stats.available.toFixed(0)}`, color: "text-violet-600", icon: "💳", bg: "bg-violet-50/50" },
          ].map(s => (
            <div key={s.label} className={cn("p-4 rounded-3xl border border-border/10 flex flex-col justify-between min-h-[110px]", s.bg)}>
              <span className="text-lg">{s.icon}</span>
              <div>
                <p className={cn("text-xl font-black leading-none", s.color)}>{s.value}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 mt-1.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Withdrawal info pill */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card p-3 text-[11px] text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-semibold text-foreground">Saque PIX em 3-5 dias úteis</span>
          <span className="opacity-30">·</span>
          <span>Mínimo R$ {MIN_WITHDRAWAL.toFixed(2)}</span>
          <span className="opacity-30">·</span>
          <span>Repasse de {clinicInfo ? clinicInfo.percent : DEFAULT_DOCTOR_PERCENT}% por consulta</span>
        </div>

        {/* Breakdown explicado: como ganho de R$100 vira R$X no bolso */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Como funciona o repasse
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(() => {
              const docPct = clinicInfo ? clinicInfo.percent : DEFAULT_DOCTOR_PERCENT;
              const platPct = clinicInfo ? Math.max(0, 100 - docPct) : PLATFORM_PERCENT;
              return (
                <>
                  <p className="text-muted-foreground mb-3">
                    Para uma consulta de <span className="font-bold text-foreground">R$ 100,00</span>:
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/40">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-semibold text-foreground">Para você</span>
                        <span className="text-[11px] text-muted-foreground">({docPct}%)</span>
                      </div>
                      <span className="font-extrabold text-emerald-600">R$ {docPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-sm font-medium text-foreground">
                          {clinicInfo ? `Clínica ${clinicInfo.name}` : "Plataforma AloClínica"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">({platPct}%)</span>
                      </div>
                      <span className="font-bold text-foreground">R$ {platPct.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/30 space-y-1.5 text-[12px] text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      Pagamento liberado <strong className="text-foreground">após confirmação da consulta</strong> (paciente comparece + status = concluída).
                    </p>
                    <p className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      Saque PIX cai em <strong className="text-foreground">3-5 dias úteis</strong> após solicitação.
                    </p>
                    <p className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      Não cobramos taxa de saque. Tarifas do PIX seguem regra do seu banco (em geral, R$ 0,00 PF).
                    </p>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        <Card className="border-border mb-8">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Faturamento Mensal</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="space-y-3"><div className="shimmer-v2 h-24 rounded-2xl"/><div className="shimmer-v2 h-24 rounded-2xl"/><div className="shimmer-v2 h-24 rounded-2xl"/></div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={v => `R$${v}`} />
                  <Tooltip formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Valor"]} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {withdrawals.length > 0 && (
          <Card className="border-border">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wallet className="w-5 h-5" /> Histórico de Saques</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {withdrawals.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">R$ {Number(w.amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(w.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {w.pix_key && ` · PIX: ${w.pix_key}`}
                      </p>
                    </div>
                    {statusBadge(w.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DoctorEarnings;
