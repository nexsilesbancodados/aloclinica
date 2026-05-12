import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "./DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { getPatientNav } from "@/components/patient/patientNav";
import { format, differenceInDays, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarCheck, VideoCamera, Clock, Gift, ArrowRight,
  Heart, Lightning, ClipboardText, FileText, UploadSimple,
  Sparkle, Stethoscope, MagnifyingGlass, Plus, Warning, Robot,
  Pill, Heartbeat, TrendUp, ChatCircleDots, DotsThreeVertical, Headset,
} from "@phosphor-icons/react";
import { AlertTriangle, RefreshCw, ShieldCheck, Lock } from "lucide-react";
import PatientOnboarding, { ONBOARDING_KEY, KYC_PENDING_KEY } from "@/components/patient/PatientOnboarding";
import { PingoMascot } from "@/components/mascot/PingoMascot";
import LazyAvatar from "@/components/ui/lazy-avatar";
import PatientWaitingCard from "@/components/patient/PatientWaitingCard";
import SectionErrorBoundary from "@/components/ui/section-error-boundary";
import PatientHealthReport from "@/components/patient/PatientHealthReport";
import {
   usePatientStats, usePatientUpcoming, useReturnAppointments, useRecentHealthMetrics, useHealthTimeline,
  useDetectPatientService, type ServiceType,
} from "@/hooks/usePatientDashboard";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import FirstConsultationTour from "@/components/patient/FirstConsultationTour";

/* ── Constants ── */
const HEALTH_TIPS = [
  { title: "Hidratação é chave!", body: "Beba pelo menos 2L de água por dia para manter corpo e mente funcionando bem.", metric: "2L", metricLabel: "Meta Diária", emoji: "💧" },
  { title: "Mexa-se hoje!", body: "30 min de caminhada reduzem ansiedade em até 40%.", metric: "30min", metricLabel: "Ideal/dia", emoji: "🏃" },
];

const getQuickActions = (serviceType: ServiceType) => [
  { label: "Agendar", icon: CalendarCheck, path: "/dashboard/schedule?role=patient", color: "#3b82f6", bg: "#f0f7ff" },
  { label: "Urgência", icon: Lightning, path: "/dashboard/urgent-care?role=patient", color: "#ef4444", bg: "#fef2f2" },
  { label: "Pingo IA", icon: Robot, path: "/dashboard/ai-assistant?role=patient&tab=triagem", color: "#0ea5e9", bg: "#f0f9ff" },
  { label: "Chat", icon: ChatCircleDots, path: "/dashboard/chat?role=patient", color: "#10b981", bg: "#ecfdf5" },
  { label: "Exames", icon: ClipboardText, path: "/dashboard/patient/exam-results?role=patient", color: "#8b5cf6", bg: "#f5f3ff" },
];

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

const getAvatarRingColor = (nextAppt: any) => {
  if (!nextAppt) return "ring-emerald-400";
  const mins = differenceInMinutes(new Date(nextAppt.scheduled_at), new Date());
  if (mins <= 60) return "ring-red-400 animate-pulse";
  return "ring-emerald-400";
};

const getContextualSubtitle = (upcoming: any[], stats: any) => {
  if ((upcoming?.length ?? 0) > 0) return "Você tem consultas agendadas";
  return "Tudo em dia por aqui ✓";
};

const getServiceTypeFromParam = (searchParams: URLSearchParams): ServiceType | null => {
  const service = searchParams.get("service")?.toLowerCase();
  return (service === "telemedicina" || service === "oftalmologia") ? service as ServiceType : null;
};

const SERVICE_SECTIONS = {
  telemedicina: { kpis: true, nextAppt: true, quickActions: true, healthTip: true, returnAppts: true, pendingAppt: true },
  oftalmologia: { kpis: true, nextAppt: true, quickActions: true, healthTip: false, returnAppts: true, pendingAppt: true },
  all: { kpis: true, nextAppt: true, quickActions: true, healthTip: true, returnAppts: true, pendingAppt: true },
};

