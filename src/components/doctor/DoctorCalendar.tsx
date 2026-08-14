import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getDoctorNav } from "./doctorNav";
import IcalSyncButton from "./IcalSyncButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { ChevronLeft, ChevronRight, Video, UserCheck, UserPlus, AlertTriangle, Clock, FileText, CalendarDays, Zap, ArrowLeft } from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays,
  addWeeks, addMonths, subDays, subWeeks, subMonths, isSameDay,
  eachDayOfInterval, getDay, differenceInMinutes
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import LazyAvatar from "@/components/ui/lazy-avatar";

const typeLabel: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  first_visit: { label: "1ª Consulta", icon: <UserPlus className="w-3 h-3" />, color: "text-primary", bg: "bg-primary/15 border-primary/30" },
  return: { label: "Retorno", icon: <UserCheck className="w-3 h-3" />, color: "text-success", bg: "bg-success/15 border-success/30" },
  urgency: { label: "Urgência", icon: <AlertTriangle className="w-3 h-3" />, color: "text-destructive", bg: "bg-destructive/15 border-destructive/30" },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  scheduled: { label: "Agendada", bg: "bg-primary/10", text: "text-primary" },
  completed: { label: "Concluída", bg: "bg-muted/60", text: "text-muted-foreground" },
  cancelled: { label: "Cancelada", bg: "bg-destructive/10", text: "text-destructive" },
  in_progress: { label: "Em andamento", bg: "bg-success/10", text: "text-success" },
  waiting: { label: "Aguardando", bg: "bg-warning/10", text: "text-warning" },
  no_show: { label: "Ausente", bg: "bg-destructive/10", text: "text-destructive" },
};

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

interface CalendarEvent {
  id: string;
  title?: string;
  start?: Date;
  end?: Date;
  status: string;
  patient_name?: string;
  patient_id?: string | null;
  duration_minutes?: number | null;
  scheduled_at?: string;
  appointment_type?: string | null;
  guest_patient_id?: string | null;
  notes?: string | null;
}

interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

