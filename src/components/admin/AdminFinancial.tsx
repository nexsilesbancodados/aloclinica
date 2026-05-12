import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/integrations/supabase/untyped";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Search, Download,
  CreditCard, Receipt, Clock, CheckCircle2, XCircle, RefreshCw, Banknote, Wallet,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { exportToCSV } from "@/lib/csv";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart } from "recharts";

const adminNav = getAdminNav("financial");

interface AppointmentPayment {
  id: string;
  status: string;
  payment_status: string | null;
  scheduled_at: string;
  created_at: string;
  payment_confirmed_at: string | null;
  cancel_reason: string | null;
  doctor_id: string;
  patient_id: string | null;
  guest_patient_id: string | null;
  doctor_name?: string;
  patient_name?: string;
  consultation_price?: number;
  price_at_booking?: number | null;
}

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  pix_key: string | null;
  pix_key_type: string | null;
  status: string;
  notes: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  doctor_name?: string;
}

const statusColors: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  pending: "bg-amber-500/10 text-amber-600 border-amber-200",
  cancelled: "bg-red-500/10 text-red-600 border-red-200",
  refunded: "bg-purple-500/10 text-purple-600 border-purple-200",
  overdue: "bg-orange-500/10 text-orange-600 border-orange-200",
  confirmed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
};

const statusLabels: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  cancelled: "Cancelado",
  refunded: "Estornado",
  overdue: "Vencido",
  confirmed: "Confirmado",
  scheduled: "Agendado",
  completed: "Concluído",
  in_progress: "Em andamento",
};