/* ── Main Component ── */
const PatientDashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const forceOnboarding = searchParams.get("onboarding") === "true";
  const { data: detectedService, isLoading: detectingService } = useDetectPatientService();
  const serviceType = getServiceTypeFromParam(searchParams) || detectedService || "all";
  const sections = SERVICE_SECTIONS[serviceType as keyof typeof SERVICE_SECTIONS] || SERVICE_SECTIONS.all;
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDone] = useLocalStorage<boolean>(ONBOARDING_KEY, false);
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = usePatientStats();
  const { data: upcoming = [], isLoading: upcomingLoading, isError: upcomingError } = usePatientUpcoming();
  const { data: returnAppts = [] } = useReturnAppointments();
  const { data: healthMetrics = [] } = useRecentHealthMetrics();
  const { data: timelineEvents = [], isLoading: timelineLoading } = useHealthTimeline(3);
  const loading = statsLoading || upcomingLoading || detectingService;
  const waitingAppt = upcoming.find((a: any) => a.status === "waiting" || a.status === "in_progress") ?? null;
  const nextAppt = upcoming[0];
  const minutesUntilNext = nextAppt ? differenceInMinutes(new Date(nextAppt.scheduled_at), new Date()) : null;
  const todayTip = HEALTH_TIPS[new Date().getDay() % HEALTH_TIPS.length];
  const firstName = profile?.first_name || "Paciente";
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["patient-upcoming-enriched"] });
    await queryClient.invalidateQueries({ queryKey: ["patient-dashboard-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["patient-return-appts"] });
    await queryClient.invalidateQueries({ queryKey: ["patient-recent-metrics"] });
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => { if (el.scrollTop <= 0) pullStartY.current = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (pullStartY.current === 0) return;
      const delta = e.touches[0].clientY - pullStartY.current;
      if (delta > 60 && el.scrollTop <= 0) setIsPulling(true);
    };
    const onTouchEnd = () => { if (isPulling) { handleRefresh(); setIsPulling(false); } pullStartY.current = 0; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); el.removeEventListener("touchend", onTouchEnd); };
  }, [isPulling, handleRefresh]);

   useEffect(() => {
     if (loading) return;
 
     // Check metadata first (more reliable cross-device)
     const hasCompletedOnboardingMetadata = user?.user_metadata?.onboarding_completed === true;
     
     // Consider profile incomplete if essential fields are missing
     const profileIncomplete = !profile?.cpf || !profile?.phone || !profile?.date_of_birth;
 
     // Priority 1: Force via URL (signup redirect)
     if (forceOnboarding) {
       setShowOnboarding(true);
       return;
     }
 
     // Priority 2: If it's the first login after signup (checked via param)
     // or if they have absolutely no profile data and haven't dismissed onboarding yet
     if (!hasCompletedOnboardingMetadata && !onboardingDone) {
       const isVeryNewUser = profile?.created_at ? (Date.now() - new Date(profile.created_at).getTime() < 3600000) : true;
       
       if (isVeryNewUser && profileIncomplete) {
         setShowOnboarding(true);
       }
     }
   }, [loading, stats?.total, onboardingDone, forceOnboarding, profile, user]);

  if (loading) return (
    <DashboardLayout title="Perfil do Paciente" nav={getPatientNav("home")} role="patient">
      <div className="space-y-6 pb-24 md:pb-8"><Skeleton className="h-56 rounded-[2rem]" /><div className="grid grid-cols-5 gap-3">{[0,1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div><Skeleton className="h-40 rounded-2xl" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="Perfil do Paciente" nav={getPatientNav("home")} role="patient">
      {showOnboarding && <PatientOnboarding onComplete={() => setShowOnboarding(false)} />}
      {!showOnboarding && <FirstConsultationTour />}
      <div ref={scrollRef} className="space-y-6 pb-24 md:pb-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6">
            <HeroSection firstName={firstName} nextAppt={nextAppt} upcoming={upcoming} stats={stats} getGreeting={getGreeting} getAvatarRingColor={getAvatarRingColor} getContextualSubtitle={getContextualSubtitle} profile={profile} />
            <DoctorSearchHero navigate={navigate} hasNextAppt={!!nextAppt} />
            <UrgentAlerts nextAppt={nextAppt} minutesUntilNext={minutesUntilNext} waitingAppt={waitingAppt} sections={sections} navigate={navigate} />
            <section>
              <h3 className="text-sm font-bold text-foreground mb-4 px-1">Ações rápidas</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {getQuickActions(serviceType as any).map((action, i) => (
                  <motion.button key={action.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }} onClick={() => navigate(action.path)} className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-border/40 bg-card hover:border-primary/20 transition-all duration-300">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl mb-1 shadow-sm transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: action.bg, color: action.color }}><action.icon size={24} weight="fill" /></div>
                    <span className="text-[13px] font-bold text-foreground">{action.label}</span>
                  </motion.button>
                ))}
              </div>
            </section>
            {sections.kpis && (
              <section>
                <h3 className="text-sm font-bold text-foreground mb-4 px-1">Resumo geral</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Consultas", value: stats?.total ?? 0, icon: CalendarCheck, color: "#3b82f6", bg: "bg-blue-500/8" },
                    { label: "Receitas", value: stats?.prescriptions ?? 0, icon: FileText, color: "#10b981", bg: "bg-emerald-500/8" },
                    { label: "Documentos", value: stats?.documents ?? 0, icon: UploadSimple, color: "#f59e0b", bg: "bg-amber-500/8" },
                    { label: "Próx. retorno", value: returnAppts.length > 0 ? "Ativo" : "—", icon: Clock, color: "#8b5cf6", bg: "bg-purple-500/8" },
                  ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }} className="flex flex-col p-4 rounded-2xl border border-border/40 bg-card">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg mb-3", stat.bg)} style={{ color: stat.color }}><stat.icon size={18} weight="fill" /></div>
                      <p className="text-xl font-extrabold text-foreground leading-none">{stat.value}</p>
                      <p className="text-[11px] font-medium text-muted-foreground mt-1">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
            {sections.nextAppt && (
              <section>
                <h3 className="text-sm font-bold text-foreground mb-4 px-1">Próxima consulta</h3>
                {nextAppt ? <NextAppointmentCard appt={nextAppt} navigate={navigate} /> : <EmptyAppointmentCard navigate={navigate} />}
              </section>
            )}
          </div>
          <div className="lg:col-span-4 space-y-6">
            {sections.healthTip && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="rounded-3xl border border-border/40 bg-card p-6 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-2 mb-4"><div className="w-2 h-6 bg-blue-500 rounded-full" /><span className="text-[11px] font-black uppercase tracking-widest text-blue-500">Dica de saúde</span></div>
                <h4 className="text-lg font-bold text-foreground mb-2">{todayTip.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">{todayTip.body}</p>
                <div className="flex items-center gap-4 bg-muted/40 p-4 rounded-2xl border border-border/10">
                  <div className="text-3xl">{todayTip.emoji}</div>
                  <div className="flex-1"><p className="text-2xl font-black text-foreground leading-none">{todayTip.metric}</p><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{todayTip.metricLabel}</p></div>
                </div>
              </motion.div>
            )}
            {sections.returnAppts && returnAppts.length > 0 && <ReturnAppointments items={returnAppts} navigate={navigate} />}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="rounded-3xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.04] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><div className="w-2 h-6 bg-emerald-500 rounded-full" /><span className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Seu histórico</span></div>
              <h4 className="text-base font-bold text-foreground mb-1">Relatório consolidado</h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">Baixe um PDF com consultas, receitas e exames recentes para levar a outros médicos.</p>
              <PatientHealthReport variant="default" className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-3xl border border-border/40 bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 shrink-0">
                  <Headset size={22} weight="fill" className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-bold text-foreground mb-1">Precisa de ajuda?</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Nossa equipe está pronta para te atender.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard/chat?role=patient")}
                className="w-full rounded-xl border-border/60 font-bold text-sm gap-2"
              >
                <ChatCircleDots size={16} weight="fill" className="text-blue-500" />
                Abrir chat de suporte
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const HeroSection = ({ firstName, nextAppt, upcoming, stats, getGreeting, getAvatarRingColor, getContextualSubtitle, profile }: any) => (
  <section className={cn("patient-hero relative -mx-4 -mt-5 overflow-hidden rounded-b-[32px] md:-mx-6 md:-mt-5 md:rounded-[2rem] lg:-mx-8 lg:-mt-6 bg-gradient-to-br from-white via-[hsl(210_60%_97%)] to-[hsl(210_70%_94%)] border border-[hsl(215_30%_90%)]/60 dark:border-white/5 dark:bg-[radial-gradient(ellipse_at_top_right,hsl(215_70%_18%)_0%,hsl(220_30%_8%)_55%,hsl(220_25%_6%)_100%)]")} style={{ boxShadow: "0 12px 40px -12px rgba(15, 42, 90, 0.18), inset 0 1px 0 rgba(255,255,255,0.6)" }}>
    <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[hsl(215_85%_60%)]/10 blur-[80px] hidden md:block dark:bg-[hsl(215_85%_55%)]/20" />
    <div className="pointer-events-none absolute -left-8 bottom-4 h-48 w-48 rounded-full bg-[hsl(168_60%_55%)]/10 blur-[60px] hidden md:block dark:bg-[hsl(215_85%_55%)]/15" />
    <div className="relative z-10 px-5 pt-8 pb-7 md:px-8 md:pt-12 md:pb-9 flex flex-col md:flex-row items-center md:items-start gap-4">
      <div className={cn("ring-[3px] ring-offset-2 ring-offset-transparent rounded-full", getAvatarRingColor(nextAppt))}>
        <LazyAvatar src={profile?.avatar_url} name={firstName} className="h-16 w-16 md:h-[72px] md:w-[72px] border-2 border-[hsl(215_30%_90%)] dark:border-white/20" fallbackClassName="bg-[hsl(215_80%_28%)]/10 text-[hsl(215_80%_28%)] dark:bg-white/15 dark:text-white" />
      </div>
      <div className="flex-1 min-w-0 text-center md:text-left">
        <h1 className="font-[Manrope] text-[26px] font-extrabold leading-[1.1] tracking-tight md:text-[38px] text-[hsl(215_80%_18%)] dark:text-white">
          <span className="block text-[11px] md:text-[13px] font-bold uppercase tracking-[0.18em] text-[hsl(215_85%_45%)] dark:text-[hsl(215_90%_70%)] mb-2">{getGreeting()}, {firstName}! 👋</span>
          Sua saúde em um só lugar
        </h1>
        <p className="mt-2 text-[13px] font-medium leading-relaxed md:text-[15px] text-[hsl(215_30%_35%)] dark:text-white/70">{getContextualSubtitle(upcoming, stats)}</p>
      </div>
      <div className="shrink-0 -mt-2 hidden sm:block"><PingoMascot variant="wave" size={120} animate bounce className="drop-shadow-[0_12px_32px_rgba(15,42,90,0.18)] dark:drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)] sm:!w-[130px] sm:!h-[130px]" /></div>
    </div>
    {/* Trust strip */}
    <div className="relative z-10 px-5 pb-5 md:px-8 md:pb-6">
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-[11px] font-semibold text-[hsl(215_50%_30%)] dark:text-white/70">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> CFM verificado</span>
        <span className="hidden sm:inline opacity-30">·</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-emerald-500" /> Dados criptografados</span>
        <span className="hidden sm:inline opacity-30">·</span>
        <span className="inline-flex items-center gap-1.5"><Sparkle weight="fill" className="w-3.5 h-3.5 text-amber-500" /> 4.9 ★ avaliação</span>
      </div>
    </div>
  </section>
);

