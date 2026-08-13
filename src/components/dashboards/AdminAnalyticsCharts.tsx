import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from "@/integrations/supabase/untyped";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart,
  ScatterChart, Scatter, ZAxis, Legend,
} from "recharts";
import { format, subDays, startOfDay, getDay, getHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChartDataPoint } from "@/types/domain";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))", "hsl(var(--warning))",
];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const AdminAnalyticsCharts = () => {
   
  const [dailyAppts, setDailyAppts] = useState<ChartDataPoint[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<ChartDataPoint[]>([]);
  const [specialtyData, setSpecialtyData] = useState<ChartDataPoint[]>([]);
  const [revenueData, setRevenueData] = useState<ChartDataPoint[]>([]);
  const [patientGrowth, setPatientGrowth] = useState<ChartDataPoint[]>([]);
  const [retentionData, setRetentionData] = useState<ChartDataPoint[]>([]);
  const [funnelData, setFunnelData] = useState<ChartDataPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<ChartDataPoint[]>([]);
  const [npsTrend, setNpsTrend] = useState<ChartDataPoint[]>([]);
  const [urgentCareData, setUrgentCareData] = useState<ChartDataPoint[]>([]);
  const [renewalData, setRenewalData] = useState<ChartDataPoint[]>([]);
  const [specialtyRevenueData, setSpecialtyRevenueData] = useState<ChartDataPoint[]>([]);
  const [specialtyConversionData, setSpecialtyConversionData] = useState<ChartDataPoint[]>([]);
  const [doctorPerformanceData, setDoctorPerformanceData] = useState<ChartDataPoint[]>([]);
   
  const [urgentCareKPIs, setUrgentCareKPIs] = useState({ total: 0, waiting: 0, completed: 0, refunded: 0, avgWait: 0, revenue: 0 });
  const [renewalKPIs, setRenewalKPIs] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, avgReviewDays: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [tab, setTab] = useState("overview");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const refreshAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    await Promise.all([fetchChartData(), fetchNewFlowsData(), fetchSpecialtyReports()]);
    setLastUpdated(new Date());
    if (!silent) setRefreshing(false);
  }, []);

  useEffect(() => {
    refreshAll(true);
    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(() => refreshAll(true), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshAll]);

  const fetchChartData = async () => {
    const days = 14;
    const startDate = startOfDay(subDays(new Date(), days));

    const [apptsRes, specsRes, docSpecsRes, subsRes, profilesRes, allApptsRes, surveysRes, allApptsHeatRes] = await Promise.all([
      db.from("appointments").select("id, scheduled_at, status").gte("scheduled_at", startDate.toISOString()).order("scheduled_at", { ascending: true }),
      db.from("specialties").select("id, name"),
      db.from("doctor_specialties").select("doctor_id, specialty_id"),
      db.from("subscriptions").select("id, created_at, status, plan_id").order("created_at", { ascending: true }),
      db.from("profiles").select("id, created_at").order("created_at", { ascending: true }),
      db.from("appointments").select("id, status, patient_id").order("scheduled_at", { ascending: false }).limit(500),
      db.from("satisfaction_surveys").select("nps_score, created_at").order("created_at", { ascending: true }),
      db.from("appointments").select("scheduled_at").gte("scheduled_at", subDays(new Date(), 90).toISOString()),
    ]);

    // Daily appointments
    const dayMap = new Map<string, { date: string; total: number; completed: number; cancelled: number }>();
    for (let i = 0; i <= days; i++) {
      const d = format(subDays(new Date(), days - i), "dd/MM", { locale: ptBR });
      dayMap.set(d, { date: d, total: 0, completed: 0, cancelled: 0 });
    }
    (apptsRes.data ?? []).forEach((a) => {
      const d = format(new Date(a.scheduled_at), "dd/MM", { locale: ptBR });
      const entry = dayMap.get(d);
      if (entry) { entry.total++; if (a.status === "completed") entry.completed++; if (a.status === "cancelled") entry.cancelled++; }
    });
    setDailyAppts(Array.from(dayMap.values()));

    // Status pie
    const statusCount: Record<string, number> = {};
    (apptsRes.data ?? []).forEach((a) => { statusCount[a.status] = (statusCount[a.status] || 0) + 1; });
    const statusLabels: Record<string, string> = { scheduled: "Agendada", completed: "Concluída", cancelled: "Cancelada", in_progress: "Em andamento", waiting: "Esperando", no_show: "Ausente" };
    setStatusBreakdown(Object.entries(statusCount).map(([status, count]) => ({ name: statusLabels[status] || status, value: count })));

    // Specialty distribution
    const specMap = new Map((specsRes.data ?? []).map((s: any) => [s.id, s.name]));
    const specCount: Record<string, number> = {};
    (docSpecsRes.data ?? []).forEach((ds: any) => { const name = specMap.get(ds.specialty_id as string) || "Outro"; specCount[name as string] = ((specCount[name as string]) || 0) + 1; });
    setSpecialtyData(Object.entries(specCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })));

    // Revenue
    const { data: plans } = await db.from("plans").select("id, price");
    const planPriceMap = new Map((plans as any[])?.map((p: any) => [p.id, Number(p.price)]) ?? []);
    const revenueByMonth = new Map<string, number>();
    for (let i = 5; i >= 0; i--) { revenueByMonth.set(format(subDays(new Date(), i * 30), "MMM/yy", { locale: ptBR }), 0); }
    (subsRes.data ?? []).filter((s: any) => s.status === "active").forEach((s: any) => {
      const mk = format(new Date(s.created_at), "MMM/yy", { locale: ptBR });
      if (revenueByMonth.has(mk)) revenueByMonth.set(mk, (revenueByMonth.get(mk) ?? 0) + (planPriceMap.get(s.plan_id) ?? 0));
    });
    setRevenueData(Array.from(revenueByMonth.entries()).map(([month, revenue]) => ({ month, revenue })));

    // Patient growth
    const growthByMonth = new Map<string, number>();
    for (let i = 5; i >= 0; i--) { growthByMonth.set(format(subDays(new Date(), i * 30), "MMM/yy", { locale: ptBR }), 0); }
    (profilesRes.data ?? []).forEach(p => {
      const mk = format(new Date(p.created_at), "MMM/yy", { locale: ptBR });
      if (growthByMonth.has(mk)) growthByMonth.set(mk, (growthByMonth.get(mk) ?? 0) + 1);
    });
    let cum = 0;
    setPatientGrowth(Array.from(growthByMonth.entries()).map(([month, count]) => { cum += count; return { month, novos: count, total: cum }; }));

    // Retention
    const completedByPatient = new Map<string, number>();
    (allApptsRes.data ?? []).filter(a => a.status === "completed" && a.patient_id).forEach(a => {
      completedByPatient.set(a.patient_id!, (completedByPatient.get(a.patient_id!) ?? 0) + 1);
    });
    const totalP = completedByPatient.size;
    const returning = [...completedByPatient.values()].filter(c => c >= 2).length;
    const loyal = [...completedByPatient.values()].filter(c => c >= 4).length;
    setRetentionData([
      { name: "Primeira consulta", value: totalP, fill: "hsl(var(--primary) / 0.3)" },
      { name: "Retorno (2+)", value: returning, fill: "hsl(var(--secondary))" },
      { name: "Fiel (4+)", value: loyal, fill: "hsl(var(--primary))" },
    ]);

    // Conversion funnel
    const totalProfiles = profilesRes.data?.length ?? 0;
    const scheduled = (allApptsRes.data ?? []).filter(a => ["scheduled", "completed", "in_progress", "waiting"].includes(a.status)).length;
    const completed = (allApptsRes.data ?? []).filter(a => a.status === "completed").length;
    const surveyed = surveysRes.data?.length ?? 0;
    setFunnelData([
      { stage: "Cadastro", count: totalProfiles },
      { stage: "Agendou", count: scheduled },
      { stage: "Concluiu", count: completed },
      { stage: "Avaliou", count: surveyed },
    ]);

    // Heatmap: day x hour
    const heatGrid: Record<string, number> = {};
    (allApptsHeatRes.data ?? []).forEach(a => {
      const dt = new Date(a.scheduled_at);
      const day = getDay(dt);
      const hour = getHours(dt);
      const key = `${day}-${hour}`;
      heatGrid[key] = (heatGrid[key] || 0) + 1;
    });
    const heatArr: any[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 6; h <= 22; h++) {
        heatArr.push({ day: DAYS[d], hour: `${h}h`, count: heatGrid[`${d}-${h}`] || 0, x: h, y: d });
      }
    }
    setHeatmapData(heatArr);

    // NPS trend (grouped by week)
    const npsGrouped = new Map<string, { total: number; count: number }>();
    (surveysRes.data ?? []).forEach(s => {
      const wk = format(new Date(s.created_at), "dd/MM", { locale: ptBR });
      const entry = npsGrouped.get(wk) || { total: 0, count: 0 };
      entry.total += s.nps_score;
      entry.count++;
      npsGrouped.set(wk, entry);
    });
    setNpsTrend(Array.from(npsGrouped.entries()).map(([date, v]) => ({ date, nps: +(v.total / v.count).toFixed(1) })));

    setLoading(false);
  };

  const fetchNewFlowsData = async () => {
    // Urgent care (on_demand_queue)
    const { data: queueData } = await db.from("on_demand_queue").select("*").order("created_at", { ascending: true });
    const queueItems = queueData ?? [];
    
    // KPIs
    const ucTotal = queueItems.length;
    const ucWaiting = queueItems.filter(q => q.status === "waiting").length;
    const ucCompleted = queueItems.filter(q => q.status === "in_progress" || q.status === "completed").length;
    const ucRefunded = queueItems.filter(q => q.status === "refunded").length;
    const ucRevenue = queueItems.filter(q => q.status !== "refunded").reduce((sum, q) => sum + Number(q.price), 0);
    
    // Avg wait time (from created_at to assigned_at)
    const assignedItems = queueItems.filter(q => q.assigned_at && q.created_at);
    const avgWaitMs = assignedItems.length > 0
      ? assignedItems.reduce((sum, q) => sum + (new Date(q.assigned_at!).getTime() - new Date(q.created_at).getTime()), 0) / assignedItems.length
      : 0;
    
    setUrgentCareKPIs({ total: ucTotal, waiting: ucWaiting, completed: ucCompleted, refunded: ucRefunded, avgWait: Math.round(avgWaitMs / 60000), revenue: ucRevenue });

    // Daily urgent care by shift
    const shiftCount: Record<string, { day: number; night: number; dawn: number }> = {};
    queueItems.forEach(q => {
      const d = format(new Date(q.created_at), "dd/MM", { locale: ptBR });
      if (!shiftCount[d]) shiftCount[d] = { day: 0, night: 0, dawn: 0 };
      if (q.shift === "day") shiftCount[d].day++;
      else if (q.shift === "night") shiftCount[d].night++;
      else shiftCount[d].dawn++;
    });
    setUrgentCareData(Object.entries(shiftCount).slice(-14).map(([date, shifts]) => ({ date, ...shifts })));

    // Prescription renewals
    const { data: renewals } = await db.from("prescription_renewals").select("*").order("created_at", { ascending: true });
    const renewalItems = renewals ?? [];
    
    const rnTotal = renewalItems.length;
    const rnPending = renewalItems.filter(r => r.status === "pending" || r.status === "in_review").length;
    const rnApproved = renewalItems.filter(r => r.status === "approved").length;
    const rnRejected = renewalItems.filter(r => r.status === "rejected").length;
    
    const reviewedItems = renewalItems.filter(r => r.reviewed_at && r.created_at);
    const avgReviewMs = reviewedItems.length > 0
      ? reviewedItems.reduce((sum, r) => sum + (new Date(r.reviewed_at!).getTime() - new Date(r.created_at).getTime()), 0) / reviewedItems.length
      : 0;
    
    setRenewalKPIs({ total: rnTotal, pending: rnPending, approved: rnApproved, rejected: rnRejected, avgReviewDays: +(avgReviewMs / 86400000).toFixed(1) });

    setRenewalData([
      { name: "Pendentes", value: rnPending, fill: "hsl(var(--muted-foreground))" },
      { name: "Aprovadas", value: rnApproved, fill: "hsl(var(--secondary))" },
      { name: "Rejeitadas", value: rnRejected, fill: "hsl(var(--destructive))" },
    ].filter(d => d.value > 0));
  };

  const fetchSpecialtyReports = async () => {
    // Specialty revenue: appointments by specialty with revenue estimation
    const [apptsRes, docSpecsRes, specsRes, surveysRes, docsRes, profilesRes] = await Promise.all([
      db.from("appointments").select("id, doctor_id, status, scheduled_at").order("scheduled_at", { ascending: false }).limit(1000),
      db.from("doctor_specialties").select("doctor_id, specialty_id"),
      db.from("specialties").select("id, name, consultation_price"),
      db.from("satisfaction_surveys").select("doctor_id, nps_score, quality_score, ease_score"),
      db.from("doctor_profiles").select("id, user_id, price, rating_avg, rating_count"),
      db.from("profiles").select("user_id, first_name, last_name"),
    ]);

    const appts = apptsRes.data ?? [];
    const docSpecs = docSpecsRes.data ?? [];
    const specs = specsRes.data ?? [];
    const surveys = surveysRes.data ?? [];
    const docs = docsRes.data ?? [];
    const profiles = profilesRes.data ?? [];

    const specMap = new Map(specs.map(s => [s.id, { name: s.name, price: Number(s.consultation_price ?? 89) }]));
    const docSpecMap = new Map<string, string[]>();
    docSpecs.forEach(ds => {
      const existing = docSpecMap.get(ds.doctor_id) ?? [];
      existing.push(ds.specialty_id);
      docSpecMap.set(ds.doctor_id, existing);
    });

    // Revenue by specialty
    const specRevenue: Record<string, { name: string; total: number; completed: number; cancelled: number; revenue: number }> = {};
    appts.forEach(a => {
      const specIds = docSpecMap.get(a.doctor_id) ?? [];
      specIds.forEach(sid => {
        const spec = specMap.get(sid) as any;
        if (!spec) return;
        if (!specRevenue[sid]) specRevenue[sid] = { name: spec.name, total: 0, completed: 0, cancelled: 0, revenue: 0 };
        specRevenue[sid].total++;
        if (a.status === "completed") { specRevenue[sid].completed++; specRevenue[sid].revenue += spec.price; }
        if (a.status === "cancelled") specRevenue[sid].cancelled++;
      });
    });
    setSpecialtyRevenueData(Object.values(specRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 8));

    // Conversion by specialty (completed / total)
    setSpecialtyConversionData(
      Object.values(specRevenue)
        .filter(s => s.total >= 1)
        .map(s => ({
          name: s.name,
          taxa: s.total > 0 ? +((s.completed / s.total) * 100).toFixed(1) : 0,
          total: s.total,
          concluidas: s.completed,
        }))
        .sort((a, b) => b.taxa - a.taxa)
        .slice(0, 8)
    );

    // Doctor performance (top 10 by completed)
    const nameMap = new Map(profiles.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]));
    const docAppts: Record<string, number> = {};
    appts.filter(a => a.status === "completed").forEach(a => { docAppts[a.doctor_id] = (docAppts[a.doctor_id] ?? 0) + 1; });

    const docPerf = docs.map(d => ({
      name: nameMap.get(d.user_id) ?? "Dr(a).",
      consultas: docAppts[d.id] ?? 0,
      rating: Number(d.rating_avg ?? 0),
      reviews: d.rating_count ?? 0,
    })).sort((a, b) => b.consultas - a.consultas).slice(0, 10);
    setDoctorPerformanceData(docPerf);
  };

  if (loading) return null;

  const ts = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--foreground))",
  };

  return (
    <div className="mb-6" role="region" aria-label="Gráficos de análise">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Atualizado: {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          <span className="ml-1 text-[10px]">(auto-refresh 60s)</span>
        </p>
        <Button variant="ghost" size="sm" onClick={() => refreshAll()} disabled={refreshing} className="h-7 text-xs gap-1">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-muted/50 border border-border/40 h-9 mb-4 flex-wrap">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">📊 Visão Geral</TabsTrigger>
          <TabsTrigger value="specialty" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">🩺 Especialidades</TabsTrigger>
          <TabsTrigger value="newflows" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">🚨 Plantão & Renovação</TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">🎯 Funil & Retenção</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">🗓️ Mapa de Calor</TabsTrigger>
          <TabsTrigger value="nps" className="text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">⭐ NPS & Satisfação</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Daily appointments */}
            <Card className="border-border lg:col-span-2">
              <CardHeader><CardTitle className="text-base sm:text-lg">📈 Consultas por Dia (14 dias)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyAppts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={ts} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Total" dot={false} />
                      <Line type="monotone" dataKey="completed" stroke="hsl(var(--secondary))" strokeWidth={2} name="Concluídas" dot={false} />
                      <Line type="monotone" dataKey="cancelled" stroke="hsl(var(--destructive))" strokeWidth={2} name="Canceladas" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">💰 Receita Mensal (MRR)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]} contentStyle={ts} />
                      <Area type="monotone" dataKey="revenue" stroke="hsl(var(--secondary))" fill="url(#revenueGrad)" strokeWidth={2} name="Receita" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Patient growth */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">👥 Crescimento de Pacientes</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={patientGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={ts} />
                      <Bar dataKey="novos" fill="hsl(var(--primary) / 0.3)" name="Novos no mês" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Total acumulado" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Status pie */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">📊 Status das Consultas</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                        {statusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={ts} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Specialty distribution */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">🩺 Médicos por Especialidade</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={specialtyData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={100} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={ts} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Médicos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Specialty Reports Tab ── */}
        <TabsContent value="specialty" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Revenue by Specialty */}
            <Card className="border-border lg:col-span-2">
              <CardHeader><CardTitle className="text-base sm:text-lg">💰 Receita por Especialidade</CardTitle></CardHeader>
              <CardContent>
                {specialtyRevenueData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Sem dados suficientes ainda.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={specialtyRevenueData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} angle={-20} textAnchor="end" height={60} />
                        <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v}`} />
                        <Tooltip contentStyle={ts} formatter={(v: number, name: string) => [name === "revenue" ? `R$ ${v.toFixed(0)}` : v, name === "revenue" ? "Receita" : name === "completed" ? "Concluídas" : "Canceladas"]} />
                        <Legend />
                        <Bar dataKey="revenue" fill="hsl(var(--secondary))" name="Receita (R$)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conversion by Specialty */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">🎯 Taxa de Conversão por Especialidade</CardTitle></CardHeader>
              <CardContent>
                {specialtyConversionData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Sem dados.</p>
                ) : (
                  <div className="space-y-3">
                    {specialtyConversionData.map((s) => (
                      <div key={s.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span className="font-semibold text-foreground">
                            {s.taxa}%
                            <span className="text-xs text-muted-foreground ml-1">({s.concluidas}/{s.total})</span>
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.max(s.taxa, 2)}%`,
                              background: s.taxa >= 70 ? "hsl(var(--secondary))" : s.taxa >= 40 ? "hsl(var(--primary))" : "hsl(var(--destructive))",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Doctor Performance Ranking */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">🏆 Ranking de Médicos</CardTitle></CardHeader>
              <CardContent>
                {doctorPerformanceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Sem dados.</p>
                ) : (
                  <div className="space-y-2">
                    {doctorPerformanceData.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? "bg-yellow-500/20 text-yellow-600" :
                          i === 1 ? "bg-gray-400/20 text-gray-500" :
                          i === 2 ? "bg-orange-500/20 text-orange-600" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.consultas} consultas • ⭐ {d.rating.toFixed(1)} ({d.reviews})</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── New Flows Tab (Plantão & Renovação) ── */}
        <TabsContent value="newflows" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Urgent Care KPIs */}
            <Card className="border-border lg:col-span-2">
              <CardHeader><CardTitle className="text-base sm:text-lg">🚨 Plantão 24h — KPIs</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {[
                    { label: "Total", value: urgentCareKPIs.total, color: "text-foreground" },
                    { label: "Aguardando", value: urgentCareKPIs.waiting, color: "text-warning" },
                    { label: "Atendidos", value: urgentCareKPIs.completed, color: "text-secondary" },
                    { label: "Reembolsados", value: urgentCareKPIs.refunded, color: "text-destructive" },
                    { label: "Espera Média", value: `${urgentCareKPIs.avgWait} min`, color: "text-primary" },
                    { label: "Receita", value: `R$ ${urgentCareKPIs.revenue.toFixed(0)}`, color: "text-secondary" },
                  ].map(kpi => (
                    <div key={kpi.label} className="text-center">
                      <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Urgent Care by Shift */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">☀️ Plantão por Turno (14 dias)</CardTitle></CardHeader>
              <CardContent>
                {urgentCareData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Sem dados de plantão ainda.</p>
                ) : (
                  <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={urgentCareData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={ts} />
                        <Legend />
                        <Bar dataKey="day" stackId="a" fill="hsl(var(--primary))" name="Diurno" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="night" stackId="a" fill="hsl(var(--secondary))" name="Noturno" />
                        <Bar dataKey="dawn" stackId="a" fill="hsl(var(--destructive))" name="Madrugada" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Renewal KPIs + Pie */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">💊 Renovações de Receita</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: "Total", value: renewalKPIs.total, color: "text-foreground" },
                    { label: "Pendentes", value: renewalKPIs.pending, color: "text-warning" },
                    { label: "Aprovadas", value: renewalKPIs.approved, color: "text-secondary" },
                    { label: "Tempo Médio", value: `${renewalKPIs.avgReviewDays}d`, color: "text-primary" },
                  ].map(kpi => (
                    <div key={kpi.label} className="text-center">
                      <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                  ))}
                </div>
                {renewalData.length > 0 && (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={renewalData} cx="50%" cy="50%" outerRadius={55} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                          {renewalData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={ts} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Funnel & Retention Tab ── */}
        <TabsContent value="funnel" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Conversion Funnel */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">🎯 Funil de Conversão</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {funnelData.map((stage, i) => {
                    const maxVal = funnelData[0]?.count || 1;
                    const pct = maxVal > 0 ? (stage.count / maxVal) * 100 : 0;
                    const prevPct = i > 0 && funnelData[i - 1].count > 0
                      ? ((stage.count / funnelData[i - 1].count) * 100).toFixed(0)
                      : null;
                    const colors = ["primary", "secondary", "primary", "warning"];
                    return (
                      <div key={stage.stage} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{stage.stage}</span>
                          <span className="font-semibold text-foreground">
                            {stage.count}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({pct.toFixed(0)}%{prevPct ? ` · ${prevPct}% da etapa anterior` : ""})
                            </span>
                          </span>
                        </div>
                        <div className="h-4 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%`, background: `hsl(var(--${colors[i]}) / ${1 - i * 0.15})` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Retention */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">🔁 Retenção de Pacientes</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={retentionData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={110} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={ts} />
                      <Bar dataKey="value" name="Pacientes" radius={[0, 6, 6, 0]}>
                        {retentionData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Heatmap Tab ── */}
        <TabsContent value="heatmap" className="mt-0">
          <Card className="border-border">
            <CardHeader><CardTitle className="text-base sm:text-lg">🗓️ Mapa de Calor — Horários de Pico (90 dias)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Hour labels */}
                  <div className="flex ml-12 mb-1">
                    {Array.from({ length: 17 }, (_, i) => i + 6).map(h => (
                      <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">{h}h</div>
                    ))}
                  </div>
                  {/* Grid rows */}
                  {DAYS.map((dayName, dayIdx) => (
                    <div key={dayName} className="flex items-center gap-1 mb-1">
                      <span className="w-10 text-xs text-muted-foreground text-right pr-1">{dayName}</span>
                      {Array.from({ length: 17 }, (_, i) => i + 6).map(h => {
                        const cell = heatmapData.find(c => c.y === dayIdx && c.x === h);
                        const count = cell?.count ?? 0;
                        const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                        const intensity = count / maxCount;
                        return (
                          <div
                            key={h}
                            className="flex-1 aspect-square rounded-sm transition-colors cursor-default"
                            style={{
                              backgroundColor: count === 0
                                ? "hsl(var(--muted) / 0.3)"
                                : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`,
                            }}
                            title={`${dayName} ${h}h: ${count} consulta${count !== 1 ? "s" : ""}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <span className="text-[10px] text-muted-foreground">Menos</span>
                    {[0.15, 0.35, 0.55, 0.75, 1].map((op, i) => (
                      <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `hsl(var(--primary) / ${op})` }} />
                    ))}
                    <span className="text-[10px] text-muted-foreground">Mais</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── NPS Tab ── */}
        <TabsContent value="nps" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">⭐ Tendência de NPS</CardTitle></CardHeader>
              <CardContent>
                {npsTrend.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">Sem dados de NPS ainda. As avaliações aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={npsTrend}>
                        <defs>
                          <linearGradient id="npsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 10]} fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={ts} formatter={(v: number) => [v.toFixed(1), "NPS médio"]} />
                        <Area type="monotone" dataKey="nps" stroke="hsl(var(--warning))" fill="url(#npsGrad)" strokeWidth={2} name="NPS" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Churn Rate */}
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base sm:text-lg">📉 Churn & LTV</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(() => {
                    const totalPatients = retentionData.find(r => r.name === "Primeira consulta")?.value ?? 0;
                    const returning = retentionData.find(r => r.name === "Retorno (2+)")?.value ?? 0;
                    const loyal = retentionData.find(r => r.name === "Fiel (4+)")?.value ?? 0;
                    const churnRate = totalPatients > 0 ? ((totalPatients - returning) / totalPatients * 100) : 0;
                    const retentionRate = totalPatients > 0 ? (returning / totalPatients * 100) : 0;
                    const avgRevenue = revenueData.length > 0 ? revenueData.reduce((a, r) => a + r.revenue, 0) / revenueData.length : 0;
                    const ltv = churnRate > 0 ? (avgRevenue / (churnRate / 100)) : avgRevenue * 12;

                    const metrics = [
                      { label: "Taxa de Churn", value: `${churnRate.toFixed(1)}%`, desc: "Pacientes que não retornaram", color: churnRate > 50 ? "text-destructive" : churnRate > 30 ? "text-warning" : "text-success" },
                      { label: "Taxa de Retenção", value: `${retentionRate.toFixed(1)}%`, desc: "Pacientes que voltaram 2+ vezes", color: "text-primary" },
                      { label: "Pacientes Fiéis", value: loyal.toString(), desc: "4+ consultas realizadas", color: "text-secondary" },
                      { label: "LTV Estimado", value: `R$ ${ltv.toFixed(0)}`, desc: "Lifetime Value médio por paciente", color: "text-success" },
                    ];

                    return metrics.map((m) => (
                      <div key={m.label} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                        <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAnalyticsCharts;