const withdrawalStatusConfig: Record<string, { label: string; className: string }> = {
  pending:    { label: "Pendente",    className: "bg-amber-500/10 text-amber-600 border-amber-200" },
  approved:   { label: "Aprovado",   className: "bg-green-500/10 text-green-600 border-green-200" },
  rejected:   { label: "Rejeitado",  className: "bg-red-500/10 text-red-600 border-red-200" },
  processing: { label: "Processando", className: "bg-blue-500/10 text-blue-600 border-blue-200" },
  completed:  { label: "Concluído",  className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  failed:     { label: "Falhou",     className: "bg-red-500/10 text-red-600 border-red-200" },
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#f59e0b", "#ef4444", "#8b5cf6"];

const AdminFinancial = () => {
  const [appointments, setAppointments] = useState<AppointmentPayment[]>([]);
  const [commissionData, setCommissionData] = useState<{ doctor_name: string; count: number; revenue: number; commission: number }[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; revenue: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<string>("30");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Withdrawal state
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null); // withdrawal id being actioned

  useEffect(() => {
    fetchData();
    fetchWithdrawals();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    const FINANCIAL_FETCH_LIMIT = 5000;
    const { data: appts, count: totalAppts } = await db
      .from("appointments")
      .select("id, status, payment_status, scheduled_at, created_at, payment_confirmed_at, cancel_reason, doctor_id, patient_id, guest_patient_id", { count: "exact" })
      .gte("created_at", daysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(FINANCIAL_FETCH_LIMIT);

    if (!appts) { setLoading(false); return; }
    if ((totalAppts ?? 0) > FINANCIAL_FETCH_LIMIT) {
      // Avisa admin que KPIs podem estar incompletos
      toast.warning(`Período tem ${totalAppts} consultas, calculando KPIs com as ${FINANCIAL_FETCH_LIMIT} mais recentes`, {
        description: "Reduza o período pra ver dados completos.",
      });
    }

    // Fetch doctor names and prices
    const doctorIds = [...new Set(appts.map(a => a.doctor_id))];
    const { data: docProfiles } = await db
      .from("doctor_profiles")
      .select("id, user_id, consultation_price")
      .in("id", doctorIds);
    const docPriceMap = new Map(docProfiles?.map(d => [d.id, Number(d.consultation_price) || 89]) ?? []);

    const userIds = [...new Set([
      ...(docProfiles?.map(d => d.user_id) ?? []),
      ...appts.filter(a => a.patient_id).map(a => a.patient_id!),
    ])];

    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) ?? []);
    const docUserMap = new Map(docProfiles?.map(d => [d.id, d.user_id]) ?? []);

    // Fetch guest patient names
    const guestIds = appts.filter(a => a.guest_patient_id).map(a => a.guest_patient_id!);
    let guestMap = new Map<string, string>();
    if (guestIds.length > 0) {
      const { data: guests } = await db
        .from("guest_patients")
        .select("id, full_name")
        .in("id", guestIds);
      guestMap = new Map(guests?.map(g => [g.id, g.full_name]) ?? []);
    }

    const enriched: AppointmentPayment[] = appts.map(a => ({
      ...a,
      consultation_price: docPriceMap.get(a.doctor_id) ?? 89,
      doctor_name: profileMap.get(docUserMap.get(a.doctor_id) ?? "") ?? "—",
      patient_name: a.patient_id
        ? profileMap.get(a.patient_id) ?? "—"
        : a.guest_patient_id
          ? guestMap.get(a.guest_patient_id) ?? "Convidado"
          : "—",
    }));

    setAppointments(enriched);

    // Calculate commission breakdown per doctor
    const doctorRevenue = new Map<string, { name: string; count: number; revenue: number }>();
    enriched.forEach(a => {
      if (a.payment_status === "approved" || a.payment_status === "confirmed") {
        const price = a.consultation_price ?? 89;
        const existing = doctorRevenue.get(a.doctor_id) || { name: a.doctor_name || "—", count: 0, revenue: 0 };
        existing.count++;
        existing.revenue += price;
        doctorRevenue.set(a.doctor_id, existing);
      }
    });
    setCommissionData(
      Array.from(doctorRevenue.values())
        .map(d => ({ doctor_name: d.name, count: d.count, revenue: d.revenue, commission: d.revenue * 0.5 }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
    );

    // Monthly trend (last 6 months)
    const months: { month: string; revenue: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = format(d, "yyyy-MM");
      const monthLabel = format(d, "MMM/yy", { locale: ptBR });
      const monthAppts = enriched.filter(a => a.created_at.startsWith(monthKey) && (a.payment_status === "approved" || a.payment_status === "confirmed"));
      const monthRevenue = monthAppts.reduce((sum, a) => sum + (a.consultation_price ?? 89), 0);
      months.push({ month: monthLabel, revenue: monthRevenue, count: monthAppts.length });
    }
    setMonthlyTrend(months);

    setLoading(false);
  };

  const fetchWithdrawals = async () => {
    setWithdrawalsLoading(true);
    const { data: wrs, error } = await db
      .from("withdrawal_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Error fetching withdrawals:", error);
      setWithdrawalsLoading(false);
      return;
    }

    if (!wrs || wrs.length === 0) {
      setWithdrawals([]);
      setWithdrawalsLoading(false);
      return;
    }

    // Fetch doctor names from profiles
    const userIds = [...new Set(wrs.map(w => w.user_id))];
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) ?? []);

    const enriched: WithdrawalRequest[] = wrs.map(w => ({
      ...w,
      doctor_name: profileMap.get(w.user_id) ?? "—",
    }));

    setWithdrawals(enriched);
    setWithdrawalsLoading(false);
  };

  const handleWithdrawalAction = async (
    withdrawal: WithdrawalRequest,
    action: "approve" | "reject" | "process",
    adminNotes?: string
  ) => {
    setActionLoading(withdrawal.id);
    try {
      const { data, error } = await db.functions.invoke("mercadopago-withdraw", {
        body: {
          withdrawal_id: withdrawal.id,
          action,
          admin_notes: adminNotes ?? undefined,
        },
      });

      if (error || (data as any)?.error) {
        const errMsg = (data as { error?: string } | null)?.error ?? error?.message ?? "Erro ao processar ação";
        const needsManual = (data as any)?.needs_manual;
        if (needsManual) {
          toast.warning("Money Out não habilitado", { description: errMsg });
        } else {
          toast.error(errMsg);
        }
        return;
      }

      const actionLabels: Record<string, string> = {
        approve: "aprovado",
        reject: "rejeitado",
        process: "processado",
      };
      toast.success(`Saque ${actionLabels[action]} com sucesso`);
      await fetchWithdrawals();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectDialog = (withdrawal: WithdrawalRequest) => {
    setRejectTarget(withdrawal);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setRejectDialogOpen(false);
    await handleWithdrawalAction(rejectTarget, "reject", rejectReason || undefined);
    setRejectTarget(null);
    setRejectReason("");
  };

  // KPIs
  const totalRevenue = appointments
    .filter(a => a.payment_status === "approved" || a.payment_status === "confirmed")
    .reduce((sum, a) => sum + (a.consultation_price ?? 89), 0);

  const pendingPayments = appointments.filter(a => a.payment_status === "pending").length;
  const overduePayments = appointments.filter(a => a.payment_status === "overdue").length;
  const confirmedPayments = appointments.filter(a => a.payment_status === "approved" || a.payment_status === "confirmed").length;
  const cancelledPayments = appointments.filter(a => a.status === "cancelled").length;
  const totalAppointments = appointments.length;

  // Charts
  const paymentStatusData = [
    { name: "Confirmados", value: confirmedPayments },
    { name: "Pendentes", value: pendingPayments },
    { name: "Vencidos", value: overduePayments },
    { name: "Cancelados", value: cancelledPayments },
  ].filter(d => d.value > 0);

  // Daily revenue (last 7 days)
  const last7days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const dailyData = last7days.map(day => {
    const dayStr = format(day, "yyyy-MM-dd");
    const count = appointments.filter(a =>
      a.created_at.startsWith(dayStr) &&
      (a.payment_status === "approved" || a.payment_status === "confirmed")
    ).length;
    return {
      day: format(day, "dd/MM", { locale: ptBR }),
      receita: count * 89.9,
      consultas: count,
    };
  });

  // Filtered list
  const filtered = useMemo(() => appointments.filter(a => {
    if (filter !== "all") {
      if (filter === "paid" && a.payment_status !== "approved" && a.payment_status !== "confirmed") return false;
      if (filter === "pending" && a.payment_status !== "pending") return false;
      if (filter === "overdue" && a.payment_status !== "overdue") return false;
      if (filter === "cancelled" && a.status !== "cancelled") return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return (
        a.doctor_name?.toLowerCase().includes(s) ||
        a.patient_name?.toLowerCase().includes(s) ||
        a.id.toLowerCase().includes(s)
      );
    }
    return true;
  }), [appointments, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filtered, currentPage],
  );

  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [filter, search, period]);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nenhuma transa\u00E7\u00E3o para exportar");
      return;
    }
    exportToCSV(
      `financeiro_${format(new Date(), "yyyy-MM-dd")}.csv`,
      filtered.map(a => ({
        id: a.id,
        paciente: a.patient_name ?? "",
        medico: a.doctor_name ?? "",
        data: format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        status: statusLabels[a.status] ?? a.status,
        pagamento: statusLabels[a.payment_status ?? "pending"] ?? a.payment_status ?? "",
        valor: a.price_at_booking != null
          ? `R$ ${Number(a.price_at_booking).toFixed(2)}`
          : a.consultation_price != null
            ? `R$ ${Number(a.consultation_price).toFixed(2)}`
            : "",
      })),
      [
        { key: "id", label: "ID" },
        { key: "paciente", label: "Paciente" },
        { key: "medico", label: "Médico" },
        { key: "data", label: "Data" },
        { key: "status", label: "Status" },
        { key: "pagamento", label: "Pagamento" },
        { key: "valor", label: "Valor" },
      ],
    );
    toast.success(`${filtered.length} transação${filtered.length === 1 ? "" : "s"} exportada${filtered.length === 1 ? "" : "s"}`);
  };

  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;

  return (
    <DashboardLayout title="Admin" nav={adminNav}>
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Wallet}
          eyebrow="Financeiro"
          title="Painel Financeiro"
          description="Receita, pagamentos, saques e inadimplência da plataforma."
          accent="from-green-500 to-emerald-600"
          badge={
            pendingWithdrawals > 0
              ? { label: `${pendingWithdrawals} saque${pendingWithdrawals === 1 ? "" : "s"} pendente${pendingWithdrawals === 1 ? "" : "s"}`, tone: "warning" }
              : undefined
          }
          actions={
            <>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { fetchData(); fetchWithdrawals(); }} aria-label="Atualizar">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </>
          }
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="kpi">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Receita Estimada
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" /> {confirmedPayments} pagos
              </p>
            </CardContent>
          </Card>

          <Card variant="kpi">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="w-4 h-4 text-amber-500" />
                Pendentes
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{pendingPayments}</p>
              <p className="text-xs text-muted-foreground mt-1">aguardando pagamento</p>
            </CardContent>
          </Card>

          <Card variant="kpi">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Inadimplentes
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{overduePayments}</p>
              <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                <TrendingDown className="w-3 h-3" /> vencidos
              </p>
            </CardContent>
          </Card>

          <Card variant="kpi">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Receipt className="w-4 h-4 text-primary" />
                Total Consultas
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{totalAppointments}</p>
              <p className="text-xs text-muted-foreground mt-1">no período</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card variant="elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Receita Diária (7 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                    />
                    <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Status dos Pagamentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                {paymentStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {paymentStatusData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Nenhum dado disponível
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Trend + Commission Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card variant="elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Tendência Mensal (6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                {monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "revenue" ? `R$ ${value.toFixed(2)}` : value,
                          name === "revenue" ? "Receita" : "Consultas"
                        ]}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" /> Comissões por Médico (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] overflow-y-auto">
                {commissionData.length > 0 ? (
                  <div className="space-y-2">
                    {commissionData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-primary w-5">{i + 1}.</span>
                          <span className="text-sm font-medium truncate">{d.doctor_name}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{d.count} consultas</Badge>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground">R$ {d.commission.toFixed(0)}</p>
                          <p className="text-[10px] text-muted-foreground">de R$ {d.revenue.toFixed(0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions + Withdrawals Tabs */}
        <Tabs defaultValue="transactions">
          <TabsList className="mb-4">
            <TabsTrigger value="transactions">
              <Receipt className="w-4 h-4 mr-1.5" />
              Transações
            </TabsTrigger>
            <TabsTrigger value="saques" className="relative">
              <Banknote className="w-4 h-4 mr-1.5" />
              Saques
              {pendingWithdrawals > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {pendingWithdrawals > 9 ? "9+" : pendingWithdrawals}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ---- Transactions Tab ---- */}
          <TabsContent value="transactions">
            <Card variant="elevated">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base">Transações</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 w-[200px]"
                      />
                    </div>
                    <Select value={filter} onValueChange={setFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="paid">Pagos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="overdue">Vencidos</SelectItem>
                        <SelectItem value="cancelled">Cancelados</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="w-4 h-4 mr-1" /> CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma transação encontrada</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Médico</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pagamento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.patient_name}</TableCell>
                            <TableCell>{a.doctor_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(a.created_at), "dd/MM/yy HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusColors[a.status] || ""}>
                                {statusLabels[a.status] || a.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusColors[a.payment_status || "pending"] || ""}>
                                {a.payment_status === "approved" || a.payment_status === "confirmed" ? (
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                ) : a.payment_status === "overdue" ? (
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                ) : a.status === "cancelled" ? (
                                  <XCircle className="w-3 h-3 mr-1" />
                                ) : (
                                  <Clock className="w-3 h-3 mr-1" />
                                )}
                                {statusLabels[a.payment_status || "pending"] || a.payment_status || "Pendente"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <p className="text-xs text-muted-foreground">
                          Mostrando {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground tabular-nums px-2">
                            {currentPage + 1} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage >= totalPages - 1}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- Saques Tab ---- */}
          <TabsContent value="saques">
            <Card variant="elevated">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-primary" />
                    Solicitações de Saque
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchWithdrawals} disabled={withdrawalsLoading}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${withdrawalsLoading ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {withdrawalsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : withdrawals.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma solicitação de saque encontrada</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Médico</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Chave PIX</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.map(w => {
                          const statusCfg = withdrawalStatusConfig[w.status] ?? {
                            label: w.status,
                            className: "bg-muted text-muted-foreground",
                          };
                          const isActioning = actionLoading === w.id;

                          return (
                            <TableRow key={w.id}>
                              <TableCell className="font-medium">{w.doctor_name}</TableCell>
                              <TableCell className="tabular-nums font-semibold">
                                R$ {Number(w.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm truncate max-w-[160px]">{w.pix_key}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase">{w.pix_key_type}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusCfg.className}>
                                  {statusCfg.label}
                                </Badge>
                                {w.admin_notes && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate" title={w.admin_notes}>
                                    {w.admin_notes}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {format(new Date(w.created_at), "dd/MM/yy HH:mm")}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {w.status === "pending" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                                        disabled={isActioning}
                                        onClick={() => handleWithdrawalAction(w, "approve")}
                                      >
                                        {isActioning ? (
                                          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                        )}
                                        Aprovar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                                        disabled={isActioning}
                                        onClick={() => openRejectDialog(w)}
                                      >
                                        <XCircle className="w-3.5 h-3.5 mr-1" />
                                        Rejeitar
                                      </Button>
                                    </>
                                  )}
                                  {w.status === "approved" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                                      disabled={isActioning}
                                      onClick={() => handleWithdrawalAction(w, "process")}
                                    >
                                      {isActioning ? (
                                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block mr-1" />
                                      ) : (
                                        <Banknote className="w-3.5 h-3.5 mr-1" />
                                      )}
                                      Processar
                                    </Button>
                                  )}
                                  {(w.status === "completed" || w.status === "rejected" || w.status === "failed" || w.status === "processing") && (
                                    <span className="text-xs text-muted-foreground italic">
                                      {w.status === "completed" && w.processed_at
                                        ? `Pago em ${format(new Date(w.processed_at), "dd/MM/yy")}`
                                        : w.status === "rejected" && w.reviewed_at
                                          ? `Rejeitado em ${format(new Date(w.reviewed_at), "dd/MM/yy")}`
                                          : w.status === "processing"
                                            ? "Em processamento..."
                                            : "—"}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reject Confirmation Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar Solicitação de Saque</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {rejectTarget && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                  <p><span className="font-medium">Médico:</span> {rejectTarget.doctor_name}</p>
                  <p><span className="font-medium">Valor:</span> R$ {Number(rejectTarget.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <p><span className="font-medium">Chave PIX:</span> {rejectTarget.pix_key} ({rejectTarget.pix_key_type})</p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Motivo da rejeição <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <Textarea
                  placeholder="Informe o motivo para o médico..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmReject}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Confirmar Rejeição
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminFinancial;