const QUICK_SPECIALTIES = [
  { label: "Clínico Geral", icon: Stethoscope, query: "Clínico" },
  { label: "Pediatria", icon: Heart, query: "Pediatria" },
  { label: "Saúde Mental", icon: Sparkle, query: "Psiquiatria" },
  { label: "Dermatologia", icon: Heart, query: "Dermatologia" },
];

const DoctorSearchHero = ({ navigate, hasNextAppt }: { navigate: any; hasNextAppt: boolean }) => {
  const [term, setTerm] = useState("");
  const submit = (q?: string) => {
    const value = (q ?? term).trim();
    const path = value
      ? `/dashboard/schedule?role=patient&q=${encodeURIComponent(value)}`
      : "/dashboard/schedule?role=patient";
    navigate(path);
  };
  return (
    <motion.section
      data-tour="search"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 md:p-6 shadow-sm"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
          <MagnifyingGlass size={22} weight="fill" className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-bold text-foreground leading-tight">
            {hasNextAppt ? "Precisa de outro especialista?" : "Encontre um médico em segundos"}
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Mais de 100 especialistas verificados pelo CFM. Atendimento em até 15 min.
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex flex-col sm:flex-row gap-2"
      >
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Especialidade, sintoma ou nome do médico"
            className="h-12 pl-11 rounded-2xl bg-card border-border/50 text-sm md:text-base"
            aria-label="Buscar médico ou especialidade"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-12 rounded-2xl px-6 font-bold shadow-sm gap-1.5"
        >
          Buscar <ArrowRight size={16} weight="bold" />
        </Button>
      </form>
      <div className="flex items-center gap-1.5 flex-wrap mt-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 mr-1">Rápido:</span>
        {QUICK_SPECIALTIES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => submit(s.query)}
            className="h-8 px-3 rounded-full text-[12px] font-semibold bg-muted/60 hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>
    </motion.section>
  );
};

