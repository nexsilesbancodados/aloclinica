import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "./DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, BarChart3, Settings, Stethoscope, Clock, DollarSign, TrendingUp, FileText, Sparkles, SlidersHorizontal, Download, ClipboardList } from "lucide-react";
// jsPDF loaded dynamically on export
import { toast } from "sonner";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { motion } from "framer-motion";
import { useGsapEntrance } from "@/hooks/use-gsap-entrance";
import { getClinicNav } from "@/components/clinic/clinicNav";
import { HeroBanner } from "./HeroBanner";
import { StatBento } from "./StatBento";
import { ActionPills } from "./ActionPills";
import { PingoBannerCard } from "@/components/mascot/PingoBannerCard";
import { PremiumHero } from "./PremiumHero";
import { DoctorRanking } from "./DoctorRanking";
import pingoAdmin from "@/assets/pingo-admin.png";

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--warning))", "hsl(var(--destructive))"];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

const ClinicDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const kpiRef = useGsapEntrance({ stagger: 0.07, y: 14, delay: 0.2 });
  const location = useLocation();
  const [clinicProfile, setClinicProfile] = useState<{ id: string; name: string; cnpj?: string | null; address?: string | null; phone?: string | null } | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [totalSlots, setTotalSlots] = useState(0);
  const [loading, setLoading] = useState(true);

  // Route-based active nav detection
  const pathSegment = location.pathname.split("/").pop() || "";
  const activeNav = ["schedules", "patients", "waiting-room", "finance", "reports", "doctors", "my-exams", "exam-request"].includes(pathSegment) ? pathSegment : "overview";
  const defaultTab = pathSegment === "finance" ? "finance" : pathSegment === "reports" ? "performance" : "overview";

  useEffect(() => { if (user) fetchData(); }, [user]);

  // Real-time appointment updates
  useEffect(() => {
    if (!clinicProfile) return;
    const doctorIds = doctors.filter(d => d.status === "active").map(d => d.doctor_id);
    if (doctorIds.length === 0) return;
    const channel = db
      .channel("clinic-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (payload) => {
        const row = payload.new as any;
        if (row && doctorIds.includes(row.doctor_id)) fetchData();
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [clinicProfile, doctors]);

  const fetchData = async () => {
    setLoading(true);
    const { data: clinic } = await db.from("clinic_profiles").select("*").eq("user_id", user!.id).single();
    setClinicProfile(clinic);
    if (!clinic) { setLoading(false); return; }
    const { data: affiliations } = await db.from("clinic_affiliations").select("*, doctor_profiles(*, profiles(first_name, last_name))").eq("clinic_id", clinic.id);
    setDoctors(affiliations ?? []);
    const doctorIds = (affiliations ?? []).map((a: { doctor_id: string }) => a.doctor_id);
    if (doctorIds.length > 0) {
      // Limit 2000 — protege contra clínicas com milhares de consultas em 6m
      const { data: appts } = await db.from("appointments")
        .select("*, doctor_profiles(consultation_price)")
        .in("doctor_id", doctorIds)
        .gte("scheduled_at", subMonths(new Date(), 6).toISOString())
        .order("scheduled_at", { ascending: false })
        .limit(2000);
      setAppointments(appts ?? []);

      // Calculate total slots from availability_slots table
      const monthStart = startOfMonth(new Date());
      const { data: slots, error: slotsError } = await db
        .from("availability_slots")
        .select("id", { count: "exact", head: true })
        .in("doctor_id", doctorIds)
        .gte("date", monthStart.toISOString());

      if (!slotsError && slots) {
        setTotalSlots(slots.length > 0 ? slots.length : doctorIds.length * 20);
      } else {
        setTotalSlots(doctorIds.length * 20);
      }
    } else {
      setTotalSlots(0);
    }
    setLoading(false);
  };

  const now = new Date();
  const monthStart = startOfMonth(now);
  const thisMonthAppts = appointments.filter(a => new Date(a.scheduled_at) >= monthStart);
  const completed = thisMonthAppts.filter(a => a.status === "completed");
  const revenue = completed.reduce((sum, a) => sum + (a.doctor_profiles?.consultation_price ?? 89), 0);
  const activeDoctors = doctors.filter(d => d.status === "active").length;
  const occupancy = totalSlots > 0 ? Math.round((thisMonthAppts.length / totalSlots) * 100) : 0;
  const upcomingAppts = appointments.filter(a => new Date(a.scheduled_at) >= now && a.status !== "cancelled").slice(0, 5);

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i);
    const ms = startOfMonth(month);
    const me = startOfMonth(subMonths(now, 4 - i));
    const ma = appointments.filter(a => { const d = new Date(a.scheduled_at); return d >= ms && (i < 5 ? d < me : true); });
    return { month: format(month, "MMM", { locale: ptBR }), consultas: ma.length, receita: ma.filter(a => a.status === "completed").reduce((s, a) => s + (a.doctor_profiles?.consultation_price ?? 89), 0) };
  });

  const doctorPerformance = doctors.filter(d => d.status === "active").map(d => {
    const profile = d.doctor_profiles?.profiles;
    const name = profile ? `Dr(a). ${profile.first_name}` : "Médico";
    const docAppts = appointments.filter(a => a.doctor_id === d.doctor_id);
    return { name, consultas: docAppts.length, completadas: docAppts.filter(a => a.status === "completed").length };
  }).sort((a, b) => b.consultas - a.consultas);

  const statusCounts = [
    { name: "Concluídas", value: appointments.filter(a => a.status === "completed").length },
    { name: "Agendadas", value: appointments.filter(a => a.status === "scheduled").length },
    { name: "Canceladas", value: appointments.filter(a => a.status === "cancelled").length },
  ].filter(s => s.value > 0);

  const pendingDoctors = doctors.filter(d => d.status !== "active").length;

  const exportClinicPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const today = format(now, "dd/MM/yyyy HH:mm");
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${clinicProfile?.name ?? "Clínica"} — Relatório`, 105, 13, { align: "center" });
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, 105, 30, { align: "center" });
    doc.setFontSize(12);
    doc.text("Indicadores do Mês", 20, 45);
    doc.setFontSize(10);
    const kpis = [
      `Médicos Ativos: ${activeDoctors}`,
      `Consultas do Mês: ${thisMonthAppts.length}`,
      `Receita do Mês: R$ ${revenue.toLocaleString("pt-BR")}`,
      `Ocupação: ${occupancy}%`,
      `Consultas Concluídas: ${completed.length}`,
      `Ticket Médio: R$ ${completed.length > 0 ? Math.round(revenue / completed.length) : 0}`,
    ];
    kpis.forEach((k, i) => doc.text(`• ${k}`, 25, 55 + i * 7));
    if (doctorPerformance.length > 0) {
      const startY = 55 + kpis.length * 7 + 10;
      doc.setFontSize(12);
      doc.text("Ranking de Médicos", 20, startY);
      doc.setFontSize(9);
      doctorPerformance.forEach((d, i) => {
        doc.text(`#${i + 1} ${d.name} — ${d.completadas}/${d.consultas} consultas`, 25, startY + 10 + i * 6);
      });
    }
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("AloClínica — Relatório Confidencial", 105, 294, { align: "center" });
    doc.save(`relatorio-clinica-${format(now, "yyyy-MM-dd")}.pdf`);
    toast.success("Relatório PDF exportado!");
  };

  const exportClinicCSV = () => {
    const rows = [
      ["Métrica", "Valor"],
      ["Médicos Ativos", String(activeDoctors)],
      ["Consultas do Mês", String(thisMonthAppts.length)],
      ["Receita do Mês", `R$ ${revenue}`],
      ["Ocupação", `${occupancy}%`],
      ["Concluídas", String(completed.length)],
      ["Ticket Médio", `R$ ${completed.length > 0 ? Math.round(revenue / completed.length) : 0}`],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = `relatorio-clinica-${format(now, "yyyy-MM-dd")}.csv`; el.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <DashboardLayout title="Clínica" nav={getClinicNav(activeNav)} role="clinic">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 pb-24 md:pb-8">

        {/* ── Premium Clinic Hero ── */}
        <div className="-mx-4 -mt-5 md:-mx-6 md:-mt-5 lg:-mx-8 lg:-mt-6">
        <HeroBanner
          gradient="from-[#1e1b6b] via-[#3730a3] to-[#6366f1]"
          pingoSrc={pingoAdmin}
          pingoAlt="Pingo"
          liveDot={false}
          liveColor="green"
          bubble={{
            greeting: "🏥 Gestão da clínica",
            name: "Clínica VidaSaúde",
            sub: "12 médicos ativos hoje",
          }}
          kpis={[
            { label: "Médicos", value: activeDoctors },
            { label: "Consultas", value: thisMonthAppts.length },
            { label: "Receita", value: `R$${(revenue/1000).toFixed(1)}k` },
            { label: "Ocupação", value: `${occupancy}%` },
          ]}
          loading={loading}
          onRefresh={undefined}
          refreshing={false}
        />
      </div>

      {/* ── CONTENT ── */}
      <div className="mt-5 space-y-5 pb-24 md:pb-8">

        {/* ── Action Pills ── */}
        <ActionPills title="Ações da clínica" actions={[
          { label: "Agenda", icon: "📅", iconBg: "bg-blue-50 dark:bg-blue-950/30", path: "/dashboard/clinic/schedules" },
          { label: "Médicos", icon: "🩺", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", path: "/dashboard/clinic/doctors" },
          { label: "Pacientes", icon: "👥", iconBg: "bg-violet-50 dark:bg-violet-950/30", path: "/dashboard/clinic/patients" },
          { label: "Exames", icon: "📋", iconBg: "bg-amber-50 dark:bg-amber-950/30", path: "/dashboard/clinic/my-exams" },
          { label: "Sala de Espera", icon: "⏳", iconBg: "bg-red-50 dark:bg-red-950/30", path: "/dashboard/clinic/waiting-room" },
        ]} />

        {/* ── Bento Stats ── */}
        <StatBento loading={loading} stats={[
          { label: "Médicos ativos", value: activeDoctors, icon: "🩺", iconBg: "bg-indigo-50 dark:bg-indigo-950/30", valueClass: "text-indigo-700 dark:text-indigo-400", trend: 5 , accentClass: "bg-indigo-500" },
          { label: "Receita do mês", value: `R$${(revenue / 1000).toFixed(1)}k`, icon: "💰", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", valueClass: "text-emerald-700 dark:text-emerald-400", trend: 12 , accentClass: "bg-emerald-500" },
          { label: "Consultas/mês", value: thisMonthAppts.length, icon: "📅", iconBg: "bg-blue-50 dark:bg-blue-950/30", valueClass: "text-[#1255C8] dark:text-blue-400", trend: 18 , accentClass: "bg-blue-500" },
          { label: "Taxa de ocupação", value: `${occupancy}%`, icon: "📊", iconBg: "bg-amber-50 dark:bg-amber-950/30", valueClass: "text-amber-600 dark:text-amber-400" },
        ]} />

        {/* Pingo Banner */}
        <PingoBannerCard
          pingImg={pingoAdmin}
          pingAlt="Pingo"
          pingSize={82}
          bgClass="bg-indigo-50 dark:bg-indigo-950/20"
          borderClass="border-indigo-100 dark:border-indigo-900/30"
          label="Gestão da clínica"
          labelColor="text-indigo-600 dark:text-indigo-400"
          title="Acompanhe seus médicos"
          subtitle="Rankings, consultas e faturamento em tempo real"
        />

        {/* ── Doctor Ranking ── */}
        {doctorPerformance.length > 0 && (
          <DoctorRanking
            doctors={doctorPerformance.slice(0, 5).map((d, i) => ({
              id: String(i),
              name: d.name,
              initials: d.name.split(" ").map((n: string) => n[0]).slice(0, 2).join(""),
              consultations: d.consultas,
              revenue: d.consultas * 89,
              pct: doctorPerformance[0]?.consultas > 0 ? Math.round((d.consultas / doctorPerformance[0].consultas) * 100) : 0,
              avatarBg: ["bg-indigo-100 dark:bg-indigo-950/40", "bg-emerald-100 dark:bg-emerald-950/40", "bg-amber-100 dark:bg-amber-950/40", "bg-blue-100 dark:bg-blue-950/40", "bg-violet-100 dark:bg-violet-950/40"][i % 5],
              avatarColor: ["text-indigo-700 dark:text-indigo-300", "text-emerald-700 dark:text-emerald-300", "text-amber-700 dark:text-amber-300", "text-blue-700 dark:text-blue-300", "text-violet-700 dark:text-violet-300"][i % 5],
            }))}
            onSeeAll={() => navigate("/dashboard/clinic/doctors")}
          />
        )}


        {/* Alert for pending doctors */}
        {!loading && pendingDoctors > 0 && (
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-3 p-3 rounded-2xl border border-warning/20 bg-warning/5">
              <Stethoscope className="w-5 h-5 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-warning">{pendingDoctors} médico{pendingDoctors > 1 ? "s" : ""} pendente{pendingDoctors > 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">Aguardando aprovação de vínculo</p>
              </div>
              <Button size="sm" variant="ghost" className="text-xs text-warning h-7 shrink-0 rounded-xl" onClick={() => navigate("/dashboard/clinic/doctors")}>
                Revisar →
              </Button>
            </div>
          </motion.div>
        )}

        {/* Welcome state for new clinics */}
        {!loading && !clinicProfile && (
          <motion.div variants={fadeUp}>
            <Card className="border-dashed border-border/60">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground mb-1">Bem-vindo à AloClínica</p>
                <p className="text-sm text-muted-foreground mb-5">Complete o perfil da sua clínica para começar</p>
                <Button className="bg-primary text-primary-foreground rounded-xl h-11 px-8" onClick={() => navigate("/dashboard/profile")}>
                  <Settings className="w-4 h-4 mr-2" /> Completar Perfil
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div variants={fadeUp}>
          <Tabs defaultValue={defaultTab} className="w-full" onValueChange={(val) => {
            const tabToPath: Record<string, string> = {
              overview: "/dashboard",
              performance: "/dashboard/clinic/reports",
              finance: "/dashboard/clinic/finance",
            };
            if (tabToPath[val]) navigate(tabToPath[val]);
          }}>
            <TabsList className="bg-muted/40 border border-border/30 h-11 rounded-2xl p-1 w-full max-w-md backdrop-blur-sm">
              <TabsTrigger value="overview" className="text-xs rounded-xl flex-1 font-semibold data-[state=active]:shadow-sm data-[state=active]:bg-card">📊 Visão Geral</TabsTrigger>
              <TabsTrigger value="performance" className="text-xs rounded-xl flex-1 font-semibold data-[state=active]:shadow-sm data-[state=active]:bg-card">📈 Performance</TabsTrigger>
              <TabsTrigger value="finance" className="text-xs rounded-xl flex-1 font-semibold data-[state=active]:shadow-sm data-[state=active]:bg-card">💰 Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5 mt-5">
              <div className="grid md:grid-cols-2 gap-5">
                <Card className="border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Próximas Consultas</CardTitle>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => navigate("/dashboard/clinic/schedules")}>Ver todas</Button>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                    ) : upcomingAppts.length === 0 ? (
                      <div className="text-center py-8"><Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhuma consulta agendada.</p></div>
                    ) : (
                      <div className="space-y-2">
                        {upcomingAppts.map(a => (
                          <div key={a.id} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{format(new Date(a.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                              <p className="text-xs text-muted-foreground capitalize">{a.appointment_type ?? "consulta"}</p>
                            </div>
                            <Badge variant={a.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                              {a.status === "confirmed" ? "Confirmado" : a.status === "scheduled" ? "Agendado" : a.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" /> Médicos Vinculados</CardTitle>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => navigate("/dashboard/clinic/doctors")}>Gerenciar</Button>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                    ) : doctors.length === 0 ? (
                      <div className="text-center py-8"><Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhum médico vinculado.</p></div>
                    ) : (
                      <div className="space-y-2">
                        {doctors.map((d: Record<string, unknown>) => {
                          const docProfiles = d.doctor_profiles as Record<string, unknown> | undefined;
                          const profile = docProfiles?.profiles as { first_name?: string; last_name?: string } | undefined;
                          const name = profile ? `${profile.first_name} ${profile.last_name}` : "Médico";
                          return (
                            <div key={d.id as string} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/30 border border-border/40">
                              <div>
                                <p className="text-sm font-medium text-foreground">{name}</p>
                                <p className="text-xs text-muted-foreground">CRM: {(docProfiles?.crm as string) ?? "—"}</p>
                              </div>
                              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${d.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}`}>
                                {d.status === "active" ? "Ativo" : "Pendente"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {statusCounts.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-sm font-semibold">Distribuição de Status</CardTitle></CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {statusCounts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-5 mt-5">
              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-sm font-semibold">Consultas por Mês</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="consultas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {doctorPerformance.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-sm font-semibold">Ranking de Médicos</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {doctorPerformance.map((doc, i) => (
                        <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/40">
                          <span className="text-lg font-bold text-primary w-8 text-center">#{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">{doc.completadas} concluídas de {doc.consultas} total</p>
                          </div>
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${doc.consultas > 0 ? (doc.completadas / doc.consultas) * 100 : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="finance" className="space-y-5 mt-5">
              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-sm font-semibold">Receita Mensal</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$${v}`} />
                      <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR")}`, "Receita"]} />
                      <Bar dataKey="receita" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { label: "Receita este mês", value: `R$ ${revenue.toLocaleString("pt-BR")}`, icon: "💰", color: "text-emerald-700 dark:text-emerald-400" },
                  { label: "Consultas concluídas", value: completed.length, icon: "✅", color: "text-primary" },
                  { label: "Ticket médio", value: `R$ ${completed.length > 0 ? Math.round(revenue / completed.length).toLocaleString("pt-BR") : "0"}`, icon: "📊", color: "text-amber-600 dark:text-amber-400" },
                ].map(item => (
                  <Card key={item.label} className="border-border/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="p-5 text-center">
                      <span className="text-2xl mb-2 block">{item.icon}</span>
                      <p className={`text-2xl font-black tabular-nums ${item.color}`}>{item.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default ClinicDashboard;
