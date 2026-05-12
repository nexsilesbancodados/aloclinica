import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "@/components/admin/adminNav";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, Users, Stethoscope, XCircle, UserX, Star, DollarSign, FileText, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import type { DoctorPerformanceRow } from "@/types/domain";

const COLORS = ["hsl(210,90%,45%)", "hsl(160,55%,45%)", "hsl(40,90%,55%)", "hsl(0,84%,60%)", "hsl(270,60%,55%)"];

interface ChartDataPoint {
  month: string;
  [key: string]: string | number;
}

const AdminReports = () => {
  const [revenueData, setRevenueData] = useState<Record<string, string | number>[]>([]);
  const [userGrowth, setUserGrowth] = useState<Record<string, string | number>[]>([]);
  const [specialtyData, setSpecialtyData] = useState<{ name: string; value: number }[]>([]);
  const [cancellationData, setCancellationData] = useState<Record<string, string | number>[]>([]);
   
  const [topDoctors, setTopDoctors] = useState<DoctorPerformanceRow[]>([]);
   
  const [summaryStats, setSummaryStats] = useState({
    totalRevenue: 0, totalAppts: 0, totalCancelled: 0, totalNoShow: 0, avgTicket: 0, avgNps: 0,
    mrr: 0,                  // Monthly Recurring Revenue (Pingo Card + subscriptions)
    activeCards: 0,          // Pingo Cards ativos
    churnRate: 0,            // % cancelados nos últimos 30d / ativos no início
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("6");

  useEffect(() => { fetchReports(); }, [period]);

  const monthsBack = parseInt(period);

  const fetchReports = async () => {
    setLoading(true);
    const now = new Date();

    // Revenue by month
    const { data: subs } = await db.from("subscriptions").select("plan_id, created_at, status");
    const { data: plans } = await db.from("plans").select("id, price");
    const planPriceMap = new Map(plans?.map(p => [p.id, Number(p.price)]) ?? []);

    const revChart: ChartDataPoint[] = [];
    let totalRevAll = 0;
    for (let i = monthsBack - 1; i >= 0; i--) {
      const m = subMonths(now, i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const monthSubs = (subs ?? []).filter(s => {
        const d = new Date(s.created_at);
        return d >= mStart && d <= mEnd;
      });
      const revenue = monthSubs.reduce((acc, s) => acc + (planPriceMap.get(s.plan_id) ?? 0), 0);
      totalRevAll += revenue;
      revChart.push({ month: format(m, "MMM/yy", { locale: ptBR }), receita: revenue });
    }
    setRevenueData(revChart);

    // User growth
    const { data: roles } = await db.from("user_roles").select("role, created_at");
    const growthChart: ChartDataPoint[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const m = subMonths(now, i);
      const mEnd = endOfMonth(m);
      const patients = (roles ?? []).filter(r => r.role === "patient" && new Date(r.created_at) <= mEnd).length;
      const doctors = (roles ?? []).filter(r => r.role === "doctor" && new Date(r.created_at) <= mEnd).length;
      growthChart.push({ month: format(m, "MMM/yy", { locale: ptBR }), pacientes: patients, medicos: doctors });
    }
    setUserGrowth(growthChart);

    // Appointments
    const { data: appts } = await db.from("appointments").select("doctor_id, status, scheduled_at");
    const completedAppts = (appts ?? []).filter(a => a.status === "completed");
    const doctorIds = [...new Set(completedAppts.map(a => a.doctor_id))];
    if (doctorIds.length > 0) {
      const { data: docSpecs } = await db.from("doctor_specialties").select("doctor_id, specialty_id").in("doctor_id", doctorIds);
      const specIds = [...new Set((docSpecs ?? []).map((ds: any) => ds.specialty_id))];
      const { data: specs } = await db.from("specialties").select("id, name").in("id", specIds.length > 0 ? specIds : ["none"]);
      const specMap = new Map((specs as any[])?.map((s: any) => [s.id, s.name]) ?? []);
      const docSpecMap = new Map<string, string>();
      (docSpecs ?? []).forEach((ds: any) => docSpecMap.set(ds.doctor_id, specMap.get(ds.specialty_id) ?? "Outros"));
      const specCount: Record<string, number> = {};
      completedAppts.forEach(a => {
        const spec = docSpecMap.get(a.doctor_id) ?? "Sem especialidade";
        specCount[spec] = (specCount[spec] ?? 0) + 1;
      });
      setSpecialtyData(Object.entries(specCount).map(([name, value]) => ({ name, value })));
    }

    // Cancellation trends
    const cancelChart: ChartDataPoint[] = [];
    let totalAppts = 0, totalCancelled = 0, totalNoShow = 0;
    for (let i = monthsBack - 1; i >= 0; i--) {
      const m = subMonths(now, i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const monthAppts = (appts ?? []).filter(a => {
        const d = new Date(a.scheduled_at);
        return d >= mStart && d <= mEnd;
      });
      const total = monthAppts.length;
      const cancelled = monthAppts.filter(a => a.status === "cancelled").length;
      const noShow = monthAppts.filter(a => a.status === "no_show").length;
      totalAppts += total;
      totalCancelled += cancelled;
      totalNoShow += noShow;
      cancelChart.push({
        month: format(m, "MMM/yy", { locale: ptBR }),
        cancelamentos: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        absenteismo: total > 0 ? Math.round((noShow / total) * 100) : 0,
      });
    }
    setCancellationData(cancelChart);

    // Top doctors
    const { data: docProfiles } = await db.from("doctor_profiles")
      .select("id, user_id, rating, total_reviews, consultation_price")
      .gt("total_reviews", 0)
      .order("rating", { ascending: false })
      .limit(5);
    if (docProfiles && docProfiles.length > 0) {
      const userIds = docProfiles.map(d => d.user_id);
      const { data: profiles } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
      const pMap = new Map(profiles?.map(p => [p.user_id, `Dr(a). ${p.first_name} ${p.last_name}`]) ?? []);
      setTopDoctors(docProfiles.map(d => ({
        ...d, name: pMap.get(d.user_id) ?? "—",
      })));
    }

    // Average NPS
    const { data: surveys } = await db.from("satisfaction_surveys").select("nps_score");
    const avgNps = surveys && surveys.length > 0
      ? surveys.reduce((a, s) => a + s.nps_score, 0) / surveys.length
      : 0;

    const activeSubs = (subs ?? []).filter(s => s.status === "active");
    const avgTicket = activeSubs.length > 0
      ? activeSubs.reduce((acc, s) => acc + (planPriceMap.get(s.plan_id) ?? 0), 0) / activeSubs.length
      : 0;

    // ─── Métricas SaaS — MRR + Churn + Cartões ativos ───
    // MRR de Pingo Card: soma price_monthly dos planos ativos × assinaturas ativas
    const [pingoSubsRes, pingoPlansRes] = await Promise.all([
      db.from("pingo_card_subscriptions").select("plan_id, status, billing_cycle, started_at, canceled_at"),
      db.from("pingo_card_plans").select("id, price_monthly, price_yearly"),
    ]);
    const pingoPlanMap = new Map<string, { monthly: number; yearly: number }>(
      (pingoPlansRes.data ?? []).map(p => [p.id, { monthly: Number(p.price_monthly), yearly: Number(p.price_yearly) }])
    );
    const activeCards = (pingoSubsRes.data ?? []).filter(s => s.status === "active").length;
    const mrrFromCards = (pingoSubsRes.data ?? [])
      .filter(s => s.status === "active")
      .reduce((sum, s) => {
        const p = pingoPlanMap.get(s.plan_id);
        if (!p) return sum;
        // Anual normalizado pra mês (yearly / 12)
        return sum + (s.billing_cycle === "yearly" ? p.yearly / 12 : p.monthly);
      }, 0);
    const mrrFromGenericSubs = activeSubs.reduce((acc, s) => acc + (planPriceMap.get(s.plan_id) ?? 0), 0);
    const mrr = mrrFromCards + mrrFromGenericSubs;

    // Churn rate: cancelados nos últimos 30d / total ativos há 30d
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cancelledLast30d = (pingoSubsRes.data ?? []).filter(
      s => s.canceled_at && new Date(s.canceled_at) >= thirtyDaysAgo
    ).length;
    const activeAt30dAgo = (pingoSubsRes.data ?? []).filter(s => {
      if (!s.started_at) return false;
      if (new Date(s.started_at) > thirtyDaysAgo) return false; // ainda não existia
      if (s.canceled_at && new Date(s.canceled_at) <= thirtyDaysAgo) return false; // já tinha cancelado
      return true;
    }).length;
    const churnRate = activeAt30dAgo > 0 ? (cancelledLast30d / activeAt30dAgo) * 100 : 0;

    setSummaryStats({
      totalRevenue: totalRevAll,
      totalAppts,
      totalCancelled,
      totalNoShow,
      avgTicket,
      avgNps,
      mrr,
      activeCards,
      churnRate,
    });

    setLoading(false);
  };

  const exportCSV = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return;
    const BOM = "\uFEFF";
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = Object.keys(data[0]).map(escape).join(",");
    const rows = data.map(r => Object.values(r).map(escape).join(",")).join("\n");
    const blob = new Blob([BOM + headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `${filename}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const today = format(new Date(), "dd/MM/yyyy HH:mm");

    // Header
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("AloClínica — Relatório Executivo", 105, 13, { align: "center" });

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today} | Período: últimos ${period} meses`, 105, 30, { align: "center" });

    // KPIs
    doc.setFontSize(12);
    doc.text("Indicadores Principais", 20, 45);
    doc.setFontSize(10);
    const kpis = [
      `MRR (Receita Recorrente Mensal): R$ ${summaryStats.mrr.toFixed(2)}`,
      `Cartões Pingo Ativos: ${summaryStats.activeCards}`,
      `Churn Rate (30d): ${summaryStats.churnRate.toFixed(1)}%`,
      `Receita Total: R$ ${summaryStats.totalRevenue.toFixed(2)}`,
      `Total de Consultas: ${summaryStats.totalAppts}`,
      `Ticket Médio: R$ ${summaryStats.avgTicket.toFixed(2)}`,
      `Cancelamentos: ${summaryStats.totalCancelled}`,
      `Ausências (No-Show): ${summaryStats.totalNoShow}`,
      `NPS Médio: ${summaryStats.avgNps.toFixed(1)}`,
    ];
    kpis.forEach((k, i) => doc.text(`• ${k}`, 25, 55 + i * 7));

    // Revenue table
    doc.setFontSize(12);
    doc.text("Receita Mensal", 20, 105);
    doc.setFontSize(9);
    revenueData.forEach((r, i) => {
      doc.text(`${r.month}: R$ ${Number(r.receita).toFixed(2)}`, 25, 115 + i * 6);
    });

    // Top doctors
    if (topDoctors.length > 0) {
      const startY = 115 + revenueData.length * 6 + 10;
      doc.setFontSize(12);
      doc.text("Top Médicos (Avaliação)", 20, startY);
      doc.setFontSize(9);
      topDoctors.forEach((d, i) => {
        doc.text(`#${i + 1} ${d.name} — ⭐ ${Number(d.rating).toFixed(1)} (${d.total_reviews} avaliações)`, 25, startY + 10 + i * 6);
      });
    }

    // Footer
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("AloClínica — Telemedicina Digital · Relatório Confidencial", 105, 294, { align: "center" });

    doc.save(`relatorio-aloclinica-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("reports")}>
      <div className="w-full mx-auto max-w-6xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={TrendingUp}
          eyebrow="Visão Geral"
          title="Relatórios & Análises"
          description="Métricas financeiras, operacionais e de qualidade da plataforma."
          accent="from-cyan-500 to-blue-600"
          actions={
            <>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[140px] h-9">
                  <Calendar className="w-4 h-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => exportCSV(revenueData, "receita-mensal")} size="sm">
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" onClick={exportPDF} size="sm">
                <FileText className="w-4 h-4 mr-1" /> PDF
              </Button>
            </>
          }
        />

        {loading ? <div className="shimmer-v2 h-20 rounded-2xl"/> : (
          <>
            {/* Métricas SaaS — destaque com gradiente */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">MRR</p>
                </div>
                <p className="text-2xl font-extrabold text-foreground">R$ {summaryStats.mrr.toFixed(0)}</p>
                <p className="text-[11px] text-muted-foreground">Receita recorrente mensal</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] border border-amber-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Cartões ativos</p>
                </div>
                <p className="text-2xl font-extrabold text-foreground">{summaryStats.activeCards}</p>
                <p className="text-[11px] text-muted-foreground">Pingo Card pagantes</p>
              </div>
              <div className={`p-4 rounded-2xl border ${
                summaryStats.churnRate > 10
                  ? "bg-gradient-to-br from-destructive/10 to-destructive/[0.02] border-destructive/20"
                  : "bg-gradient-to-br from-blue-500/10 to-blue-500/[0.02] border-blue-500/20"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    summaryStats.churnRate > 10 ? "bg-destructive/15" : "bg-blue-500/15"
                  }`}>
                    <UserX className={`w-4 h-4 ${
                      summaryStats.churnRate > 10 ? "text-destructive" : "text-blue-600 dark:text-blue-400"
                    }`} />
                  </div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
                    summaryStats.churnRate > 10 ? "text-destructive" : "text-blue-700 dark:text-blue-400"
                  }`}>Churn (30d)</p>
                </div>
                <p className="text-2xl font-extrabold text-foreground">{summaryStats.churnRate.toFixed(1)}%</p>
                <p className="text-[11px] text-muted-foreground">
                  {summaryStats.churnRate > 10 ? "🚨 Ação urgente — analise causas" : "Saudável (< 10%/mês)"}
                </p>
              </div>
            </div>

            {/* Summary KPIs operacionais */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold text-foreground">R$ {summaryStats.totalRevenue.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Receita</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Stethoscope className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold text-foreground">{summaryStats.totalAppts}</p>
                <p className="text-xs text-muted-foreground">Consultas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold text-foreground">R$ {summaryStats.avgTicket.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Ticket Médio</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Star className="w-4 h-4 mx-auto text-yellow-500 mb-1" />
                <p className="text-lg font-bold text-foreground">{summaryStats.avgNps.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">NPS Médio</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/5">
                <XCircle className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-lg font-bold text-destructive">{summaryStats.totalCancelled}</p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/5">
                <UserX className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-lg font-bold text-destructive">{summaryStats.totalNoShow}</p>
                <p className="text-xs text-muted-foreground">Ausências</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Revenue chart */}
              <Card className="border-border">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Receita Mensal</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `R$${v}`} />
                      <Tooltip formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Receita"]} />
                      <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Cancellation trend */}
              <Card className="border-border">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><XCircle className="w-5 h-5 text-destructive" /> Cancelamentos & Absenteísmo (%)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={cancellationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(v: number) => [`${v}%`]} />
                      <Legend />
                      <Area type="monotone" dataKey="cancelamentos" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.1)" strokeWidth={2} name="Cancelamentos" />
                      <Area type="monotone" dataKey="absenteismo" stroke="hsl(40,90%,55%)" fill="hsl(40,90%,55%,0.1)" strokeWidth={2} name="Absenteísmo" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* User growth */}
              <Card className="border-border">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Crescimento de Usuários</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={userGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="pacientes" stroke="hsl(var(--primary))" strokeWidth={2} name="Pacientes" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="medicos" stroke="hsl(var(--secondary))" strokeWidth={2} name="Médicos" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Specialty pie */}
              <Card className="border-border">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> Consultas por Especialidade</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center">
                  {specialtyData.length === 0 ? (
                    <p className="text-muted-foreground py-8">Sem dados de consultas concluídas.</p>
                  ) : (
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie data={specialtyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                            {specialtyData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1">
                        {specialtyData.map((s, i) => (
                          <div key={s.name} className="flex items-center gap-2 text-sm">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-foreground">{s.name}: {s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top rated doctors */}
            {topDoctors.length > 0 && (
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" /> Top Médicos (Avaliação)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topDoctors.map((d, i) => (
                      <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center ${i === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "text-muted-foreground"}`}>
                            #{i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{d.total_reviews} avaliações</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(d.rating)) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/20"}`} />
                          ))}
                          <span className="font-bold text-foreground ml-1">{Number(d.rating).toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminReports;