const UrgentAlerts = ({ nextAppt, minutesUntilNext, waitingAppt, sections, navigate }: any) => (
  <div className="space-y-4">
    <AnimatePresence>
      {nextAppt && minutesUntilNext !== null && minutesUntilNext > 0 && minutesUntilNext <= 60 && (
        <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} className="rounded-2xl bg-emerald-500 text-white p-4 flex items-center gap-3 shadow-lg">
          <div className="animate-pulse w-3 h-3 rounded-full bg-white shrink-0" />
          <div className="flex-1 min-w-0"><p className="font-bold text-[14px]">Sua consulta começa em breve!</p><p className="text-[12px] opacity-90">{nextAppt.doctor_name} · às {format(new Date(nextAppt.scheduled_at), "HH:mm")}</p></div>
          <Button size="sm" onClick={() => navigate(`/dashboard/consultation/${nextAppt.id}`)} className="shrink-0 rounded-full bg-white text-emerald-700 font-bold text-[12px] hover:bg-white/90">Entrar</Button>
        </motion.div>
      )}
    </AnimatePresence>
    {sections.pendingAppt && waitingAppt && <SectionErrorBoundary fallbackTitle="Erro na sala de espera"><PatientWaitingCard appointment={waitingAppt} /></SectionErrorBoundary>}
  </div>
);

