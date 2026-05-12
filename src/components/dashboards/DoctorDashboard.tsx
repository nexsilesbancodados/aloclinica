import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { getDoctorNav } from "@/components/doctor/doctorNav";
import { toast } from "sonner";
import { logError } from "@/lib/logger";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, DollarSign, Users, TrendingUp, Video, BarChart2, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import DoctorAnalyticsCharts from "./DoctorAnalyticsCharts";
import DoctorOnboarding from "@/components/doctor/DoctorOnboarding";
import CrmApprovalTimeline from "@/components/doctor/CrmApprovalTimeline";
import { useDoctorStats } from "@/hooks/useDoctorDashboard";
import { useQueryClient } from "@tanstack/react-query";
import { HeroBanner } from "./HeroBanner";
import { StatBento } from "./StatBento";
import { ActionPills } from "./ActionPills";
import { LiveQueue, QueueItem } from "./LiveQueue";
import { cn } from "@/lib/utils";
import { GoalProgressCard } from "./GoalProgressCard";
import { DashboardShortcuts } from "./DashboardShortcuts";
import SectionErrorBoundary from "@/components/ui/section-error-boundary";
import mascotWave from "@/assets/mascot-wave.png";
import mascotWelcome from "@/assets/mascot-welcome.png";
import DoctorCommandCenter from "./DoctorCommandCenter";
import DoctorSmartInsights from "./DoctorSmartInsights";
import DoctorWeeklyPulse from "./DoctorWeeklyPulse";

const statusColor: Record<string, string> = {
  scheduled:   "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
  waiting:     "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  in_progress: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  completed:   "bg-muted text-muted-foreground",
  cancelled:   "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400",
};
const statusLabel: Record<string, string> = {
  scheduled: "Agendado", completed: "Concluída", cancelled: "Cancelada",
  in_progress: "Em andamento", waiting: "Em Espera",
};

const DoctorDashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [isOnline, setIsOnline] = useState(true);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const { data, isLoading: loading, isError, refetch } = useDoctorStats();

  // Load online status from doctor_profiles on mount
  useEffect(() => {
    if (user?.id) {
      loadOnlineStatus();
    }
  }, [user?.id]);

  const loadOnlineStatus = async () => {
    try {
      const { data, error } = await db
        .from("doctor_profiles")
        .select("available_for_on_demand")
        .eq("user_id", user!.id)
        .single();

      if (error) {
        logError("Error loading online status:", error);
        return;
      }

      setIsOnline((data as any)?.available_for_on_demand ?? true);
    } catch (error) {
      logError("Error loading online status:", error);
    }
  };

  const handleToggleOnline = async () => {
    const newStatus = !isOnline;
    setOnlineLoading(true);

    try {
      const { error } = await db
        .from("doctor_profiles")
        .update({ available_for_on_demand: newStatus } as any)
        .eq("user_id", user!.id);

      if (error) {
        logError("Error updating online status:", error);
        toast.error("Erro ao atualizar status. Tente novamente.");
        setOnlineLoading(false);
        return;
      }

      setIsOnline(newStatus);
      toast.success(newStatus ? "Você está agora online! 🟢" : "Você está offline 🔴");
    } catch (error) {
      logError("Error toggling online status:", error);
      toast.error("Erro ao atualizar status");
    } finally {
      setOnlineLoading(false);
    }
  };

  interface DoctorAppt {
    id: string; scheduled_at: string; status: string;
    patient_id: string; patient_name: string; duration_minutes: number | null;
  }

  const stats = data?.stats ?? { today: 0, total_patients: 0, prescriptions: 0, totalEarnings: 0 };
  const todayAppts = (data?.todayAppts ?? []) as DoctorAppt[];
  const upcomingAppts = (data?.upcomingAppts ?? []) as DoctorAppt[];
  const waitingCount = todayAppts.filter(a => a.status === "waiting").length;
  const done = todayAppts.filter(a => a.status === "completed").length;
  const inProg = todayAppts.filter(a => a.status === "in_progress").length;

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  };

  const queueItems: QueueItem[] = todayAppts.slice(0, 6).map(a => ({
    id: a.id,
    initials: a.patient_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") ?? "?",
    name: a.patient_name,
    subtitle: a.status === "in_progress"
      ? `Em consulta · ${format(new Date(a.scheduled_at), "HH:mm")}`
      : a.status === "waiting"
      ? `Aguardando · ${format(new Date(a.scheduled_at), "HH:mm")}`
      : format(new Date(a.scheduled_at), "HH:mm"),
    status: a.status === "in_progress" ? "live" : a.status === "waiting" ? "waiting" : "scheduled",
    avatarBg: a.status === "in_progress" ? "bg-emerald-100 dark:bg-emerald-950/40"
            : a.status === "waiting" ? "bg-amber-100 dark:bg-amber-950/40"
            : "bg-blue-100 dark:bg-blue-950/40",
    avatarColor: a.status === "in_progress" ? "text-emerald-700 dark:text-emerald-300"
               : a.status === "waiting" ? "text-amber-700 dark:text-amber-300"
               : "text-blue-700 dark:text-blue-300",
    action: (a.status === "waiting" || a.status === "in_progress") ? (
      <Button size="sm"
        className="h-8 rounded-xl px-3 text-[10.5px] font-bold text-white bg-emerald-600 hover:bg-emerald-700"
        onClick={() => navigate(`/dashboard/consultation/${a.id}`)}>
        {a.status === "in_progress" ? "Entrar" : "Chamar"}
      </Button>
    ) : undefined,
  }));

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("home")} role="doctor">
      {!loading && !data?.crm && <DoctorOnboarding />}
      {!loading && data?.crm && data?.approval && !data.approval.is_approved && (
        <div className="mb-5">
          <CrmApprovalTimeline doctor={data.approval} />
        </div>
      )}
      {isError && (
        <div className="mx-auto my-6 flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Erro ao carregar dados do painel</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      <motion.div variants={container} initial="hidden" animate="show">

      {/* Full-width hero */}
      <div className="-mx-4 -mt-5 md:-mx-6 md:-mt-5 lg:-mx-8 lg:-mt-6">
        <HeroBanner
          gradient="from-[#042A1C] via-[#065f46] to-[#059669]"
          pingoSrc={mascotWave}
          pingoAlt="Pingo"
          liveDot={waitingCount > 0}
          liveColor="red"
          bubble={{
            greeting: `${greeting()} · ${format(new Date(), "dd/MM", { locale: ptBR })}`,
            name: `Dr(a). ${profile?.first_name || "Médico"}`,
            sub: waitingCount > 0 ? `${waitingCount} paciente${waitingCount > 1 ? "s" : ""} aguardando` : "Agenda atualizada",
          }}
          topRight={
            (data as any)?.crm ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                CRM Verificado
              </div>
            ) : null
          }
          kpis={[
            { label: "Hoje",      value: stats.today },
            { label: "Na fila",   value: waitingCount },
            { label: "Pacientes", value: stats.total_patients },
            { label: "Avaliação", value: data?.rating ? `${data.rating.toFixed(1)}★` : "—" },
            { label: "Ganhos",    value: stats.totalEarnings >= 1000 ? `R$${(stats.totalEarnings / 1000).toFixed(1)}k` : `R$${stats.totalEarnings}` },
          ]}
          loading={loading}
        />
      </div>

      <motion.div variants={fadeUp} className="mt-5 md:mt-5 space-y-5 pb-24 md:pb-8">

        {/* Command Center: Plantão + Próxima + Fila */}
        <motion.div variants={fadeUp}>
          <DoctorCommandCenter
            isOnline={isOnline}
            onlineLoading={onlineLoading}
            onToggleOnline={handleToggleOnline}
            waitingCount={waitingCount}
            nextAppt={upcomingAppts[0] ?? (todayAppts.find(a => a.status === "scheduled" || a.status === "waiting"))}
            onEnterRoom={(id) => navigate(`/dashboard/doctor/waiting-room?appt=${id}`)}
            onSeeQueue={() => navigate("/dashboard/doctor/waiting-room")}
          />
        </motion.div>

        {/* Smart Insights */}
        <motion.div variants={fadeUp}>
          <DoctorSmartInsights
            waitingCount={waitingCount}
            todayTotal={todayAppts.length}
            done={done}
            inProgress={inProg}
            rating={data?.rating}
          />
        </motion.div>

        {/* Action pills */}
        <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-1.5 border border-border/10 shadow-sm">
          <ActionPills actions={[
            { label: "Sala",     icon: "🎥", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", path: "/dashboard/doctor/waiting-room", badge: waitingCount },
            { label: "Receitas", icon: "📋", iconBg: "bg-blue-50 dark:bg-blue-950/30",       path: "/dashboard/prescriptions" },
            { label: "Agenda",   icon: "📅", iconBg: "bg-violet-50 dark:bg-violet-950/30",   path: "/dashboard/doctor/calendar" },
            { label: "Ganhos",   icon: "💰", iconBg: "bg-amber-50 dark:bg-amber-950/30",     path: "/dashboard/earnings" },
            { label: "Analytics",icon: "📊", iconBg: "bg-blue-50 dark:bg-blue-950/30",       path: "/dashboard/doctor/analytics" },
          ]} />
        </div>

        {/* Goal progress */}
        <AnimatePresence>
          {todayAppts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GoalProgressCard
                done={done} total={todayAppts.length}
                inProgress={inProg} waiting={waitingCount}
                accentColor="bg-emerald-500"
                accentBg="bg-emerald-50 dark:bg-emerald-900/20"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop 2-col */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">

          {/* LEFT */}
          <div className="space-y-5">
            {/* Weekly pulse */}
            <DoctorWeeklyPulse
              series={(data as any)?.weekSeries ?? []}
              loading={loading}
              onClick={() => navigate("/dashboard/doctor/analytics")}
            />

            {/* Stats bento */}
            <StatBento loading={loading} stats={[
              { label: "Consultas hoje",  value: stats.today,          icon: "🩺", iconBg: "bg-emerald-50 dark:bg-emerald-950/30", valueClass: "text-emerald-700 dark:text-emerald-400",  accentClass: "bg-emerald-500", trend: 8 },
              { label: "Em espera",       value: waitingCount,          icon: "⏳", iconBg: "bg-amber-50 dark:bg-amber-950/30",    valueClass: "text-amber-600 dark:text-amber-400",     accentClass: "bg-amber-500" },
              { label: "Total pacientes", value: stats.total_patients,  icon: "👥", iconBg: "bg-blue-50 dark:bg-blue-950/30",     valueClass: "text-blue-700 dark:text-blue-400",       accentClass: "bg-blue-500",   trend: 15 },
              { label: "Receitas",        value: stats.prescriptions,   icon: "💊", iconBg: "bg-violet-50 dark:bg-violet-950/30", valueClass: "text-violet-600 dark:text-violet-400",   accentClass: "bg-violet-500" },
            ]} />

            {/* Live queue */}
            {queueItems.length > 0 ? (
              <LiveQueue items={queueItems} title="Fila ao vivo"
                linkLabel={`${waitingCount} agora`}
                onLinkClick={() => navigate("/dashboard/doctor/waiting-room")} />
            ) : !loading && (
              <div className="flex flex-col items-center py-6 text-center rounded-2xl border border-dashed border-border/40 bg-muted/10">
                <motion.img src={mascotWelcome} alt="Pingo"
                  className="mb-3 h-20 w-20 object-contain select-none"
                  style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,.15))" }}
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />
                <p className="text-[13px] font-bold">Agenda livre hoje</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Nenhuma consulta agendada</p>
                <Button size="sm" className="mt-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => navigate("/dashboard/availability")}>
                  Configurar horários
                </Button>
              </div>
            )}

          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-10 w-full rounded-xl border border-border/30 bg-muted/40 p-1">
                <TabsTrigger value="overview" className="flex-1 rounded-lg text-[11.5px] gap-1.5 font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  <BarChart2 className="w-3.5 h-3.5" /> Visão Geral
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex-1 rounded-lg text-[11.5px] gap-1.5 font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  <TrendingUp className="w-3.5 h-3.5" /> Análises
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-3 space-y-3">
                {upcomingAppts.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-border/20 bg-card shadow-[0_2px_10px_rgba(0,0,0,.05)]">
                    <div className="flex items-center justify-between border-b border-border/15 px-4 py-3">
                      <p className="text-[11.5px] font-bold">Próximas Consultas</p>
                      <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11px] font-semibold text-primary"
                        onClick={() => navigate("/dashboard/doctor/consultations")}>
                        Ver todas <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    {upcomingAppts.slice(0, 5).map(a => (
                      <div key={a.id}
                        className="flex items-center gap-3 border-b border-border/10 px-4 py-3 last:border-0 hover:bg-muted/20 transition-colors">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-[11px] font-bold">
                          {format(new Date(a.scheduled_at), "HH:mm")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold truncate">{a.patient_name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(a.scheduled_at), "dd/MM · HH:mm", { locale: ptBR })} · {a.duration_minutes || 30}min
                          </p>
                        </div>
                        <span className={`rounded-lg px-2 py-0.5 text-[9px] font-bold ${statusColor[a.status] ?? "bg-muted text-muted-foreground"}`}>
                          {statusLabel[a.status] ?? a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <DashboardShortcuts title="Ferramentas" shortcuts={[
                  { label: "Meus Pacientes",  description: "Histórico e prontuários",  icon: <Users className="w-[17px] h-[17px]" />,       path: "/dashboard/patients",         iconBg: "bg-blue-50 dark:bg-blue-950/30",    iconColor: "text-blue-600 dark:text-blue-400" },
                  { label: "Calendário",       description: "Agenda e disponibilidade", icon: <Calendar className="w-[17px] h-[17px]" />,    path: "/dashboard/doctor/calendar",  iconBg: "bg-violet-50 dark:bg-violet-950/30", iconColor: "text-violet-600 dark:text-violet-400" },
                  { label: "Meus Ganhos",      description: "Faturamento e extrato",    icon: <DollarSign className="w-[17px] h-[17px]" />,  path: "/dashboard/earnings",         iconBg: "bg-emerald-50 dark:bg-emerald-950/30",iconColor: "text-emerald-600 dark:text-emerald-400" },
                ]} />
              </TabsContent>

              <TabsContent value="analytics" className="mt-3">
                <SectionErrorBoundary fallbackTitle="Erro ao carregar análises">
                  <DoctorAnalyticsCharts />
                </SectionErrorBoundary>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default DoctorDashboard;
