import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminNav } from "@/components/admin/adminNav";
import { DollarSign, AlertTriangle, Users, TrendingUp, CreditCard, FileText, Activity, Clock, Video, Star, Download, RefreshCw, UserPlus, Calendar } from "lucide-react";
import AdminAnalyticsCharts from "./AdminAnalyticsCharts";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
// jsPDF loaded dynamically on export
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useGsapEntrance } from "@/hooks/use-gsap-entrance";
import type { AdminKpiItem } from "@/types/domain";
import { HeroBanner } from "./HeroBanner";
import { StatBento } from "./StatBento";
import { ActionPills } from "./ActionPills";
import { PingoBannerCard } from "@/components/mascot/PingoBannerCard";
import { PremiumHero } from "./PremiumHero";
import { AlertBox } from "./AlertBox";
import SectionErrorBoundary from "@/components/ui/section-error-boundary";
import pingoAdmin from "@/assets/pingo-admin.png";

const PERIOD_OPTIONS = [
  { value: "month", label: "Este mês" },
  { value: "last3", label: "Últimos 3 meses" },
  { value: "last6", label: "Últimos 6 meses" },
  { value: "all", label: "Todo período" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [periodFilter, setPeriodFilter] = useState("month");
  const [refreshing, setRefreshing] = useState(false);
  const kpiRef = useGsapEntrance({ stagger: 0.05, y: 12, delay: 0.15 });
  const [stats, setStats] = useState({
    total_revenue: 0, active_subs: 0, overdue_subs: 0, total_patients: 0,
    total_doctors: 0, monthly_appts: 0,
    live_now: 0, waiting_now: 0, no_show_rate: 0, cancel_rate: 0, avg_rating: 0,
    avg_nps: 0,
  });
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [overdueSubs, setOverdueSubs] = useState<any[]>([]);
  const [pendingDoctors, setPendingDoctors] = useState<any[]>([]);
  const [liveAppts, setLiveAppts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, [periodFilter]);

  useEffect(() => {
    const channel = db
      .channel("admin-live-monitor")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, () => {
        fetchLiveStats();
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, []);

  const fetchLiveStats = async () => {
    const [liveRes, waitRes, liveListRes] = await Promise.all([
      db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      db.from("appointments")
        .select("id, scheduled_at, status, patient_id, doctor_id")
        .in("status", ["in_progress", "waiting"])
        .order("scheduled_at", { ascending: true })
        .limit(10),
    ]);

    setStats(prev => ({ ...prev, live_now: liveRes.count ?? 0, waiting_now: waitRes.count ?? 0 }));

    if (liveListRes.data && liveListRes.data.length > 0) {
      const patientIds = [...new Set(liveListRes.data.map((a: any) => a.patient_id).filter(Boolean))];
      const doctorIds = [...new Set(liveListRes.data.map((a: any) => a.doctor_id))];
      const [pRes, dRes] = await Promise.all([
        patientIds.length > 0
          ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => id !== null))
          : Promise.resolve({ data: null as any[] | null }),
        db.from("doctor_profiles").select("id, user_id").in("id", doctorIds),
      ]);
      const pMap = new Map((pRes.data ?? []).map((p: any) => [p.user_id, `${p.first_name} ${p.last_name}`.trim()]));
      const docUserIds = (dRes.data ?? []).map((d: any) => d.user_id);
      const { data: docProfiles } = docUserIds.length > 0
        ? await db.from("profiles").select("user_id, first_name, last_name").in("user_id", docUserIds)
        : { data: [] };
      const docMap = new Map<string, string>();
      (dRes.data ?? []).forEach(d => {
        const p = docProfiles?.find(pr => pr.user_id === d.user_id);
        if (p) docMap.set(d.id, `Dr(a). ${p.first_name} ${p.last_name}`);
      });
      setLiveAppts(liveListRes.data.map(a => ({
        ...a,
        patient_name: pMap.get(a.patient_id!) ?? "—",
        doctor_name: docMap.get(a.doctor_id) ?? "—",
      })));
    } else {
      setLiveAppts([]);
    }
  };

  const fetchAll = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    const now = new Date();
    let periodStart: Date;
    if (periodFilter === "month") { periodStart = startOfMonth(now); }
    else if (periodFilter === "last3") { periodStart = startOfMonth(subMonths(now, 2)); }
    else if (periodFilter === "last6") { periodStart = startOfMonth(subMonths(now, 5)); }
    else { periodStart = new Date("2020-01-01"); }

    const [patientsRes, doctorsRes, activeSubsRes, expiredSubsRes, monthApptsRes, pendingRes, allSubsRes, cancelledRes, noShowRes, totalMonthRes, ratingsRes, npsRes] = await Promise.all([
      db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "patient"),
      db.from("doctor_profiles").select("id", { count: "exact", head: true }),
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("subscriptions").select("id, user_id, plan_id, expires_at, status")
        .in("status", ["expired", "cancelled"])
        .order("expires_at", { ascending: false }).limit(10),
      db.from("appointments").select("id", { count: "exact", head: true })
        .gte("scheduled_at", periodStart.toISOString()),
      db.from("doctor_profiles").select("id, user_id, crm, crm_state").eq("is_approved", false).limit(5),
      db.from("subscriptions").select("id, user_id, plan_id, status, starts_at, expires_at, created_at")
        .order("created_at", { ascending: false }).limit(10),
      db.from("appointments").select("id", { count: "exact", head: true })
        .eq("status", "cancelled").gte("scheduled_at", periodStart.toISOString()),
      db.from("appointments").select("id", { count: "exact", head: true })
        .eq("status", "no_show").gte("scheduled_at", periodStart.toISOString()),
      db.from("appointments").select("id", { count: "exact", head: true })
        .gte("scheduled_at", periodStart.toISOString()),
      db.from("doctor_profiles").select("rating").gt("rating", 0),
      db.from("satisfaction_surveys").select("nps_score")
        .gte("created_at", periodStart.toISOString()),
    ]);

    const totalMonth = totalMonthRes.count ?? 0;
    const cancelRate = totalMonth > 0 ? ((cancelledRes.count ?? 0) / totalMonth) * 100 : 0;
    const noShowRate = totalMonth > 0 ? ((noShowRes.count ?? 0) / totalMonth) * 100 : 0;
    const ratings = (ratingsRes.data ?? []).map(d => Number(d.rating)).filter(r => r > 0);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const npsScores = (npsRes.data ?? []).map(s => Number(s.nps_score));
    const avgNps = npsScores.length > 0 ? npsScores.reduce((a, b) => a + b, 0) / npsScores.length : 0;

    const activePlansRes = await db.from("subscriptions").select("plan_id").eq("status", "active");
    let totalRevenue = 0;
    if (activePlansRes.data && activePlansRes.data.length > 0) {
      const { data: plans } = await db.from("plans").select("id, price");
      const planPriceMap = new Map((plans as any[])?.map((p: any) => [p.id, Number(p.price)]) ?? []);
      activePlansRes.data.forEach((s: any) => { totalRevenue += planPriceMap.get(s.plan_id) ?? 0; });
    }

    setStats({
      total_revenue: totalRevenue, active_subs: activeSubsRes.count ?? 0,
      overdue_subs: expiredSubsRes.data?.length ?? 0, total_patients: patientsRes.count ?? 0,
      total_doctors: doctorsRes.count ?? 0, monthly_appts: monthApptsRes.count ?? 0,
      live_now: 0, waiting_now: 0, cancel_rate: cancelRate, no_show_rate: noShowRate, avg_rating: avgRating,
      avg_nps: avgNps,
    });

    const allSubs = [...(allSubsRes.data ?? []), ...(expiredSubsRes.data ?? [])];
    const userIds = [...new Set(allSubs.map(s => s.user_id))];
    const planIds2 = [...new Set(allSubs.map(s => s.plan_id))];
    const [profilesRes, plansRes2] = await Promise.all([
      userIds.length > 0 ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds) : { data: [] },
      planIds2.length > 0 ? db.from("plans").select("id, name, price") : { data: [] },
    ]);
    const pMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, `${p.first_name} ${p.last_name}`] as const));
    const planMap = new Map((plansRes2.data ?? []).map((p: any) => [p.id, p] as const));
    const enrichSub = (s: any) => ({
      ...s, user_name: pMap.get(s.user_id) ?? "—",
      plan_name: (planMap.get(s.plan_id) as any)?.name ?? "—", plan_price: (planMap.get(s.plan_id) as any)?.price ?? 0,
    });
    setRecentSubs((allSubsRes.data ?? []).map(enrichSub));
    setOverdueSubs((expiredSubsRes.data ?? []).map(enrichSub));

    if (pendingRes.data && pendingRes.data.length > 0) {
      const docUserIds = pendingRes.data.map(d => d.user_id);
      const { data: docProfiles } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", docUserIds);
      const dpMap = new Map(docProfiles?.map((p: any) => [p.user_id, p]) ?? []);
      setPendingDoctors(pendingRes.data.map((d: any) => ({
        ...d, name: dpMap.has(d.user_id) ? `${(dpMap.get(d.user_id) as any)!.first_name} ${(dpMap.get(d.user_id) as any)!.last_name}` : "—",
      })));
    }

    setLoading(false);
    setRefreshing(false);
    fetchLiveStats();
  };

  const exportAdminPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório Administrativo — AloClínica", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 28);
    doc.text(`Período: ${PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label ?? periodFilter}`, 14, 35);
    const metrics = [
      ["Receita Recorrente", `R$ ${stats.total_revenue.toFixed(2)}`],
      ["Assinaturas Ativas", String(stats.active_subs)],
      ["Inadimplentes", String(stats.overdue_subs)],
      ["Total de Pacientes", String(stats.total_patients)],
      ["Total de Médicos", String(stats.total_doctors)],
      ["Consultas no Período", String(stats.monthly_appts)],
      ["Cancelamentos %", `${stats.cancel_rate.toFixed(1)}%`],
      ["Absenteísmo %", `${stats.no_show_rate.toFixed(1)}%`],
      ["NPS Médio", stats.avg_rating.toFixed(1)],
    ];
    let y = 48;
    doc.setFontSize(12);
    doc.text("Métricas Gerais", 14, y); y += 10;
    metrics.forEach(([label, value]) => { doc.setFontSize(10); doc.text(`${label}: ${value}`, 14, y); y += 8; });
    doc.save(`relatorio-admin-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Relatório PDF exportado!");
  };

  const exportAdminCSV = () => {
    const rows = [
      ["Métrica", "Valor"],
      ["Receita Recorrente", `R$ ${stats.total_revenue.toFixed(2)}`],
      ["Assinaturas Ativas", String(stats.active_subs)],
      ["Inadimplentes", String(stats.overdue_subs)],
      ["Total Pacientes", String(stats.total_patients)],
      ["Total Médicos", String(stats.total_doctors)],
      ["Consultas no Período", String(stats.monthly_appts)],
      ["Cancelamentos %", `${stats.cancel_rate.toFixed(1)}%`],
      ["Absenteísmo %", `${stats.no_show_rate.toFixed(1)}%`],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.setAttribute("download", `relatorio-admin-${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success("CSV exportado!");
  };

  const approveDoctor = async (id: string) => {
    await db.from("doctor_profiles").update({ is_approved: true }).eq("id", id);
    fetchAll();
  };

  const statusLabel: Record<string, string> = { active: "Ativa", cancelled: "Cancelada", expired: "Vencida", paused: "Pausada" };

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("overview")} role="admin">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 pb-24 md:pb-8 pb-24 md:pb-8">

        {/* ── Premium Admin Hero ── */}
        <div className="-mx-4 -mt-5 md:-mx-6 md:-mt-5 lg:-mx-8 lg:-mt-6">
        <HeroBanner
          gradient="from-[#3B0000] via-[#8B1515] to-[#C41A1A]"
          pingoSrc={pingoAdmin}
          pingoAlt="Pingo"
          liveDot={true}
          liveColor="red"
          bubble={{
            greeting: "Monitoramento · Admin",
            name: "Painel de Controle",
            sub: `${stats.live_now} consulta${stats.live_now !== 1 ? 's' : ''} ao vivo agora`,
          }}
          kpis={[
            { label: "Pacientes", value: stats.total_patients },
            { label: "Médicos", value: stats.total_doctors },
            { label: "Receita", value: `R$${(stats.total_revenue/1000).toFixed(1)}k` },
            { label: "Ao vivo", value: stats.live_now },
          ]}
          loading={loading}
          onRefresh={() => fetchAll(true)}
          refreshing={refreshing}
        />
      </div>

      {/* ── CONTENT ── */}
      <div className="mt-5 space-y-5">

        {/* ── Action Pills ── */}
        <ActionPills title="Ações do admin" actions={[
          { label: "Usuários", icon: "👥", iconBg: "bg-blue-50 dark:bg-blue-950/30", path: "/dashboard/admin/users" },
          { label: "Médicos", icon: "🩺", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", path: "/dashboard/admin/doctors" },
          { label: "Financeiro", icon: "💰", iconBg: "bg-amber-50 dark:bg-amber-950/30", path: "/dashboard/admin/financial" },
          { label: "Manutenção", icon: "🛠️", iconBg: "bg-cyan-50 dark:bg-cyan-950/30", path: "/dashboard/admin/maintenance?role=admin" },
          { label: "Relatórios", icon: "📊", iconBg: "bg-red-50 dark:bg-red-950/30", path: "/dashboard/admin/reports" },
        ]} />

        {/* ── Bento Stats ── */}
        <StatBento loading={loading} stats={[
          { label: "Receita mensal", value: `R$${(stats.total_revenue / 1000).toFixed(1)}k`, icon: "💰", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", valueClass: "text-emerald-700 dark:text-emerald-400", trend: 18 , accentClass: "bg-emerald-500" },
          { label: "Consultas/mês", value: stats.monthly_appts, icon: "📅", iconBg: "bg-blue-50 dark:bg-blue-950/30", valueClass: "text-[#1255C8] dark:text-blue-400", trend: 24 , accentClass: "bg-blue-500" },
          { label: "Avaliação média", value: stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : "—", icon: "⭐", iconBg: "bg-amber-50 dark:bg-amber-950/30", valueClass: "text-amber-600 dark:text-amber-400" },
        ]} />

        {/* Pingo Admin Banner */}
        <PingoBannerCard
          pingImg={pingoAdmin}
          pingAlt="Pingo"
          pingSize={82}
          bgClass="bg-red-50 dark:bg-red-950/20"
          borderClass="border-red-100 dark:border-red-900/30"
          label="Controle Total"
          labelColor="text-red-600 dark:text-red-400"
          title="Plataforma operando"
          subtitle="Acompanhe métricas em tempo real"
        />

        {/* Header actions */}
        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Detalhes Operacionais</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-36 h-9 rounded-xl text-xs bg-background border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl bg-background" aria-label="Ação" onClick={() =>  fetchAll(true)} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 bg-background text-xs" onClick={exportAdminCSV} disabled={loading}>
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 bg-background text-xs" onClick={exportAdminPDF} disabled={loading}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 bg-background text-xs" onClick={async () => {
              toast.loading("Criando usuários de teste...");
              try {
                const { data, error } = await db.functions.invoke("seed-test-users");
                toast.dismiss();
                if (error) { toast.error("Erro: " + error.message); return; }
                const created = data?.users?.filter((u: any) => u.status === "created").length ?? 0;
                const existing = data?.users?.filter((u: any) => u.status === "already_exists").length ?? 0;
                toast.success(`${created} criados, ${existing} já existiam`);
              } catch (e: unknown) { toast.dismiss(); toast.error(e instanceof Error ? e.message : "Erro"); }
            }}>
              <UserPlus className="w-3.5 h-3.5" /> Seed
            </Button>
          </div>
        </motion.div>

        {/* Real-time banner */}
        <motion.div variants={fadeUp}>
          <Card variant="elevated" className="bg-background overflow-hidden border-border/20">
            <div className="h-1 bg-gradient-to-r from-primary via-secondary to-warning" />
            <CardContent className="p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-sm">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground text-sm">Tempo Real</h2>
                  <p className="text-[10px] text-muted-foreground">Atualizado automaticamente</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { icon: Video, color: "text-primary", bgColor: "bg-primary/8", value: stats.live_now, label: "Ao vivo" },
                  { icon: Clock, color: "text-secondary", bgColor: "bg-secondary/8", value: stats.waiting_now, label: "Na fila" },
                  { icon: null, color: "text-foreground", bgColor: "bg-muted/60", value: `${stats.cancel_rate.toFixed(1)}%`, label: "Cancelamentos" },
                  { icon: null, color: "text-destructive", bgColor: "bg-destructive/5", value: `${stats.no_show_rate.toFixed(1)}%`, label: "Absenteísmo" },
                  { icon: Star, color: "text-warning", bgColor: "bg-warning/8", value: stats.avg_rating.toFixed(1), label: "NPS Médicos" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={`text-center p-3.5 rounded-xl ${item.bgColor} border border-border/10 hover:shadow-sm transition-all duration-200`}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1.5">
                      {item.icon && <item.icon className={`w-4 h-4 ${item.color}`} />}
                      <span className={`text-xl font-black tabular-nums ${item.color}`}>{item.value}</span>
                    </div>
                    <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Live consultations */}
        {liveAppts.length > 0 && (
          <motion.div variants={fadeUp}>
            <Card variant="elevated">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Consultas Ativas ({liveAppts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {liveAppts.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant={a.status === "in_progress" ? "default" : "secondary"} className="text-xs">
                          {a.status === "in_progress" ? "🔴 Ao vivo" : "⏳ Esperando"}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.patient_name}</p>
                          <p className="text-xs text-muted-foreground">{a.doctor_name}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(a.scheduled_at), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* KPI Cards with trend indicators */}
        <motion.div variants={fadeUp} ref={kpiRef} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5" role="list" aria-label="Indicadores chave do sistema">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 shimmer-v2 rounded-2xl" aria-hidden="true" />)
          ) : (
            [
              { label: "Receita (MRR)", value: `R$ ${stats.total_revenue.toFixed(0)}`, icon: DollarSign, color: "text-success", bg: "bg-success/10", trend: stats.total_revenue > 0 ? "↑" : null },
              { label: "Assinaturas", value: stats.active_subs, icon: CreditCard, color: "text-primary", bg: "bg-primary/10", path: "/dashboard/admin/subscriptions", trend: stats.active_subs > 0 ? "↑" : null },
              { label: "Inadimplentes", value: stats.overdue_subs, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", trend: stats.overdue_subs > 0 ? "⚠" : "✓" },
              { label: "Pacientes", value: stats.total_patients, icon: Users, color: "text-secondary", bg: "bg-secondary/10", path: "/dashboard/admin/patients", trend: "↑" },
              { label: "Médicos", value: stats.total_doctors, icon: FileText, color: "text-warning", bg: "bg-warning/10", path: "/dashboard/admin/doctors" },
              { label: "Consultas", value: stats.monthly_appts, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10", path: "/dashboard/admin/appointments" },
              { label: "NPS Médio", value: stats.avg_nps.toFixed(1), icon: Star, color: "text-warning", bg: "bg-warning/10" },
            ].map((kpi) => (
              <button
                key={kpi.label}
                onClick={() => kpi.path && navigate(kpi.path)}
                className="kpi-card p-3.5 rounded-2xl bg-background border border-border/20 hover:border-border/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left group"
                role="listitem"
                aria-label={`${kpi.label}: ${kpi.value}${kpi.path ? " — clique para ver detalhes" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} aria-hidden="true" />
                  </div>
                  {kpi.trend && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      kpi.trend === "⚠" ? "bg-destructive/10 text-destructive"
                      : "bg-success/10 text-success"
                    }`} aria-hidden="true">
                      {kpi.trend}
                    </span>
                  )}
                </div>
                <p className="text-xl font-black text-foreground tabular-nums" aria-hidden="true">{kpi.value}</p>
                <p className="text-[10px] font-semibold text-muted-foreground/70 mt-0.5">{kpi.label}</p>
              </button>
            ))
          )}
        </motion.div>

        {/* Analytics Charts */}
        <motion.div variants={fadeUp}>
          <SectionErrorBoundary fallbackTitle="Erro ao carregar gráficos de análises">
            <AdminAnalyticsCharts />
          </SectionErrorBoundary>
        </motion.div>

        <motion.div variants={fadeUp} className="grid lg:grid-cols-2 gap-5">
          {/* Overdue */}
          <Card variant="elevated">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" /> Inadimplentes
                {overdueSubs.length > 0 && (
                  <span className="ml-auto text-xs font-normal text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                    {overdueSubs.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {overdueSubs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="text-sm text-muted-foreground">Nenhum inadimplente!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {overdueSubs.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl border border-destructive/20 bg-destructive/5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.user_name}</p>
                        <p className="text-xs text-muted-foreground">{s.plan_name} · R$ {Number(s.plan_price).toFixed(2)}</p>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/20 shrink-0 ml-2">
                        {statusLabel[s.status] ?? s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending doctors */}
          <Card variant="elevated">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Médicos Pendentes
                {pendingDoctors.length > 0 && (
                  <span className="ml-auto text-xs font-normal text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                    {pendingDoctors.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {pendingDoctors.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm text-muted-foreground">Nenhum pendente de aprovação</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingDoctors.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3.5 rounded-xl border border-warning/20 bg-warning/5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground">CRM {d.crm}/{d.crm_state}</p>
                      </div>
                      <Button size="sm" className="bg-success/10 text-success border border-success/30 hover:bg-success/20 text-xs h-8 shrink-0 ml-2 rounded-xl" onClick={() => approveDoctor(d.id)}>
                        Aprovar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent subscriptions */}
        <motion.div variants={fadeUp}>
          <Card variant="elevated">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Assinaturas Recentes</CardTitle>
                <Button size="sm" variant="ghost" className="text-xs text-primary" onClick={() => navigate("/dashboard/admin/subscriptions")}>
                  Ver todas →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {recentSubs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma assinatura registrada.</p>
              ) : (
                <div className="overflow-auto rounded-xl border border-border/50">
                  <div className="overflow-x-auto rounded-xl">

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Usuário</TableHead>
                        <TableHead className="text-xs">Plano</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentSubs.map(s => (
                        <TableRow key={s.id} className="hover:bg-muted/20">
                          <TableCell className="font-medium text-foreground text-sm">{s.user_name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{s.plan_name}</TableCell>
                          <TableCell className="text-foreground text-sm">R$ {Number(s.plan_price).toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              s.status === "active" ? "bg-success/10 text-success border-success/20"
                              : s.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-muted text-muted-foreground border-border"
                            }`}>
                              {statusLabel[s.status] ?? s.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
            </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
