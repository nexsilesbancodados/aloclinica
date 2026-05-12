import { useState, useEffect, useMemo } from "react";
import mascotWave from "@/assets/mascot-wave.png";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getDoctorNav } from "./doctorNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
 import { Search, Video, FileText, Download, Filter, Calendar as CalendarIcon, Users, ArrowLeft, MoreHorizontal, Clock } from "lucide-react";
 import { motion } from "framer-motion";
import { format, isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

const statusColor: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary border-primary/20",
  waiting: "bg-warning/10 text-warning border-warning/20",
  in_progress: "bg-success/10 text-success border-success/20",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  no_show: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabel: Record<string, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
  in_progress: "Em andamento",
  waiting: "Esperando",
  no_show: "Ausente",
};

const PERIOD_OPTIONS = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "last3", label: "Últimos 3 meses" },
  { value: "custom", label: "Período personalizado" },
];

const DoctorConsultations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarStep, setCalendarStep] = useState<"from" | "to">("from");

  const [doctorIdLocal, setDoctorIdLocal] = useState<string | null>(null);

  useEffect(() => { if (user) fetchAppointments(); }, [user]);

  // Realtime sync — FILTRADO por doctor_id (antes recebia eventos de todos os medicos)
  useEffect(() => {
    if (!user || !doctorIdLocal) return;
    const channel = db
      .channel(`doctor-consultations-${doctorIdLocal}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "appointments",
        filter: `doctor_id=eq.${doctorIdLocal}`,
      }, () => fetchAppointments())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [user, doctorIdLocal]);

  const fetchAppointments = async () => {
    const { data: docProfile } = await db.from("doctor_profiles").select("id").eq("user_id", user!.id).single();
    if (!docProfile) { setLoading(false); return; }
    setDoctorIdLocal(docProfile.id);

    const { data } = await db.from("appointments")
      .select("id, scheduled_at, status, patient_id, duration_minutes, notes, guest_patient_id")
      .eq("doctor_id", docProfile.id)
      .order("scheduled_at", { ascending: false })
      .limit(300);

    if (!data || data.length === 0) { setAppointments([]); setLoading(false); return; }

    const patientIds = [...new Set(data.filter(a => a.patient_id).map(a => a.patient_id))];
    const guestIds = [...new Set(data.filter(a => a.guest_patient_id).map(a => a.guest_patient_id))];

    const [profilesRes, guestsRes] = await Promise.all([
      patientIds.length > 0
        ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => !!id))
        : { data: [] },
      guestIds.length > 0
        ? db.from("guest_patients").select("id, full_name").in("id", guestIds.filter((id): id is string => !!id))
        : { data: [] },
    ]);

    const pMap = new Map((profilesRes.data ?? []).map((p: { user_id: string; first_name: string; last_name: string }) => [p.user_id, `${p.first_name} ${p.last_name}`]));
    const gMap = new Map((guestsRes.data ?? []).map((g: { id: string; full_name: string }) => [g.id, g.full_name]));

    setAppointments(data.map(a => ({
      ...a,
      patient_name: a.patient_id ? (pMap.get(a.patient_id ?? "") ?? "Paciente") : (gMap.get(a.guest_patient_id ?? "") ?? "Paciente Avulso"),
    })));
    setLoading(false);
  };

  const getDateRange = () => {
    const now = new Date();
    if (period === "today") return { start: startOfDay(now), end: endOfDay(now) };
    if (period === "week") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    if (period === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
    if (period === "last3") return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    if (period === "custom" && customFrom && customTo) return { start: startOfDay(customFrom), end: endOfDay(customTo) };
    return null;
  };

  const filtered = useMemo(() => {
    const range = getDateRange();
    return appointments.filter(a => {
      const matchSearch = !search || a.patient_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || a.status === filterStatus;
      const matchDate = !range || isWithinInterval(new Date(a.scheduled_at), range);
      return matchSearch && matchStatus && matchDate;
    });
  }, [appointments, search, filterStatus, period, customFrom, customTo]);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    if (calendarStep === "from") {
      setCustomFrom(date);
      setCalendarStep("to");
    } else {
      setCustomTo(date);
      setCalendarOpen(false);
      setCalendarStep("from");
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Paciente", "Data", "Hora", "Duração", "Status"],
      ...filtered.map(a => [
        a.patient_name,
        format(new Date(a.scheduled_at), "dd/MM/yyyy"),
        format(new Date(a.scheduled_at), "HH:mm"),
        `${a.duration_minutes || 30}min`,
        statusLabel[a.status] ?? a.status,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `consultas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Consultas", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 28);
    doc.text(`Total: ${filtered.length} consulta(s)`, 14, 35);

    let y = 48;
    filtered.forEach((a, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.text(`${i + 1}. ${a.patient_name}`, 14, y);
      doc.setFontSize(9);
      doc.text(
        `${format(new Date(a.scheduled_at), "dd/MM/yyyy 'às' HH:mm")} | ${statusLabel[a.status] ?? a.status} | ${a.duration_minutes || 30}min`,
        14, y + 6
      );
      y += 16;
    });

    doc.save(`consultas-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  const completedCount = appointments.filter(a => a.status === "completed").length;
  const scheduledCount = appointments.filter(a => a.status === "scheduled").length;

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("consultations")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        {/* Modern Header Section */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate("/dashboard")}
                className="rounded-full hover:bg-muted"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground">Minhas Consultas</h1>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Atendimento Profissional</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} className="rounded-xl h-9 px-4 hidden sm:flex">
                <Download className="w-4 h-4 mr-2" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} className="rounded-xl h-9 px-4 hidden sm:flex">
                <FileText className="w-4 h-4 mr-2" /> PDF
              </Button>
              <Button variant="ghost" size="icon" className="sm:hidden rounded-full">
                <MoreHorizontal className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* KPI Mini Bento */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Agendadas", value: scheduledCount, color: "text-blue-600", bg: "bg-blue-50/50" },
              { label: "Concluídas", value: completedCount, color: "text-emerald-600", bg: "bg-emerald-50/50" },
              { label: "Total", value: appointments.length, color: "text-slate-600", bg: "bg-slate-50/50" },
            ].map(k => (
              <div key={k.label} className={cn("rounded-2xl p-3 border border-border/10", k.bg)}>
                <p className={cn("text-lg font-black leading-none", k.color)}>{k.value}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 mt-1">{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Modern Filters */}
        <div className="rounded-3xl border border-border/20 bg-card/60 backdrop-blur-md p-2 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Buscar por nome do paciente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-11 text-sm rounded-2xl border-transparent bg-muted/40 focus:bg-background focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-11 rounded-2xl border-transparent bg-muted/40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="all">Status</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="waiting">Esperando</SelectItem>
                  <SelectItem value="in_progress">Atendimento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={v => { setPeriod(v); if (v === "custom") setCalendarOpen(true); }}>
                <SelectTrigger className="w-[140px] h-11 rounded-2xl border-transparent bg-muted/40">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Results Counter */}
        {filtered.length !== appointments.length && (
          <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest px-1">
            Resultados: {filtered.length} de {appointments.length}
          </p>
        )}

        {/* List — mobile-friendly cards */}
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border border-border/20 bg-card">
                <Skeleton className="w-11 h-11 rounded-xl" />
                <div className="space-y-2 flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border-2 border-dashed border-border/30">
            <img src={mascotWave} alt="Pingo" className="w-20 h-20 object-contain mx-auto mb-3 select-none" style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,.15))" }} loading="lazy" decoding="async" width={80} height={80} />
            <p className="text-sm font-bold text-foreground mb-1">Nenhuma consulta encontrada</p>
            <p className="text-xs text-muted-foreground">Tente ajustar os filtros</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(a => {
              const stripeColor = a.status === "in_progress" ? "bg-emerald-500"
                : a.status === "waiting" ? "bg-amber-500"
                : a.status === "completed" ? "bg-muted-foreground/30"
                : a.status === "cancelled" || a.status === "no_show" ? "bg-destructive/60"
                : "bg-primary/40";
               return (
                 <motion.div
                   key={a.id}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   whileHover={{ y: -4, transition: { duration: 0.2 } }}
                   className="group relative flex overflow-hidden rounded-[24px] border border-border/40 bg-card/60 backdrop-blur-sm transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-emerald-500/20"
                 >
                   <div className={`w-1.5 shrink-0 ${stripeColor} opacity-80`} />
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4 flex-1 min-w-0">
                     <div className="flex items-center gap-4 min-w-0 flex-1">
                       <div className="relative">
                         <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 flex items-center justify-center shrink-0 border border-emerald-500/10 shadow-sm transition-transform group-hover:scale-110 duration-300">
                           <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                         </div>
                         {a.status === "waiting" && (
                           <span className="absolute -top-1 -right-1 flex h-3 w-3">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                           </span>
                         )}
                       </div>
                       <div className="min-w-0">
                         <p className="text-[14px] font-bold text-foreground truncate group-hover:text-emerald-600 transition-colors">{a.patient_name}</p>
                         <div className="flex items-center gap-2 mt-0.5">
                           <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                             <CalendarIcon className="w-3 h-3" />
                             {format(new Date(a.scheduled_at), "dd/MM/yy")}
                           </div>
                           <span className="text-[10px] text-muted-foreground opacity-30">•</span>
                           <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                             <Clock className="w-3 h-3" />
                             {format(new Date(a.scheduled_at), "HH:mm")}
                           </div>
                         </div>
                       </div>
                     </div>
                     <div className="flex items-center gap-3 shrink-0">
                       <span className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border-0 shadow-sm ${statusColor[a.status] ?? "bg-muted text-muted-foreground"}`}>
                         {statusLabel[a.status] ?? a.status}
                       </span>
                       {(a.status === "scheduled" || a.status === "waiting") && (
                         <Button
                           size="sm"
                           className="rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold h-9 px-4 gap-2 shadow-[0_4px_12px_rgba(16,185,129,0.2)] transition-all active:scale-95"
                           onClick={() => navigate(`/dashboard/consultation/${a.id}`)}
                         >
                           <Video className="w-3.5 h-3.5" /> Chamar
                         </Button>
                       )}
                       {a.status === "completed" && (
                         <Button
                           size="sm"
                           variant="outline"
                           className="text-[11px] font-bold h-9 px-4 rounded-2xl gap-2 border-border/50 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all"
                           onClick={() => navigate(`/dashboard/prescribe/${a.id}`)}
                         >
                           <FileText className="w-3.5 h-3.5" /> Ver Guia
                         </Button>
                       )}
                     </div>
                   </div>
                 </motion.div>
               );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DoctorConsultations;
