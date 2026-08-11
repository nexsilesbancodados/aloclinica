import { useState, useEffect, useCallback } from "react";
import pingoReception from "@/assets/pingo-reception.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays, subDays, startOfDay, endOfDay, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { getClinicNav } from "./clinicNav";

const statusLabels: Record<string, { label: string; class: string }> = {
  scheduled: { label: "Agendada", class: "bg-primary/10 text-primary border-primary/20" },
  confirmed: { label: "Confirmada", class: "bg-success/10 text-success border-success/20" },
  completed: { label: "Concluída", class: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelada", class: "bg-destructive/10 text-destructive border-destructive/20" },
  no_show: { label: "Não compareceu", class: "bg-warning/10 text-warning border-warning/20" },
};

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

const ClinicSchedules = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<Map<string, string>>(new Map());
  const [patients, setPatients] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const userId = user?.id;

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data: clinic } = await db.from("clinic_profiles").select("id").eq("user_id", userId).single();
    if (!clinic) { setLoading(false); return; }

    const { data: affiliations } = await db.from("clinic_affiliations").select("doctor_id").eq("clinic_id", clinic.id).eq("status", "active");
    const doctorIds = (affiliations ?? []).map(a => a.doctor_id);
    if (doctorIds.length === 0) { setLoading(false); return; }

    // Fetch doctor names
    const { data: docProfiles } = await db.from("doctor_profiles").select("id, user_id").in("id", doctorIds);
    const userIds = (docProfiles ?? []).map(d => d.user_id);
    const { data: profiles } = userIds.length > 0
      ? await db.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds)
      : { data: [] };
    const docMap = new Map<string, string>();
    (docProfiles ?? []).forEach(dp => {
      const profile = (profiles ?? []).find(p => p.user_id === dp.user_id);
      if (profile) docMap.set(dp.id, `Dr(a). ${profile.first_name} ${profile.last_name}`);
    });
    setDoctors(docMap);

    // Fetch appointments for selected date
    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd = endOfDay(selectedDate).toISOString();
    const { data: appts } = await db.from("appointments")
      .select("*")
      .in("doctor_id", doctorIds)
      .gte("scheduled_at", dayStart)
      .lte("scheduled_at", dayEnd)
      .order("scheduled_at", { ascending: true });

    setAppointments(appts ?? []);

    // Fetch patient names
    const patientIds = [...new Set((appts ?? []).map(a => a.patient_id).filter(Boolean))];
    if (patientIds.length > 0) {
      const { data: patProfiles } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => id !== null));
      const patMap = new Map<string, string>();
      (patProfiles ?? []).forEach(p => patMap.set(p.user_id, `${p.first_name} ${p.last_name}`));
      setPatients(patMap);
    }

    setLoading(false);
  }, [selectedDate, userId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filtered = appointments.filter(a => {
    const patientName = patients.get(a.patient_id) ?? "";
    const doctorName = doctors.get(a.doctor_id) ?? "";
    const matchSearch = `${patientName} ${doctorName}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const dateLabel = isToday(selectedDate) ? "Hoje" : isTomorrow(selectedDate) ? "Amanhã" : format(selectedDate, "dd 'de' MMMM", { locale: ptBR });

  return (
    <DashboardLayout title="Agendamentos" nav={getClinicNav("schedules")} role="clinic">
      <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="max-w-5xl space-y-5">
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Agendamentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Consultas dos médicos vinculados</p>
          </div>
        </motion.div>

        {/* Date navigation */}
        <motion.div variants={fadeUp} className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Anterior" className="h-9 w-9 rounded-xl" onClick={() => setSelectedDate(d => subDays(d, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center min-w-[140px]">
            <p className="text-sm font-semibold text-foreground">{dateLabel}</p>
            <p className="text-xs text-muted-foreground">{format(selectedDate, "EEEE", { locale: ptBR })}</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Próximo" className="h-9 w-9 rounded-xl" onClick={() => setSelectedDate(d => addDays(d, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isToday(selectedDate) && (
            <Button variant="ghost" size="sm" className="text-xs rounded-xl" onClick={() => setSelectedDate(new Date())}>Hoje</Button>
          )}
        </motion.div>

        {/* Filters */}
        <motion.div variants={fadeUp} className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar paciente ou médico..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] rounded-xl h-9"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="scheduled">Agendadas</SelectItem>
              <SelectItem value="confirmed">Confirmadas</SelectItem>
              <SelectItem value="completed">Concluídas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Summary */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: appointments.length, color: "text-primary", bg: "bg-primary/10" },
            { label: "Agendadas", value: appointments.filter(a => a.status === "scheduled" || a.status === "confirmed").length, color: "text-success", bg: "bg-success/10" },
            { label: "Concluídas", value: appointments.filter(a => a.status === "completed").length, color: "text-muted-foreground", bg: "bg-muted" },
            { label: "Canceladas", value: appointments.filter(a => a.status === "cancelled").length, color: "text-destructive", bg: "bg-destructive/10" },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-2xl bg-card border border-border/50 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Appointments list */}
        <motion.div variants={fadeUp}>
          <Card variant="elevated">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3 pb-24 md:pb-8">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                <img src={pingoReception} alt="Pingo" className="w-20 h-20 object-contain mx-auto mb-3 select-none" style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,.15))" }} loading="lazy" decoding="async" width={80} height={80} />
                  <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma consulta para este dia</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filtered.map(appt => {
                    const st = statusLabels[appt.status] ?? statusLabels.scheduled;
                    return (
                      <div key={appt.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                        <div className="w-14 text-center shrink-0">
                          <p className="text-lg font-bold text-foreground tabular-nums">{format(new Date(appt.scheduled_at), "HH:mm")}</p>
                          <p className="text-[10px] text-muted-foreground">{appt.duration_minutes ?? 30}min</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            <User className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                            {patients.get(appt.patient_id) ?? "Paciente"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{doctors.get(appt.doctor_id) ?? "Médico"}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${st.class}`}>{st.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default ClinicSchedules;
