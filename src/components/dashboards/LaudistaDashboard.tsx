import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { useLaudistaEarnings } from "@/hooks/useLaudistaEarnings";
import { getLaudistaNav } from "@/components/laudista/laudistaNav";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  ClipboardList, FileText, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, Sparkles, ArrowRight, Target, Activity, BarChart2, Eye, UserCheck, Loader2,
  Zap, TrendingUp, Timer, Flame
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SectionErrorBoundary from "@/components/ui/section-error-boundary";
import { toast } from "sonner";
import { useGsapEntrance } from "@/hooks/use-gsap-entrance";
import { HeroBanner } from "./HeroBanner";
import mascotReading from "@/assets/mascot-reading.png";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } } };

const statusLabels: Record<string, string> = {
  pending: "Aguardando",
  in_review: "Em Análise",
  reported: "Laudado",
  delivered: "Entregue",
};

const LaudistaDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const kpiRef = useGsapEntrance({ stagger: 0.07, y: 14, delay: 0.2 });
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const now = new Date();
  const { currentEarnings, monthlyGoal, percentage, slaOnTime, slaLate, slaPercentage, totalReports, loading: earningsLoading } = useLaudistaEarnings(user?.id);

  const { data: doctorProfile } = useQuery({
    queryKey: ["laudista-doctor-profile", user?.id],
    queryFn: async () => {
      const { data } = await db
        .from("doctor_profiles")
        .select("id, crm, crm_state, crm_verified")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["laudista-stats", doctorProfile?.id],
    queryFn: async () => {
      const dpId = doctorProfile!.id;
      const [pendingRes, myInReviewRes, myReportedRes, todayRes, urgentRes] = await Promise.all([
        db.from("exam_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        db.from("exam_requests").select("id", { count: "exact", head: true }).eq("assigned_to", dpId).eq("status", "in_review"),
        db.from("exam_reports").select("id", { count: "exact", head: true }).eq("reporter_id", dpId),
        db.from("exam_reports").select("id", { count: "exact", head: true }).eq("reporter_id", dpId).gte("created_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),
        db.from("exam_requests").select("id", { count: "exact", head: true }).eq("status", "pending").eq("priority", "urgent"),
      ]);
      return {
        pending: pendingRes.count ?? 0,
        inReview: myInReviewRes.count ?? 0,
        totalReported: myReportedRes.count ?? 0,
        todayReported: todayRes.count ?? 0,
        urgent: urgentRes.count ?? 0,
      };
    },
    enabled: !!doctorProfile?.id,
  });

  const { data: recentExams, isLoading: loadingExams, isRefetching: refreshing } = useQuery({
    queryKey: ["laudista-recent-exams"],
    queryFn: async () => {
      const { data, error } = await db
        .from("exam_requests")
        .select("*")
        .in("status", ["pending", "in_review"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as { id: string; exam_type: string; status: string; priority: string; created_at: string; assigned_to: string | null; patient_name?: string | null; [key: string]: any }[];
    },
    enabled: !!user,
  });

  const handleClaim = async (examId: string) => {
    if (!doctorProfile?.id) return;
    setClaimingId(examId);
    try {
      const { error } = await db
        .from("exam_requests")
        .update({ assigned_to: doctorProfile.id, status: "in_review" })
        .eq("id", examId);
      if (error) throw error;
      toast.success("Exame assumido!", { description: "Você pode iniciar o laudo agora." });
      queryClient.invalidateQueries({ queryKey: ["laudista-recent-exams"] });
      queryClient.invalidateQueries({ queryKey: ["laudista-stats"] });
    } catch (err: unknown) {
      toast.error("Erro", { description: err instanceof Error ? err.message : "Erro inesperado" });
    } finally {
      setClaimingId(null);
    }
  };

  const urgentCount = stats?.urgent ?? 0;
  const firstName = profile?.first_name || "Laudista";
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <DashboardLayout title="Laudista" nav={getLaudistaNav("home")} role="laudista">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-24 md:pb-8">

        {/* ── Hero Header ── */}
        <div className="-mx-4 -mt-5 md:-mx-6 md:-mt-5 lg:-mx-8 lg:-mt-6">
          <HeroBanner
            gradient="from-[#040D24] via-[#0F2B5E] to-[#1e40af]"
            pingoSrc={mascotReading}
            pingoAlt="Pingo"
            liveDot={true}
            liveColor={urgentCount > 0 ? "red" : "green"}
            bubble={{
              greeting: `${greeting}, Dr(a).`,
              name: firstName,
              sub: urgentCount > 0
                ? `${urgentCount} urgente${urgentCount > 1 ? "s" : ""} na fila`
                : `${stats?.pending ?? 0} exame${(stats?.pending ?? 0) !== 1 ? "s" : ""} aguardando laudo`,
            }}
            kpis={[
              { label: "Fila", value: stats?.pending ?? 0 },
              { label: "Meus", value: stats?.inReview ?? 0 },
              { label: "Laudados", value: stats?.totalReported ?? 0 },
              { label: "Hoje", value: stats?.todayReported ?? 0 },
            ]}
            loading={loadingStats}
            onRefresh={() => {
              queryClient.refetchQueries({ queryKey: ["laudista-recent-exams"] });
              queryClient.refetchQueries({ queryKey: ["laudista-stats"] });
            }}
            refreshing={refreshing}
          />
        </div>

        {/* ── CONTENT ── */}
        <div className="mt-4 space-y-6">

          {/* ── KPI Cards ── */}
          <div ref={kpiRef} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Na Fila", value: stats?.pending ?? 0, icon: ClipboardList, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200/50 dark:border-amber-800/30" },
              { label: "Em Análise", value: stats?.inReview ?? 0, icon: Eye, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200/50 dark:border-blue-800/30" },
              { label: "Laudados", value: stats?.totalReported ?? 0, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200/50 dark:border-emerald-800/30" },
              { label: "Hoje", value: stats?.todayReported ?? 0, icon: Target, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200/50 dark:border-violet-800/30" },
            ].map((kpi) => (
              <motion.div key={kpi.label} variants={fadeUp}>
                <Card className={`border ${kpi.border} ${kpi.bg} overflow-hidden relative`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                        <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                      </div>
                      <div>
                        <p className={`text-2xl font-black ${kpi.color}`}>
                          {loadingStats ? <Skeleton className="h-7 w-10" /> : kpi.value}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-medium">{kpi.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ── Desktop 2-col grid ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">

            {/* LEFT col (2/5) */}
            <div className="lg:col-span-2 space-y-5">

              {/* Urgent Alert */}
              {!loadingExams && urgentCount > 0 && (
                <motion.div variants={fadeUp}>
                  <Card className="border-destructive/40 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-destructive/15 flex items-center justify-center shrink-0">
                          <Flame className="w-6 h-6 text-destructive animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">
                            {urgentCount} exame{urgentCount > 1 ? "s" : ""} urgente{urgentCount > 1 ? "s" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">Prioridade máxima — laudar imediatamente</p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-xl shrink-0 shadow-lg shadow-destructive/20 gap-1.5"
                          onClick={() => navigate("/dashboard/laudista/queue?role=laudista")}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Ver fila
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Productivity Card */}
              {!loadingStats && (
                <motion.div variants={fadeUp}>
                  <Card className="border-border/50 overflow-hidden">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/15">
                          <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Produtividade</p>
                          <p className="text-[10px] text-muted-foreground">Resumo da sua performance</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-muted/50 p-3 text-center">
                          <p className="text-2xl font-black text-foreground">{stats?.todayReported ?? 0}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">Laudos hoje</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-3 text-center">
                          <p className="text-2xl font-black text-foreground">{stats?.totalReported ?? 0}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">Total geral</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Earnings Progress Card */}
              <motion.div variants={fadeUp}>
                <Card className="border-amber-200/30 bg-gradient-to-br from-amber-50/30 to-orange-50/20 dark:from-amber-950/20 dark:to-orange-950/10 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
                        <TrendingUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">Meta de Ganhos</p>
                        <p className="text-[10px] text-muted-foreground">Este mês</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">R$ {currentEarnings.toFixed(2).replace('.', ',')}</span>
                        <span className="font-bold text-foreground">Meta: R$ {monthlyGoal.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(percentage, 100)}%` }}
                          transition={{ delay: 0.3, duration: 1 }}
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{earningsLoading ? <span className="inline-block w-20 h-3 bg-muted rounded animate-pulse" /> : `${percentage}% da meta atingida`}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* SLA Tracker Card */}
              <motion.div variants={fadeUp}>
                <Card className="border-emerald-200/30 bg-gradient-to-br from-emerald-50/30 to-teal-50/20 dark:from-emerald-950/20 dark:to-teal-950/10 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                        <Timer className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">SLA Tracker</p>
                        <p className="text-[10px] text-muted-foreground">Prazo cumprido</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{slaOnTime} no prazo</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{earningsLoading ? "..." : `${slaPercentage}%`}</span>
                      </div>
                      <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${slaPercentage}%` }}
                          transition={{ delay: 0.4, duration: 1 }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{slaLate} atrasados ({totalReports} total)</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Quick Actions */}
              <motion.div variants={fadeUp}>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Fila", icon: ClipboardList, href: "/dashboard/laudista/queue?role=laudista", gradient: "from-blue-600 to-indigo-700" },
                    { label: "Meus Laudos", icon: FileText, href: "/dashboard/laudista/my-reports?role=laudista", gradient: "from-teal-600 to-emerald-700" },
                    { label: "Financeiro", icon: BarChart2, href: "/dashboard/laudista/financeiro?role=laudista", gradient: "from-violet-600 to-purple-700" },
                  ].map(action => (
                    <button
                      key={action.label}
                      onClick={() => navigate(action.href)}
                      className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-border/40 bg-card hover:shadow-lg hover:-translate-y-1 transition-all duration-200 hover:border-primary/20 group"
                    >
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <action.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{action.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>{/* end LEFT col */}

            {/* RIGHT col — Exam Queue (3/5) */}
            <div className="lg:col-span-3">
              <motion.div variants={fadeUp}>
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2 pt-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-bold flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-md">
                          <ClipboardList className="w-4 h-4 text-white" />
                        </div>
                        Fila de Exames
                        {!loadingExams && recentExams && recentExams.length > 0 && (
                          <Badge className="text-[10px] h-5 px-2.5 bg-primary/10 text-primary border-0 font-bold">{recentExams.length}</Badge>
                        )}
                      </CardTitle>
                      <Button size="sm" variant="ghost" className="text-xs text-primary h-8 gap-1 font-semibold hover:bg-primary/5" onClick={() => navigate("/dashboard/laudista/queue?role=laudista")}>
                        Ver Tudo <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {loadingExams ? (
                      <div className="space-y-2.5">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl border border-border/30 bg-muted/20">
                            <Skeleton className="h-11 w-11 rounded-xl" />
                            <div className="space-y-1.5 flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
                            <Skeleton className="h-9 w-22 rounded-xl" />
                          </div>
                        ))}
                      </div>
                    ) : !recentExams?.length ? (
                      <div className="text-center py-16">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-5 shadow-xl shadow-primary/5"
                        >
                          <Sparkles className="w-10 h-10 text-primary" />
                        </motion.div>
                        <p className="text-base font-bold text-foreground mb-1">Fila vazia!</p>
                        <p className="text-sm text-muted-foreground">Nenhum exame pendente no momento 🎉</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentExams.map((exam, idx) => (
                          <motion.div
                            key={exam.id}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 hover:shadow-md group ${
                              exam.priority === "urgent"
                                ? "border-destructive/30 bg-destructive/[0.03] hover:bg-destructive/[0.06]"
                                : "border-border/40 hover:border-primary/20 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                                exam.priority === "urgent"
                                  ? "bg-gradient-to-br from-red-500 to-rose-600"
                                  : "bg-gradient-to-br from-primary to-blue-700"
                              }`}>
                                <ClipboardList className="w-5 h-5 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{exam.exam_type}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] h-[18px] px-1.5 font-medium ${
                                      exam.status === "in_review"
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                    }`}
                                  >
                                    {statusLabels[exam.status] || exam.status}
                                  </Badge>
                                  {exam.priority === "urgent" && (
                                    <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 bg-destructive/10 text-destructive border-destructive/20 font-medium">
                                      Urgente
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(exam.created_at), "dd/MM HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 ml-3">
                              {exam.status === "pending" && (
                                <Button
                                  size="sm"
                                  className="rounded-xl h-9 px-4 text-xs gap-1.5 font-bold shadow-md bg-gradient-to-r from-primary to-blue-700 text-white hover:shadow-lg transition-shadow"
                                  onClick={() => handleClaim(exam.id)}
                                  disabled={claimingId === exam.id}
                                >
                                  {claimingId === exam.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                                  Assumir
                                </Button>
                              )}
                              {exam.status === "in_review" && (
                                <Button
                                  size="sm"
                                  className="rounded-xl h-9 px-4 text-xs gap-1.5 font-bold shadow-md bg-gradient-to-r from-teal-600 to-emerald-700 text-white hover:shadow-lg transition-shadow"
                                  onClick={() => navigate(`/dashboard/laudista/report-editor/${exam.id}?role=laudista`)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Laudar
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>{/* end RIGHT col */}
          </div>{/* end grid */}
        </div>{/* end content */}
      </motion.div>
    </DashboardLayout>
  );
};

export default LaudistaDashboard;