const ReturnAppointments = ({ items, navigate }: any) => (
  <div className="overflow-hidden rounded-2xl border border-warning/15 bg-warning/[0.04] p-4">
    <div className="mb-3 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-xl bg-warning/12"><Gift size={14} weight="fill" className="text-warning" /></div><p className="text-[11px] font-bold text-warning uppercase tracking-wide">Retorno Grátis</p></div>
    {items.map((ra: any) => (
      <div key={ra.id} className="card-interactive mb-2 flex items-center justify-between rounded-xl border border-border/10 bg-card p-3 last:mb-0 shadow-sm">
        <div className="flex items-center gap-3"><LazyAvatar name={ra.doctor_name} className="h-9 w-9" fallbackClassName="bg-warning/10 text-warning text-xs" />
          <div className="text-xs"><p className="font-semibold text-foreground">{ra.doctor_name}</p><p className="mt-0.5 text-muted-foreground">Válido até {format(new Date(ra.return_deadline), "dd/MM")}</p></div>
        </div>
        <Button size="sm" className="h-8 rounded-full bg-warning text-warning-foreground hover:bg-warning/90 text-[11px] font-bold" onClick={() => navigate(`/dashboard/schedule/${ra.doctor_id}?return=true&original=${ra.id}`)}>Agendar</Button>
      </div>
    ))}
  </div>
);