const DoctorCalendar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [view, setView] = useState<"day" | "week" | "month">(isMobile ? "day" : "week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarEvent[]>([]);
  const [absences, setAbsences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) fetchData(); }, [user, currentDate, view]);

  // Scroll to 8am on mount
  useEffect(() => {
    if (gridRef.current && !loading) {
      gridRef.current.scrollTop = HOUR_HEIGHT * 1; // scroll to 8am (1 hour after start)
    }
  }, [loading, view]);

  const dateRange = useMemo(() => {
    if (view === "day") {
      const d = new Date(currentDate);
      return { start: new Date(d.setHours(0, 0, 0, 0)), end: new Date(new Date(currentDate).setHours(23, 59, 59, 999)) };
    }
    if (view === "week") return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [currentDate, view]);

  const days = useMemo(() => eachDayOfInterval({ start: dateRange.start, end: dateRange.end }), [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const { data: doc } = await db.from("doctor_profiles").select("id").eq("user_id", user!.id).single();
    if (!doc) { setLoading(false); return; }

    const [apptRes, absRes] = await Promise.all([
      db.from("appointments")
        .select("id, scheduled_at, status, patient_id, duration_minutes, appointment_type, notes")
        .eq("doctor_id", doc.id)
        .gte("scheduled_at", dateRange.start.toISOString())
        .lte("scheduled_at", dateRange.end.toISOString())
        .order("scheduled_at", { ascending: true }),
      db.from("doctor_absences")
        .select("absence_date")
        .eq("doctor_id", doc.id)
        .gte("absence_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("absence_date", format(dateRange.end, "yyyy-MM-dd")),
    ]);

    setAbsences(absRes.data?.map(a => a.absence_date) ?? []);

    const data = apptRes.data ?? [];
    if (data.length === 0) { setAppointments([]); setLoading(false); return; }

    const patientIds = [...new Set(data.filter(a => a.patient_id).map(a => a.patient_id))];
    const guestIds = [...new Set(data.filter(a => a.guest_patient_id).map(a => a.guest_patient_id))];

    const [pRes, gRes] = await Promise.all([
      patientIds.length ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => id !== null)) : { data: [] },
      guestIds.length ? db.from("guest_patients").select("id, full_name").in("id", guestIds.filter((id): id is string => id !== null)) : { data: [] },
    ]);

    const pMap = new Map((pRes.data ?? []).map((p: { user_id: string; first_name: string; last_name: string }) => [p.user_id, `${p.first_name} ${p.last_name}`]));
    const gMap = new Map((gRes.data ?? []).map((g: { id: string; full_name: string }) => [g.id, g.full_name]));

    setAppointments(data.map(a => ({
      ...a,
      patient_name: a.patient_id ? (pMap.get(a.patient_id ?? "") ?? "Paciente") : (gMap.get(a.guest_patient_id ?? "") ?? "Avulso"),
    })));
    setLoading(false);
  };

  const navigateDate = (dir: number) => {
    if (view === "day") setCurrentDate(prev => dir > 0 ? addDays(prev, 1) : subDays(prev, 1));
    else if (view === "week") setCurrentDate(prev => dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    else setCurrentDate(prev => dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const headerLabel = view === "day"
    ? format(currentDate, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })
    : view === "week"
    ? `${format(dateRange.start, "dd MMM", { locale: ptBR })} — ${format(dateRange.end, "dd MMM yyyy", { locale: ptBR })}`
    : format(currentDate, "MMMM yyyy", { locale: ptBR });

  /* ── Time Grid Event Card ── */
  const TimeGridEvent = ({ appt, colCount }: { appt: any; colCount: number }) => {
    const start = new Date(appt.scheduled_at);
    const duration = appt.duration_minutes || 30;
    const topOffset = ((start.getHours() - START_HOUR) * 60 + start.getMinutes()) * (HOUR_HEIGHT / 60);
    const height = Math.max(duration * (HOUR_HEIGHT / 60), 24);
    const sc = statusConfig[appt.status] ?? statusConfig.scheduled;
    const t = typeLabel[appt.appointment_type ?? "first_visit"] ?? typeLabel.first_visit;
    const isSmall = height < 40;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 cursor-pointer overflow-hidden transition-all hover:shadow-md hover:z-20 ${t.bg}`}
            style={{ top: `${topOffset}px`, height: `${height}px`, zIndex: 10 }}
          >
            {isSmall ? (
              <p className={`text-[10px] font-medium truncate ${t.color}`}>
                {format(start, "HH:mm")} {appt.patient_name?.split(" ")[0]}
              </p>
            ) : (
              <>
                <p className={`text-[11px] font-semibold truncate ${t.color}`}>{appt.patient_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(start, "HH:mm")} · {duration}min
                </p>
              </>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" side="right" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm text-foreground">{appt.patient_name}</p>
              <Badge variant="outline" className={`text-[10px] ${sc.text} ${sc.bg}`}>{sc.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {duration}min
            </div>
            <div className="flex items-center gap-1">
              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border ${t.bg}`}>
                {t.icon} {t.label}
              </span>
            </div>
            {appt.notes && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">{appt.notes}</p>
            )}
            <div className="flex gap-2 mt-2 border-t border-border pt-2">
              {(appt.status === "scheduled" || appt.status === "waiting") && (
                <Button size="sm" className="text-xs h-7 flex-1" onClick={() => navigate(`/dashboard/consultation/${appt.id}`)}>
                  <Video className="w-3 h-3 mr-1" /> Iniciar
                </Button>
              )}
              {appt.status === "completed" && (
                <Button size="sm" variant="outline" className="text-xs h-7 flex-1" onClick={() => navigate(`/dashboard/prescribe/${appt.id}`)}>
                  <FileText className="w-3 h-3 mr-1" /> Receita
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  /* ── Week Time Grid (desktop) ── */
  const WeekTimeGrid = () => (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/30">
        <div className="p-2 text-[10px] text-muted-foreground" />
        {days.map(day => {
          const isToday = isSameDay(day, new Date());
          const isAbsent = absences.includes(format(day, "yyyy-MM-dd"));
          return (
            <div key={day.toISOString()} className={`p-2 text-center border-l border-border ${isToday ? "bg-primary/5" : ""}`}>
              <p className={`text-[10px] font-medium uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "EEE", { locale: ptBR })}
              </p>
              <p className={`text-base font-bold leading-tight ${isToday ? "text-primary" : "text-foreground"}`}>
                {format(day, "dd")}
              </p>
              {isAbsent && <span className="text-[9px] text-destructive font-medium">Ausente</span>}
            </div>
          );
        })}
      </div>

      {/* Time grid body */}
      <div ref={gridRef} className="overflow-y-auto max-h-[50vh] sm:max-h-[600px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/30 flex items-start"
                style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                <span className="text-[10px] text-muted-foreground px-1.5 -translate-y-2">{`${String(h).padStart(2, "0")}:00`}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const dayAppts = appointments.filter(a => isSameDay(new Date(a.scheduled_at ?? ""), day));
            const isToday = isSameDay(day, new Date());
            const isAbsent = absences.includes(format(day, "yyyy-MM-dd"));
            return (
              <div
                key={day.toISOString()}
                className={`relative border-l border-border ${isAbsent ? "bg-destructive/5" : isToday ? "bg-primary/[0.02]" : ""}`}
              >
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/20"
                    style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}
                {/* Current time indicator */}
                {isToday && (() => {
                  const now = new Date();
                  const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                  if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
                  const top = mins * (HOUR_HEIGHT / 60);
                  return (
                    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${top}px` }}>
                      <div className="w-2 h-2 rounded-full bg-destructive -translate-x-1 -translate-y-1" />
                      <div className="h-px bg-destructive -mt-1" />
                    </div>
                  );
                })()}
                {/* Events */}
                {dayAppts.map(a => (
                  <TimeGridEvent key={a.id} appt={a} colCount={7} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ── Day Time Grid ── */
  const DayTimeGrid = () => {
    const dayAppts = appointments.filter(a => isSameDay(new Date(a.scheduled_at ?? ""), currentDate));
    const isAbsent = absences.includes(format(currentDate, "yyyy-MM-dd"));
    return (
      <div className={`border border-border rounded-xl overflow-hidden bg-card ${isAbsent ? "bg-destructive/5" : ""}`}>
        {isAbsent && (
          <div className="px-3 py-1.5 bg-destructive/10 text-destructive text-xs font-medium text-center">
            📅 Dia bloqueado (ausência)
          </div>
        )}
        <div className="overflow-y-auto max-h-[50vh] sm:max-h-[500px]">
          <div className="grid grid-cols-[56px_1fr] relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
            <div className="relative">
              {HOURS.map(h => (
                <div key={h} className="absolute left-0 right-0 border-t border-border/30" style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}>
                  <span className="text-[10px] text-muted-foreground px-1.5 -translate-y-2 block">{`${String(h).padStart(2, "0")}:00`}</span>
                </div>
              ))}
            </div>
            <div className="relative border-l border-border">
              {HOURS.map(h => (
                <div key={h} className="absolute left-0 right-0 border-t border-border/20" style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }} />
              ))}
              {dayAppts.map(a => <TimeGridEvent key={a.id} appt={a} colCount={1} />)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── Month Grid ── */
  const MonthGrid = () => (
    <div className="grid grid-cols-7 gap-1">
      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => (
        <div key={d} className="text-xs font-medium text-muted-foreground text-center py-2">{d}</div>
      ))}
      {Array.from({ length: (getDay(dateRange.start) + 6) % 7 }).map((_, i) => (
        <div key={`pad-${i}`} className="min-h-[80px]" />
      ))}
      {days.map(day => {
         const dayAppts = appointments.filter(a => isSameDay(new Date(a.scheduled_at ?? ""), day));
        const isToday = isSameDay(day, new Date());
        const isAbsent = absences.includes(format(day, "yyyy-MM-dd"));
        return (
          <div
            key={day.toISOString()}
            className={`min-h-[80px] rounded border p-1 cursor-pointer hover:bg-accent/30 transition-colors ${
              isAbsent ? "bg-destructive/5 border-destructive/20" : isToday ? "border-primary bg-primary/5" : "border-border"
            }`}
            onClick={() => { setCurrentDate(day); setView("day"); }}
          >
            <p className={`text-xs font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</p>
            {dayAppts.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 2).map(a => {
                   const t = typeLabel[a.appointment_type ?? "first_visit"] ?? typeLabel.first_visit;
                    return (
                     <div key={a.id} className={`text-[10px] truncate px-1 py-0.5 rounded ${t.bg}`}>
                       {format(new Date(a.scheduled_at ?? ""), "HH:mm")} {a.patient_name?.split(" ")[0]}
                    </div>
                  );
                })}
                {dayAppts.length > 2 && <p className="text-[10px] text-muted-foreground">+{dayAppts.length - 2}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  /* ── Mobile Week (stacked cards) ── */
  const MobileWeek = () => (
    <div className="space-y-2">
      {days.map(day => {
        const dayAppts = appointments.filter(a => isSameDay(new Date(a.scheduled_at ?? ""), day));
        const isToday = isSameDay(day, new Date());
        const isAbsent = absences.includes(format(day, "yyyy-MM-dd"));
        return (
          <div key={day.toISOString()} className={`rounded-xl border p-3 ${isAbsent ? "border-destructive/30 bg-destructive/5" : isToday ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-sm font-semibold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
                {format(day, "EEEE, dd", { locale: ptBR })}
              </p>
              {isAbsent && <Badge variant="destructive" className="text-[10px] h-5">Ausente</Badge>}
              {dayAppts.length > 0 && <Badge variant="outline" className="text-[10px] h-5">{dayAppts.length}</Badge>}
            </div>
            {dayAppts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{isAbsent ? "Dia bloqueado" : "Sem consultas"}</p>
            ) : (
              <div className="space-y-1.5">
                {dayAppts.map(a => {
                  const t = typeLabel[a.appointment_type ?? "first_visit"] ?? typeLabel.first_visit;
                  const sc = statusConfig[a.status] ?? statusConfig.scheduled;
                  return (
                    <div
                      key={a.id}
                      className={`p-2 rounded-md border ${t.bg} cursor-pointer active:scale-[0.98] transition-transform`}
                      onClick={() => a.status === "scheduled" || a.status === "waiting" ? navigate(`/dashboard/consultation/${a.id}`) : undefined}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-medium text-foreground truncate">{a.patient_name}</p>
                        <span className={`text-[10px] ${sc.text}`}>{sc.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(a.scheduled_at ?? ""), "HH:mm")} · {a.duration_minutes || 30}min
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("calendar")}>
      <div className="w-full mx-auto max-w-6xl pb-24 md:pb-6">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" /> Calendário
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">Visualize e gerencie sua agenda completa</p>
            </div>
            <div className="flex items-center gap-2">
              <IcalSyncButton />
              <Button size="sm" variant="outline" onClick={() => setCurrentDate(new Date())} className="h-8 text-xs">
                Hoje
              </Button>
            </div>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week" | "month")}>
            <TabsList className="w-full grid grid-cols-3 h-9">
              <TabsTrigger value="day" className="text-xs">Dia</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Semana</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Período anterior" onClick={() =>  navigateDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-sm sm:text-lg font-semibold text-foreground capitalize">{headerLabel}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo período" onClick={() =>  navigateDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Legenda de status — ajuda a decodificar as cores no calendário */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Legenda:</span>
          {([
            { k: "scheduled",  label: "Agendada",     dot: "bg-primary" },
            { k: "waiting",    label: "Aguardando",   dot: "bg-warning" },
            { k: "in_progress",label: "Em andamento", dot: "bg-success" },
            { k: "completed",  label: "Concluída",    dot: "bg-muted-foreground/50" },
            { k: "cancelled",  label: "Cancelada",    dot: "bg-destructive" },
            { k: "no_show",    label: "Ausente",      dot: "bg-destructive/70" },
          ] as const).map((s) => (
            <span key={s.k} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
              <span>{s.label}</span>
            </span>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Carregando agenda...</p>
          </div>
        ) : view === "day" ? (
          <DayTimeGrid />
        ) : view === "week" ? (
          <>
            <div className="hidden md:block"><WeekTimeGrid /></div>
            <div className="md:hidden"><MobileWeek /></div>
          </>
        ) : (
          <MonthGrid />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
          {Object.entries(typeLabel).map(([key, val]) => (
            <span key={key} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${val.bg}`}>
              {val.icon} {val.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-destructive/20 bg-destructive/5 text-destructive">
            📅 Ausência
          </span>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DoctorCalendar;
