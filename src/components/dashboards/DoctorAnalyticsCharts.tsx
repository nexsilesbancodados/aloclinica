import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line, PieChart, Pie, Cell } from "recharts";
import { format, subDays, startOfDay, getDay, getHours, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChartDataPoint } from "@/types/domain";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--accent))"];

const DoctorAnalyticsCharts = () => {
  const { user } = useAuth();
  const [weeklyData, setWeeklyData] = useState<ChartDataPoint[]>([]);
  const [ratingData, setRatingData] = useState<ChartDataPoint[]>([]);
  const [earningsData, setEarningsData] = useState<ChartDataPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<ChartDataPoint[]>([]);
  const [statusData, setStatusData] = useState<ChartDataPoint[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<ChartDataPoint[]>([]);
  const [patientDemographics, setPatientDemographics] = useState<ChartDataPoint[]>([]);
  const [summaryStats, setSummaryStats] = useState({ completionRate: 0, avgRating: 0, totalEarnings: 0, totalPatients: 0, returnRate: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [tab, setTab] = useState("performance");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setRefreshing(true);
    await fetchData();
    setLastUpdated(new Date());
    if (!silent) setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      refresh(true);
      intervalRef.current = setInterval(() => refresh(true), 60_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [user, refresh]);

  const fetchData = async () => {
    const { data: docProfile } = await db
      .from("doctor_profiles").select("id, price").eq("user_id", user!.id).single();
    if (!docProfile) { setLoading(false); return; }

    const price = Number(docProfile.price) || 89;
    const days = 7;
    const startDate = startOfDay(subDays(new Date(), days));

    const [apptsRes, surveysRes, allApptsRes, sixMonthRes] = await Promise.all([
      db.from("appointments").select("id, scheduled_at, status").eq("doctor_id", docProfile.id).gte("scheduled_at", startDate.toISOString()),
      db.from("satisfaction_surveys").select("nps_score, created_at").eq("doctor_id", docProfile.id).order("created_at", { ascending: true }).limit(20),
      db.from("appointments").select("scheduled_at, status, patient_id").eq("doctor_id", docProfile.id).gte("scheduled_at", subDays(new Date(), 60).toISOString()),
      db.from("appointments").select("scheduled_at, status, patient_id").eq("doctor_id", docProfile.id).gte("scheduled_at", subMonths(new Date(), 6).toISOString()),
    ]);

    // Weekly appointments
    const dayMap = new Map<string, { date: string; consultas: number; ganhos: number }>();
    for (let i = 0; i <= days; i++) {
      const d = format(subDays(new Date(), days - i), "EEE", { locale: ptBR });
      const key = format(subDays(new Date(), days - i), "yyyy-MM-dd");
      dayMap.set(key, { date: d, consultas: 0, ganhos: 0 });
    }
    (apptsRes.data ?? []).forEach((a) => {
      const key = format(new Date(a.scheduled_at), "yyyy-MM-dd");
      const entry = dayMap.get(key);
      if (entry && a.status === "completed") { entry.consultas++; entry.ganhos += price; }
    });
    setWeeklyData(Array.from(dayMap.values()));

    // Rating trend
    setRatingData((surveysRes.data ?? []).map((s) => ({
      date: format(new Date(s.created_at), "dd/MM", { locale: ptBR }), nota: s.nps_score,
    })));

    // Cumulative earnings
    const earningsMap = new Map<string, number>();
    for (let i = 3; i >= 0; i--) { earningsMap.set(format(subDays(new Date(), i * 7), "dd/MM", { locale: ptBR }), 0); }
    (allApptsRes.data ?? []).filter(a => a.status === "completed").forEach(a => {
      const wk = format(new Date(a.scheduled_at), "dd/MM", { locale: ptBR });
      if (earningsMap.has(wk)) earningsMap.set(wk, (earningsMap.get(wk) ?? 0) + price);
    });
    let cumEarnings = 0;
    setEarningsData(Array.from(earningsMap.entries()).map(([week, val]) => {
      cumEarnings += val;
      return { week, ganho: val, acumulado: cumEarnings };
    }));

    // Status breakdown
    const statusCount: Record<string, number> = {};
    const statusLabels: Record<string, string> = { completed: "Concluída", cancelled: "Cancelada", scheduled: "Agendada", no_show: "Ausente" };
    (allApptsRes.data ?? []).forEach(a => { statusCount[a.status] = (statusCount[a.status] || 0) + 1; });
    setStatusData(Object.entries(statusCount).map(([status, count]) => ({ name: statusLabels[status] || status, value: count })));

    // Monthly trend (6 months)
    const monthMap = new Map<string, { month: string; total: number; completed: number; revenue: number }>();
    for (let i = 5; i >= 0; i--) {
      const m = startOfMonth(subMonths(new Date(), i));
      const key = format(m, "yyyy-MM");
      monthMap.set(key, { month: format(m, "MMM", { locale: ptBR }), total: 0, completed: 0, revenue: 0 });
    }
    (sixMonthRes.data ?? []).forEach(a => {
      const key = format(new Date(a.scheduled_at), "yyyy-MM");
      const entry = monthMap.get(key);
      if (entry) {
        entry.total++;
        if (a.status === "completed") { entry.completed++; entry.revenue += price; }
      }
    });
    setMonthlyTrend(Array.from(monthMap.values()));

    // Patient demographics - returning vs new
    const patientFirstVisit = new Map<string, string>();
    (sixMonthRes.data ?? []).filter(a => a.patient_id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).forEach(a => {
      if (!patientFirstVisit.has(a.patient_id!)) patientFirstVisit.set(a.patient_id!, a.scheduled_at);
    });
    const returningPatients = (allApptsRes.data ?? []).filter(a => {
      if (!a.patient_id) return false;
      const first = patientFirstVisit.get(a.patient_id);
      return first && first !== a.scheduled_at;
    }).length;
    const newPatients = (allApptsRes.data ?? []).length - returningPatients;
    setPatientDemographics([
      { name: "Novos", value: Math.max(newPatients, 0) },
      { name: "Retorno", value: Math.max(returningPatients, 0) },
    ]);

    // Summary stats
    const total60 = allApptsRes.data?.length ?? 0;
    const completed60 = (allApptsRes.data ?? []).filter(a => a.status === "completed").length;
    const uniquePatients = new Set((allApptsRes.data ?? []).filter(a => a.patient_id).map(a => a.patient_id)).size;
    const avgNps = surveysRes.data && surveysRes.data.length > 0
      ? (surveysRes.data.reduce((acc, s) => acc + s.nps_score, 0) / surveysRes.data.length) : 0;
    const returnRate = total60 > 0 ? Math.round((returningPatients / total60) * 100) : 0;
    setSummaryStats({
      completionRate: total60 > 0 ? Math.round((completed60 / total60) * 100) : 0,
      avgRating: avgNps,
      totalEarnings: completed60 * price,
      totalPatients: uniquePatients,
      returnRate,
    });

    // Heatmap
    const heatGrid: Record<string, number> = {};
    (allApptsRes.data ?? []).forEach(a => {
      const dt = new Date(a.scheduled_at);
      heatGrid[`${getDay(dt)}-${getHours(dt)}`] = (heatGrid[`${getDay(dt)}-${getHours(dt)}`] || 0) + 1;
    });
    const heatArr: any[] = [];
    for (let d = 0; d < 7; d++) for (let h = 6; h <= 22; h++) heatArr.push({ day: DAYS[d], hour: `${h}h`, count: heatGrid[`${d}-${h}`] || 0, x: h, y: d });
    setHeatmapData(heatArr);

    setLoading(false);
  };

  if (loading) return null;

  const ts = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" };

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Atualizado: {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          <span className="ml-1 text-[10px]">(auto-refresh 60s)</span>
        </p>
        <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={refreshing} className="h-7 text-xs gap-1">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Taxa de Conclusão", value: `${summaryStats.completionRate}%`, color: summaryStats.completionRate >= 80 ? "text-emerald-500" : "text-amber-500" },
          { label: "NPS Médio", value: summaryStats.avgRating > 0 ? summaryStats.avgRating.toFixed(1) : "—", color: "text-primary" },
          { label: "Ganhos (60d)", value: `R$${summaryStats.totalEarnings.toLocaleString("pt-BR")}`, color: "text-emerald-500" },
          { label: "Pacientes Únicos", value: String(summaryStats.totalPatients), color: "text-primary" },
          { label: "Taxa de Retorno", value: `${summaryStats.returnRate}%`, color: summaryStats.returnRate >= 30 ? "text-emerald-500" : "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-card border border-border p-3 text-center">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 border border-border/40 h-9 mb-3">
          <TabsTrigger value="performance" className="text-xs data-[state=active]:bg-card">📊 Desempenho</TabsTrigger>
          <TabsTrigger value="earnings" className="text-xs data-[state=active]:bg-card">💰 Ganhos</TabsTrigger>
          <TabsTrigger value="patients" className="text-xs data-[state=active]:bg-card">👥 Pacientes</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs data-[state=active]:bg-card">🗓️ Horários</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-0">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="border-border">
              <CardHeader><CardTitle className="text-base">📊 Semana (concluídas)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={ts} />
                      <Bar dataKey="consultas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Consultas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {statusData.length > 0 && (
              <Card className="border-border">
                <CardHeader><CardTitle className="text-base">📈 Status (60 dias)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" outerRadius={65} innerRadius={30} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                          {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={ts} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {ratingData.length > 0 && (
              <Card className="border-border sm:col-span-2">
                <CardHeader><CardTitle className="text-base">⭐ Avaliações recentes</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ratingData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 10]} fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={ts} />
                        <Area type="monotone" dataKey="nota" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary))" fillOpacity={0.2} name="NPS" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="earnings" className="mt-0">
          <div className="grid sm:grid-cols-2 gap-4">
            {earningsData.length > 0 && (
              <Card className="border-border sm:col-span-2">
                <CardHeader><CardTitle className="text-base">💰 Ganhos Acumulados (4 semanas)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={earningsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="week" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${v}`} />
                        <Tooltip contentStyle={ts} formatter={(v: number) => [`R$ ${v.toFixed(0)}`, ""]} />
                        <Bar dataKey="ganho" fill="hsl(var(--primary) / 0.3)" name="Semanal" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="acumulado" stroke="hsl(var(--primary))" strokeWidth={2} name="Acumulado" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {monthlyTrend.length > 0 && (
              <Card className="border-border sm:col-span-2">
                <CardHeader><CardTitle className="text-base">📈 Tendência Mensal (6 meses)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="left" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="right" orientation="right" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${v}`} />
                        <Tooltip contentStyle={ts} />
                        <Bar yAxisId="left" dataKey="completed" fill="hsl(var(--primary))" name="Concluídas" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="total" fill="hsl(var(--muted-foreground) / 0.2)" name="Total" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--secondary))" strokeWidth={2} name="Receita" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="patients" className="mt-0">
          <div className="grid sm:grid-cols-2 gap-4">
            {patientDemographics.length > 0 && patientDemographics.some(d => d.value > 0) && (
              <Card className="border-border">
                <CardHeader><CardTitle className="text-base">👥 Novos vs Retorno (60 dias)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={patientDemographics} cx="50%" cy="50%" outerRadius={65} innerRadius={30} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={10}>
                          <Cell fill="hsl(var(--primary))" />
                          <Cell fill="hsl(var(--secondary))" />
                        </Pie>
                        <Tooltip contentStyle={ts} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {monthlyTrend.length > 0 && (
              <Card className="border-border">
                <CardHeader><CardTitle className="text-base">📊 Volume Mensal</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={ts} />
                        <Bar dataKey="total" fill="hsl(var(--primary) / 0.3)" name="Total" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="completed" fill="hsl(var(--primary))" name="Concluídas" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="mt-0">
          <Card className="border-border">
            <CardHeader><CardTitle className="text-base">🗓️ Seus Horários de Pico</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[400px]">
                  <div className="flex ml-10 mb-1">
                    {Array.from({ length: 17 }, (_, i) => i + 6).map(h => (
                      <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">{h}h</div>
                    ))}
                  </div>
                  {DAYS.map((dayName, dayIdx) => (
                    <div key={dayName} className="flex items-center gap-0.5 mb-0.5">
                      <span className="w-8 text-[10px] text-muted-foreground text-right pr-1">{dayName}</span>
                      {Array.from({ length: 17 }, (_, i) => i + 6).map(h => {
                        const cell = heatmapData.find(c => c.y === dayIdx && c.x === h);
                        const count = cell?.count ?? 0;
                        const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                        const intensity = count / maxCount;
                        return (
                          <div
                            key={h}
                            className="flex-1 aspect-square rounded-[2px] transition-colors"
                            style={{ backgroundColor: count === 0 ? "hsl(var(--muted) / 0.3)" : `hsl(var(--primary) / ${0.15 + intensity * 0.85})` }}
                            title={`${dayName} ${h}h: ${count} consulta${count !== 1 ? "s" : ""}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <span className="text-[9px] text-muted-foreground">Menos</span>
                    {[0.15, 0.35, 0.55, 0.75, 1].map((op, i) => (
                      <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: `hsl(var(--primary) / ${op})` }} />
                    ))}
                    <span className="text-[9px] text-muted-foreground">Mais</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DoctorAnalyticsCharts;