const NextAppointmentCard = ({ appt, navigate }: any) => {
  const scheduledAt = new Date(appt.scheduled_at);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] border border-border/40 bg-card p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 relative group overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-30 group-hover:opacity-100 transition-opacity"><DotsThreeVertical size={24} className="text-muted-foreground cursor-pointer" /></div>
      <div className="flex items-center gap-5 w-full md:w-auto">
        <div className="relative"><LazyAvatar src={appt.doctor_avatar} name={appt.doctor_name} className="h-20 w-20 rounded-full border-4 border-white dark:border-muted shadow-lg" /><div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-white dark:border-muted flex items-center justify-center"><VideoCamera size={12} weight="fill" className="text-white" /></div></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 px-2 py-0.5 rounded-full">Consulta Presencial</span></div>
          <h4 className="text-xl font-bold text-foreground truncate">{appt.doctor_name}</h4><p className="text-sm text-muted-foreground">{appt.specialty || "Clínico Geral"}</p><p className="text-[11px] text-muted-foreground mt-1">Clínica AloClínica – Unidade Centro</p>
        </div>
      </div>
      <div className="hidden md:block h-16 w-px bg-border/40 mx-2" />
      <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-1 w-full md:w-32 bg-muted/30 md:bg-transparent p-4 md:p-0 rounded-2xl">
        <div className="flex items-baseline gap-1"><span className="text-3xl font-black text-foreground">{format(scheduledAt, "dd")}</span><span className="text-[13px] font-bold text-muted-foreground uppercase">{format(scheduledAt, "MMM", { locale: ptBR })}</span></div>
        <div className="text-right md:text-left"><p className="text-[13px] font-bold text-foreground capitalize">{format(scheduledAt, "eeee", { locale: ptBR })}</p><p className="text-[13px] text-muted-foreground">{format(scheduledAt, "HH:mm")}</p></div>
      </div>
      <div className="w-full md:w-auto md:ml-auto"><Button variant="outline" className="w-full md:w-auto rounded-2xl border-border/40 hover:bg-muted font-bold text-sm px-8 py-6 h-auto transition-all shadow-sm" onClick={() => navigate("/dashboard/appointments?role=patient")}>Ver detalhes</Button></div>
    </motion.div>
  );
};

const EmptyAppointmentCard = ({ navigate }: any) => (
  <div className="relative rounded-[32px] border border-border/40 bg-gradient-to-br from-card via-card to-blue-500/[0.04] p-6 md:p-8 overflow-hidden flex flex-col md:flex-row items-center gap-6">
    <div className="flex-1 text-center md:text-left">
      <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-3">
        <CalendarCheck size={24} weight="fill" className="text-primary" />
      </div>
      <p className="text-lg md:text-xl font-bold text-foreground mb-2">Sem consultas agendadas</p>
      <p className="text-sm text-muted-foreground max-w-md mb-5 mx-auto md:mx-0">
        Você ainda não tem nenhuma consulta para os próximos dias.
      </p>
      <Button
        onClick={() => navigate("/dashboard/schedule?role=patient")}
        className="rounded-2xl px-8 h-12 font-bold bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
      >
        Agendar primeira consulta
      </Button>
    </div>
    <div className="shrink-0 hidden md:block">
      <PingoMascot variant="reading" size={160} animate className="drop-shadow-[0_12px_28px_rgba(15,42,90,0.18)]" />
    </div>
  </div>
);

export default PatientDashboard;
