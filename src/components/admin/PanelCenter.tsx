import { logError } from "@/lib/logger";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminNav } from "@/components/admin/adminNav";
import {
  Users, ShieldCheck, ArrowRight, Flag,
  Activity, RefreshCw, Monitor, Sparkles, LayoutGrid,
  UserPlus, Layers, TrendingUp, Zap, Settings2,
  FileText, PieChart, ShieldAlert, Database, 
  CreditCard, ClipboardList, CheckCircle, AlertCircle, History,
  Eye, Heart, Phone, CalendarCheck, UserCheck, Wallet, Megaphone, Handshake
} from "lucide-react";
import { SquaresFour, WhatsappLogo, ShieldStar, Tag, Graph } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { addDays, format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import pingoAdmin from "@/assets/pingo-admin.png";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartTooltip, Cell, AreaChart, Area } from "recharts";

interface RecentUser { name: string; page: string; lastSeen: string }
interface RevenuePoint { day: string; revenue: number }
interface PanelInfo {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  glow: string;
  route: string;
  roleKey: string;
  onlineCount: number;
  totalUsers: number;
  recentUsers: RecentUser[];
}

const PANELS: Omit<PanelInfo, "onlineCount" | "totalUsers" | "recentUsers">[] = [
  { id: "admin",        label: "Administração", description: "Controle total do sistema, permissões e auditoria", icon: ShieldCheck, gradient: "from-primary to-blue-700", glow: "shadow-primary/25", route: "/dashboard/admin/panel-center?role=admin", roleKey: "admin" },
  { id: "users",        label: "Usuários", description: "Contas, acessos e permissões da plataforma", icon: Users, gradient: "from-blue-500 to-indigo-600", glow: "shadow-blue-500/25", route: "/dashboard/admin/users?role=admin", roleKey: "all-users" },
  { id: "approvals",    label: "Aprovações", description: "Cadastros e verificações pendentes", icon: UserCheck, gradient: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/25", route: "/dashboard/admin/approvals?role=admin", roleKey: "approval-scope" },
  { id: "appointments", label: "Consultas", description: "Agenda, status e operação das consultas", icon: CalendarCheck, gradient: "from-violet-500 to-purple-600", glow: "shadow-violet-500/25", route: "/dashboard/admin/appointments?role=admin", roleKey: "patient" },
  { id: "financial",    label: "Financeiro", description: "Receitas, repasses e indicadores financeiros", icon: Wallet, gradient: "from-green-500 to-emerald-600", glow: "shadow-green-500/25", route: "/dashboard/admin/financial?role=admin", roleKey: "doctor" },
  { id: "maintenance",  label: "Manutenção", description: "Integrações, chaves e saúde da plataforma", icon: Settings2, gradient: "from-cyan-500 to-blue-600", glow: "shadow-cyan-500/25", route: "/dashboard/admin/maintenance?role=admin", roleKey: "admin" },
  { id: "platform-settings", label: "Configuração", description: "Modo de manutenção, SEO e robots.txt", icon: Settings2, gradient: "from-slate-500 to-slate-700", glow: "shadow-slate-500/25", route: "/dashboard/admin/platform-settings?role=admin", roleKey: "admin" },
  { id: "feature-flags", label: "Feature Flags", description: "Rollouts graduais e controles de recursos", icon: Flag, gradient: "from-violet-500 to-indigo-600", glow: "shadow-violet-500/25", route: "/dashboard/admin/feature-flags?role=admin", roleKey: "admin" },
  { id: "security",     label: "Segurança", description: "Políticas, auditoria e proteção operacional", icon: ShieldAlert, gradient: "from-rose-500 to-red-600", glow: "shadow-rose-500/25", route: "/dashboard/admin/security?role=admin", roleKey: "admin" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

const PanelCenter = () => {
  const navigate = useNavigate();
  const [panels, setPanels] = useState<PanelInfo[]>(
    PANELS.map(p => ({ ...p, onlineCount: 0, totalUsers: 0, recentUsers: [] }))
  );
  const [totalOnline, setTotalOnline] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [appointmentsToday, setAppointmentsToday] = useState<number | null>(null);
  const [leadsToday, setLeadsToday] = useState<number | null>(null);
  const [revenueData, setRevenueData] = useState<RevenuePoint[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchPresence = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const todayStart = startOfDay(new Date());
      const tomorrowStart = addDays(todayStart, 1);
      const weekStart = startOfDay(subDays(todayStart, 6));
      const [presenceResult, rolesResult, accountsResult, appointmentsResult, leadsResult, revenueResult] = await Promise.all([
        db
          .from("user_presence")
          .select("user_id, current_page, last_seen_at, is_online")
          .eq("is_online", true)
          .gte("last_seen_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()),
        db.from("user_roles").select("user_id, role"),
        db.from("profiles").select("user_id", { count: "exact", head: true }),
        db.from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_at", todayStart.toISOString())
          .lt("scheduled_at", tomorrowStart.toISOString())
          .not("status", "in", "(cancelled,no_show)"),
        db.from("contract_leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", tomorrowStart.toISOString()),
        db.from("appointments")
          .select("scheduled_at, price_at_booking, payment_status")
          .gte("scheduled_at", weekStart.toISOString())
          .lt("scheduled_at", tomorrowStart.toISOString()),
      ]);

      const onlineUsers = presenceResult.data;
      const allRoles = rolesResult.data;
      const onlineUserIds = [...new Set((onlineUsers ?? []).map(u => u.user_id))];

      setAppointmentsToday(appointmentsResult.error ? null : appointmentsResult.count ?? 0);
      setLeadsToday(leadsResult.error ? null : leadsResult.count ?? 0);

      if (revenueResult.error) {
        setRevenueData(null);
      } else {
        const paidStatuses = new Set(["approved", "confirmed", "received"]);
        setRevenueData(Array.from({ length: 7 }, (_, index) => {
          const day = addDays(weekStart, index);
          const dayKey = format(day, "yyyy-MM-dd");
          const revenue = (revenueResult.data ?? [])
            .filter(appointment => format(new Date(appointment.scheduled_at), "yyyy-MM-dd") === dayKey)
            .filter(appointment => paidStatuses.has(appointment.payment_status ?? ""))
            .reduce((total, appointment) => total + Number(appointment.price_at_booking ?? 0), 0);
          return { day: format(day, "EEE", { locale: ptBR }), revenue };
        }));
      }

      const profilesMap: Map<string, string> = new Map();

      if (onlineUserIds.length > 0) {
        const { data: profiles } = await db
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", onlineUserIds);
        (profiles ?? []).forEach(p => {
          profilesMap.set(p.user_id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Usuário");
        });
      }

      const usersByRole: Record<string, Set<string>> = {};
      (allRoles ?? []).forEach(r => {
        if (!usersByRole[r.role]) usersByRole[r.role] = new Set();
        usersByRole[r.role].add(r.user_id);
      });
      const roleTotals: Record<string, number> = Object.fromEntries(
        Object.entries(usersByRole).map(([role, userIds]) => [role, userIds.size]),
      );

      const panelOnlineMap: Record<string, RecentUser[]> = {};
      (onlineUsers ?? []).forEach(u => {
        const page = u.current_page ?? "/dashboard";
        const name = profilesMap.get(u.user_id) ?? "Usuário";

         let panelId = "other";
         if (page.includes("/admin/users")) panelId = "users";
         else if (page.includes("/admin/approvals") || page.includes("/admin/kyc-review")) panelId = "approvals";
         else if (page.includes("/admin/appointments")) panelId = "appointments";
         else if (page.includes("/admin/financial")) panelId = "financial";
         else if (page.includes("/admin/maintenance")) panelId = "maintenance";
         else if (page.includes("/admin/platform-settings")) panelId = "platform-settings";
         else if (page.includes("/admin/feature-flags")) panelId = "feature-flags";
         else if (page.includes("/admin/security")) panelId = "security";
         else if (page.includes("role=admin") || page.includes("/admin/")) panelId = "admin";

        if (!panelOnlineMap[panelId]) panelOnlineMap[panelId] = [];
        panelOnlineMap[panelId].push({
          name,
          page: page.replace("/dashboard", "").replace("?role=", "").slice(0, 30) || "Início",
          lastSeen: u.last_seen_at,
        });
      });

       const uniqueRoleUserCount = new Set((allRoles ?? []).map(r => r.user_id)).size;
       const accountCount = accountsResult.error || typeof accountsResult.count !== "number"
         ? uniqueRoleUserCount
         : accountsResult.count;
       const panelTotals: Record<string, number> = {
         "all-users": accountCount,
         "approval-scope": (roleTotals.doctor ?? 0) + (roleTotals.clinic ?? 0),
         patient: appointmentsResult.error ? 0 : appointmentsResult.count ?? 0,
       };
       setPanels(PANELS.map(p => ({
         ...p,
         onlineCount: panelOnlineMap[p.id]?.length ?? 0,
         totalUsers: panelTotals[p.roleKey] ?? (roleTotals[p.roleKey] ?? 0),
         recentUsers: (panelOnlineMap[p.id] ?? []).slice(0, 5),
       })));
      setTotalOnline(onlineUserIds.length);
      setTotalUsers(accountCount);
    } catch (e) {
      logError("PanelCenter fetch error", e);
    }
    setRefreshing(false);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(() => fetchPresence(), 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = db
      .channel("panel-center-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => fetchPresence())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, []);

  const liveActivity = useMemo(() => {
    const all: { name: string; page: string; lastSeen: string; panel: PanelInfo }[] = [];
    panels.forEach(p => p.recentUsers.forEach(u => all.push({ ...u, panel: p })));
    return all
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 8);
  }, [panels]);

  const activePanels = panels.filter(p => p.onlineCount > 0).length;

    const stats = [
      {
        label: "Online agora",
        sublabel: "Usuários conectados",
        value: totalOnline,
        icon: Zap,
        gradient: "from-emerald-400 via-emerald-500 to-teal-600",
        ring: "ring-emerald-500/30",
        glow: "shadow-emerald-500/20",
        sparkColor: "stroke-emerald-500",
        route: "/dashboard/admin/live?role=admin"
      },
      {
        label: "Leads",
        sublabel: "Novos contatos",
        value: leadsToday ?? "—",
        icon: UserPlus,
        gradient: "from-blue-400 via-blue-500 to-indigo-600",
        ring: "ring-blue-500/30",
        glow: "shadow-blue-500/20",
        sparkColor: "stroke-blue-500",
        route: "/dashboard/admin/leads?role=admin"
      },
      {
        label: "WhatsApp API",
        sublabel: "Automações & Bots",
        value: "Verificar",
        icon: WhatsappLogo,
        gradient: "from-green-400 via-green-500 to-emerald-600",
        ring: "ring-green-500/30",
        glow: "shadow-green-500/20",
        sparkColor: "stroke-green-500",
        route: "/dashboard/admin/whatsapp?role=admin"
      },
      {
        label: "Aprovações",
        sublabel: "Médicos pendentes",
         value: panels.find(p => p.id === "approvals")?.totalUsers ?? 0,
        icon: UserCheck,
        gradient: "from-orange-400 via-orange-500 to-red-600",
        ring: "ring-orange-500/30",
        glow: "shadow-orange-500/20",
        sparkColor: "stroke-orange-500",
        route: "/dashboard/admin/approvals?role=admin"
      },
      {
        label: "Consultas",
        sublabel: "Agendadas hoje",
        value: appointmentsToday ?? "—",
        icon: ClipboardList,
        gradient: "from-violet-400 via-violet-500 to-purple-600",
        ring: "ring-violet-500/30",
        glow: "shadow-violet-500/20",
        sparkColor: "stroke-violet-500",
        route: "/dashboard/admin/appointments?role=admin"
      },
    ];

  const sparkPaths = [
    "M0,18 L12,14 L24,16 L36,10 L48,12 L60,6 L72,9 L84,4 L96,7 L108,3 L120,5",
    "M0,15 L12,12 L24,14 L36,8 L48,11 L60,7 L72,10 L84,5 L96,8 L108,4 L120,6",
    "M0,14 L12,10 L24,13 L36,7 L48,9 L60,5 L72,8 L84,3 L96,6 L108,2 L120,4",
    "M0,16 L12,13 L24,15 L36,9 L48,11 L60,6 L72,10 L84,4 L96,7 L108,5 L120,3",
  ];

    const quickActions = [
      { label: "Aprovações", icon: UserCheck, route: "/dashboard/admin/approvals?role=admin", color: "text-emerald-500", bg: "bg-emerald-500/10" },
      { label: "Consultas", icon: CalendarCheck, route: "/dashboard/admin/appointments?role=admin", color: "text-blue-500", bg: "bg-blue-500/10" },
      { label: "Financeiro", icon: Wallet, route: "/dashboard/admin/financial?role=admin", color: "text-green-500", bg: "bg-green-500/10" },
      { label: "Relatórios", icon: Graph, route: "/dashboard/admin/reports?role=admin", color: "text-cyan-500", bg: "bg-cyan-500/10" },
      { label: "Leads", icon: UserPlus, route: "/dashboard/admin/leads?role=admin", color: "text-indigo-500", bg: "bg-indigo-500/10" },
      { label: "Broadcast", icon: Megaphone, route: "/dashboard/admin/broadcast?role=admin", color: "text-orange-500", bg: "bg-orange-500/10" },
      { label: "Segurança", icon: ShieldCheck, route: "/dashboard/admin/security?role=admin", color: "text-rose-500", bg: "bg-rose-500/10" },
      { label: "Contratos", icon: Handshake, route: "/dashboard/admin/contratos?role=admin", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    ];

  return (
    <DashboardLayout title="Centro de Painéis" nav={getAdminNav("panel-center")}>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">

        {/* ─────── HERO HEADER ─────── */}
        <motion.section variants={fadeUp}>
          <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-primary/[0.08] via-card to-card">
            {/* Decorative blobs */}
            <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 left-1/3 w-80 h-80 rounded-full bg-gradient-to-tr from-emerald-500/10 to-blue-500/10 blur-3xl pointer-events-none" />
            {/* Top accent line */}
            <div className="h-[3px] bg-gradient-to-r from-emerald-500 via-primary to-purple-500" />

            <div className="relative grid lg:grid-cols-[1fr_auto] gap-0">
              <div className="p-6 md:p-8 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">
                    <LayoutGrid className="w-3 h-3" />
                    Centro de Controle
                  </span>
                  <Badge variant="secondary" className="gap-1.5 font-mono text-[10px] h-6 backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE · {format(lastRefresh, "HH:mm:ss")}
                  </Badge>
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  Painéis da Plataforma
                </h1>
                <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-xl">
                  <span className="font-bold text-foreground">{totalOnline}</span> {totalOnline === 1 ? "pessoa online" : "pessoas online"} agora · sincronizado {formatDistanceToNow(lastRefresh, { locale: ptBR, addSuffix: true })}
                </p>

                <div className="flex flex-wrap gap-2 mt-5">
                  <Button
                    size="sm"
                    onClick={() => fetchPresence(true)}
                    disabled={refreshing}
                    className="gap-2 bg-gradient-to-br from-primary to-blue-700 hover:opacity-90 shadow-md shadow-primary/20"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                    Atualizar agora
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/dashboard/admin/live?role=admin")}
                    className="gap-2 backdrop-blur-sm bg-background/50"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Ver ao vivo
                  </Button>
                </div>
              </div>

              <div className="hidden lg:flex items-end justify-center pr-8 pl-4">
                <motion.img
                  src={pingoAdmin}
                  alt="Pingo Admin"
                  className="h-40 w-auto object-contain drop-shadow-2xl"
                  loading="lazy"
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </Card>
        </motion.section>

        {/* ─────── QUICK ACTIONS ─────── */}
        <motion.section variants={fadeUp} className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Zap className="w-5 h-5 text-amber-500" fill="currentColor" />
            <h2 className="text-lg font-bold text-foreground">Ações Rápidas</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-auto py-4 px-3 flex flex-col items-center gap-3 bg-card hover:bg-muted/50 border-border/40 rounded-2xl group transition-all"
                onClick={() => navigate(action.route)}
              >
                <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110", action.bg)}>
                  <action.icon className={cn("w-4 h-4", action.color)} />
                </div>
                <span className="text-[10px] font-bold text-foreground text-center line-clamp-1">{action.label}</span>
              </Button>
            ))}
          </div>
        </motion.section>

        {/* ─────── PLATFORM PULSE ─────── */}
        <motion.section variants={fadeUp} className="grid lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-12 border-border/40 bg-card/50 overflow-hidden">
            <div className="p-5 border-b border-border/40 flex items-center justify-between bg-primary/[0.03]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Status do Ecossistema</h3>
              </div>
              <button
                type="button"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                onClick={() => navigate("/dashboard/admin/maintenance?role=admin")}
              >
                Verificar serviços na Manutenção →
              </button>
            </div>
          </Card>

          <Card className="lg:col-span-8 border-border/40 bg-card/50 overflow-hidden">
            <div className="p-5 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-foreground">Receita confirmada (7d)</h3>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                Pagamentos confirmados
              </Badge>
            </div>
            <div className="h-[250px] p-4">
              {revenueData ? (
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <YAxis hide />
                  <RechartTooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Dados financeiros indisponíveis
                </div>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-4 border-border/40 bg-card/50 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Atividade Recente</h3>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase" onClick={() => navigate("/dashboard/admin/logs?role=admin")}>
                Ver Logs
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[250px] scrollbar-hide">
              {liveActivity.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {liveActivity.map((activity, idx) => (
                    <div key={idx} className="p-3 hover:bg-primary/5 transition-colors group">
                      <div className="flex items-start gap-3">
                        <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", activity.panel.gradient.split(" ")[0].replace("from-", "bg-"))} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-foreground truncate">{activity.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{activity.page}</p>
                        </div>
                        <span className="text-[9px] text-muted-foreground tabular-nums bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {format(new Date(activity.lastSeen), "HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center opacity-50">
                  <Activity className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-widest">Aguardando atividade...</p>
                </div>
              )}
            </div>
          </Card>
        </motion.section>

        {/* ─────── KPI CARDS ─────── */}
        <motion.section
          variants={container}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
        >
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.label} variants={fadeUp} whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
                <Card className={cn(
                  "relative h-full border-border/40 bg-gradient-to-br from-card via-card to-muted/20",
                  "hover:shadow-lg transition-all duration-300 overflow-hidden group",
                  s.glow
                )}>
                  {/* Top gradient line */}
                  <div className={cn("h-[2px] bg-gradient-to-r opacity-80 group-hover:opacity-100 transition-opacity", s.gradient)} />
                  {/* Subtle bg blob */}
                  <div className={cn("absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br opacity-10 blur-2xl pointer-events-none", s.gradient)} />

                  <CardContent className="relative p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className={cn(
                        "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-md ring-1 ring-white/20 dark:ring-white/10",
                        s.gradient
                      )}>
                        <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
                      </div>
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1", s.ring, "text-muted-foreground")}>
                        Live
                      </span>
                    </div>

                    <div className="text-3xl md:text-4xl font-black tabular-nums leading-none text-foreground tracking-tight">
                      {s.value}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 mt-1.5">
                      {s.label}
                    </div>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                      {s.sublabel}
                    </p>

                    <svg
                      viewBox="0 0 120 24"
                      className="w-full h-6 mt-2"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d={sparkPaths[i]}
                        className={cn(s.sparkColor, "opacity-70 group-hover:opacity-100 transition-opacity")}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.section>

        {/* ─────── PANELS GRID (now primary) ─────── */}
        <motion.section variants={fadeUp} className="space-y-4">
          <div className="flex items-end justify-between flex-wrap gap-4 px-1">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                <SquaresFour className="w-6 h-6 text-primary" weight="fill" />
                Painéis de Controle
              </h2>
              <p className="text-sm text-muted-foreground font-medium">Gerencie e monitore cada módulo da plataforma</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 py-1 px-3 text-[11px] font-bold uppercase tracking-wider bg-primary/5 border-primary/10 text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                {PANELS.length} painéis configurados
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {panels.map((panel) => {
              const Icon = panel.icon;
              const hasOnline = panel.onlineCount > 0;
              return (
                <motion.div
                  key={panel.id}
                  variants={fadeUp}
                  whileHover={{ y: -5 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className={cn(
                      "relative overflow-hidden cursor-pointer group h-full border-border/40",
                      "bg-gradient-to-br from-card via-card to-muted/30 hover:to-primary/[0.03]",
                      "hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:border-primary/40 transition-all duration-500",
                      hasOnline && panel.glow
                    )}
                    onClick={() => navigate(panel.route)}
                  >
                    {/* Top gradient line */}
                    <div className={cn("h-[3px] bg-gradient-to-r opacity-70 group-hover:opacity-100 transition-opacity", panel.gradient)} />
                    
                    {/* Background patterns */}
                    <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
                      <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,var(--tw-gradient-from),transparent_60%)]" />
                    </div>

                    <CardContent className="relative p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-lg ring-1 ring-white/20 dark:ring-white/10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500",
                          panel.gradient
                        )}>
                          <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                        </div>
                        
                        <div className="flex flex-col items-end gap-1.5">
                          {hasOnline ? (
                            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ring-1 ring-emerald-500/30 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                              {panel.onlineCount} Online
                            </div>
                          ) : (
                            <div className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground ring-1 ring-border/50">
                              Offline
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-base font-black text-foreground group-hover:text-primary transition-colors tracking-tight">
                          {panel.label}
                        </h3>
                        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2 min-h-[3em]">
                          {panel.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/40">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Total Usuários</span>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-primary/60" />
                            <span className="text-sm font-black text-foreground tabular-nums tracking-tight">{panel.totalUsers.toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 shadow-sm",
                          "bg-muted/40 group-hover:bg-primary group-hover:shadow-primary/20",
                        )}>
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all duration-500" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ─────── ACTIVITY FEED ─────── */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Distribution chart (spans 3 cols at top of activity row on mobile, sits beside on lg) */}
          <motion.div variants={fadeUp} className="lg:col-span-3">
            <Card className="border-border/40 bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden">
              <div className="h-[2px] bg-gradient-to-r from-primary via-violet-500 to-emerald-500" />
              <CardContent className="p-4 md:p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-md ring-1 ring-white/20">
                    <PieChart className="w-4 h-4 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground leading-tight">Distribuição por painel</h2>
                    <p className="text-[11px] text-muted-foreground">Usuários cadastrados em cada módulo</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                    {totalUsers} totais
                  </Badge>
                </div>
                <div className="h-[220px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={panels
                        .filter(p => p.id !== "ai-assistant")
                        .map(p => ({
                          name: p.label,
                          total: p.totalUsers,
                          online: p.onlineCount,
                          gradient: p.gradient,
                        }))}
                      margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                      barCategoryGap={14}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10.5, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        width={28}
                      />
                      <RechartTooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          fontSize: 12,
                          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                        }}
                        formatter={(value: number, name: string) => [
                          `${value}`,
                          name === "total" ? "Cadastrados" : "Online",
                        ]}
                      />
                      <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                        {panels
                          .filter(p => p.id !== "ai-assistant")
                          .map((p, idx) => {
                            const colorMap: Record<string, string> = {
                              admin: "hsl(215 75% 38%)",
                              clinic: "hsl(265 75% 56%)",
                              doctor: "hsl(160 70% 42%)",
                              patient: "hsl(220 90% 56%)",
                              receptionist: "hsl(35 90% 52%)",
                              support: "hsl(345 80% 60%)",
                              partner: "hsl(175 70% 42%)",
                            };
                            return <Cell key={p.id} fill={colorMap[p.id] ?? "hsl(var(--primary))"} />;
                          })}
                      </Bar>
                      <Bar dataKey="online" radius={[8, 8, 0, 0]} fill="hsl(145 70% 48%)" opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-5 mt-1 text-[10.5px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> Cadastrados
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Online agora
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Card className="h-full border-border/40 bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden">
              <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-primary to-purple-500" />
              <CardContent className="p-4 md:p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md ring-1 ring-white/20">
                    <Activity className="w-4 h-4 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground leading-tight">Atividade em tempo real</h2>
                    <p className="text-[11px] text-muted-foreground">{liveActivity.length} eventos · atualiza a cada 15s</p>
                  </div>
                  <Badge variant="secondary" className="gap-1 text-[10px] font-mono">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE
                  </Badge>
                </div>

                {liveActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted/30 flex items-center justify-center mb-3 ring-1 ring-border/40">
                      <Sparkles className="w-6 h-6 text-muted-foreground/60" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Nenhum usuário online</p>
                    <p className="text-xs text-muted-foreground mt-0.5">A presença atualiza automaticamente</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {liveActivity.map((u, i) => {
                      const Icon = u.panel.icon;
                      return (
                        <motion.button
                          key={`${u.name}-${i}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => navigate(u.panel.route)}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 ring-1 ring-transparent hover:ring-border/60 transition-all text-left group"
                        >
                          <div className={cn(
                            "shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm ring-1 ring-white/20",
                            u.panel.gradient
                          )}>
                            <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                              </span>
                              <p className="text-xs font-semibold text-foreground truncate">{u.name}</p>
                            </div>
                            <p className="text-[10.5px] text-muted-foreground font-mono truncate">
                              {u.panel.label} · {u.page || "/"}
                            </p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Sync card */}
          <motion.div variants={fadeUp}>
            <Card className="h-full border-border/40 bg-gradient-to-br from-primary/[0.08] via-card to-card overflow-hidden relative">
              <div className="absolute -bottom-16 -right-12 w-48 h-48 rounded-full bg-gradient-to-br from-primary/15 to-purple-500/10 blur-3xl pointer-events-none" />
              <CardContent className="relative p-5 flex flex-col h-full">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center mb-3 shadow-md ring-1 ring-white/20">
                  <RefreshCw className={cn("w-5 h-5 text-white", refreshing && "animate-spin")} strokeWidth={2.2} />
                </div>
                <h3 className="text-sm font-bold text-foreground">Sincronização</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Dados de presença em tempo real via Realtime do Supabase.
                </p>
                <div className="mt-4 space-y-2 text-[11px]">
                  <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">Última atualização</span>
                    <span className="font-mono font-semibold text-foreground">{format(lastRefresh, "HH:mm:ss")}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">Intervalo</span>
                    <span className="font-mono font-semibold text-foreground">15s</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Painéis ativos</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{activePanels}/{PANELS.length}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => fetchPresence(true)}
                  disabled={refreshing}
                  className="mt-auto w-full gap-2 text-xs bg-gradient-to-br from-primary to-blue-700 hover:opacity-90 shadow-md shadow-primary/20"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                  Atualizar agora
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        
        {/* ─────── QUICK SYSTEM ACTIONS ─────── */}
        <motion.section variants={fadeUp} className="space-y-4 pt-4">
          <div className="flex items-center gap-2 px-1">
            <Settings2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground tracking-tight">Ações Rápidas do Sistema</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: "Logs de Erro", icon: ShieldAlert, color: "text-rose-500", bg: "bg-rose-500/10", route: "/dashboard/admin/logs?role=admin" },
              { label: "Site Config", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10", route: "/dashboard/admin/site-config?role=admin" },
              { label: "Relatórios", icon: PieChart, color: "text-amber-500", bg: "bg-amber-500/10", route: "/dashboard/admin/reports?role=admin" },
              { label: "Banco Dados", icon: Database, color: "text-emerald-500", bg: "bg-emerald-500/10", route: "/dashboard/admin/health?role=admin" },
              { label: "Auditoria", icon: ShieldCheck, color: "text-indigo-500", bg: "bg-indigo-500/10", route: "/dashboard/admin/logs?role=admin" },
              { label: "Usuários", icon: UserPlus, color: "text-orange-500", bg: "bg-orange-500/10", route: "/dashboard/admin/users?role=admin" },
            ].map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-auto flex flex-col items-center gap-2 p-3 border-border/40 bg-card/40 hover:bg-card hover:border-primary/40 hover:shadow-lg transition-all group overflow-hidden relative"
                onClick={() => navigate(action.route)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 relative z-10", action.bg)}>
                  <action.icon className={cn("w-5 h-5", action.color)} />
                </div>
                <span className="text-[11px] font-black text-foreground relative z-10 tracking-tight">{action.label}</span>
              </Button>
            ))}
          </div>
        </motion.section>

      </motion.div>
    </DashboardLayout>
  );
};

export default PanelCenter;
