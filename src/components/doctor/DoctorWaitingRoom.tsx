import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getDoctorNav } from "./doctorNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
 import { UserPlus, UserCheck, AlertTriangle, Video, Clock, Bell, RefreshCw, HeartPulse, ChevronRight, Zap } from "lucide-react";
 import { format, formatDistanceToNow } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import { toast } from "sonner";
 import { motion, AnimatePresence } from "framer-motion";

const typeLabel: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  first_visit: { label: "1ª Consulta", icon: <UserPlus className="w-3 h-3" />, color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  return: { label: "Retorno", icon: <UserCheck className="w-3 h-3" />, color: "bg-green-500/10 text-green-700 border-green-200" },
  urgency: { label: "Urgência", icon: <AlertTriangle className="w-3 h-3" />, color: "bg-red-500/10 text-red-700 border-red-200" },
};

const CRITICAL_SYMPTOMS = ["Dor no peito", "Falta de ar", "Desmaio", "Convulsão"];

const DoctorWaitingRoom = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [waitingPatients, setWaitingPatients] = useState<any[]>([]);
  const [triageAlerts, setTriageAlerts] = useState<Map<string, any>>(new Map());
  const [avgDuration, setAvgDuration] = useState(20);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchDoctorProfile();
  }, [user]);

  useEffect(() => {
    if (!doctorId) return;

    const channel = db
      .channel("waiting-room")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `doctor_id=eq.${doctorId}`,
        },
        (payload) => {
          fetchWaitingPatients(doctorId);
          if (payload.eventType === "UPDATE" && (payload.new as { status?: string }).status === "waiting") {
            toast.success("🔔 Paciente na sala de espera!", {
              description: "Um paciente entrou na sala de espera virtual.",
            });
            try {
              const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+LkI2GfHJ0fIGIjIqFf3p2enuAhYeGhIJ/fXt7fH+CgoODg4KBgH9+fn5+f4CBgoKCgoGAf39+fn5/gIGBgoKBgYCAf39+fn+AgYGBgYGBgIB/f39/f4CAgYGBgYGAgIB/f39/gICBgYGBgICAf39/f3+AgIGBgYGAgIB/f3+Af4CAgYGBgYCAgH9/f4B/gICBgYGBgICAf39/f3+AgIGBgYGAgIB/f39/f4CAf4A=");
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch (err: unknown) { /* silent failure */ }
          }
          if (payload.eventType === "UPDATE" && (payload.new as { status?: string }).status === "cancelled") {
            toast.error("⚠️ Consulta cancelada", {
              description: "Um paciente cancelou a consulta.",
            });
          }
        }
      )
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [doctorId]);

  const fetchDoctorProfile = async () => {
    const { data } = await db.from("doctor_profiles").select("id").eq("user_id", user!.id).single();
    if (data) {
      setDoctorId(data.id);
      fetchWaitingPatients(data.id);
      // Fetch average consultation duration for this doctor
      const { data: durations } = await db
        .from("video_presence_logs")
        .select("duration_seconds")
        .gt("duration_seconds", 60)
        .order("joined_at", { ascending: false })
        .limit(30);
      if (durations && durations.length > 0) {
        const avg = Math.round(durations.reduce((a, d) => a + (d.duration_seconds ?? 0), 0) / durations.length / 60);
        setAvgDuration(Math.max(5, Math.min(avg, 60)));
      }
    }
    setLoading(false);
  };

  const fetchTriageData = async (appointmentIds: string[]) => {
    if (appointmentIds.length === 0) return;
    const { data } = await db.from("pre_consultation_symptoms")
      .select("appointment_id, main_complaint, symptoms, severity")
      .in("appointment_id", appointmentIds);
    const map = new Map<string, any>();
    (data ?? []).forEach(s => map.set(s.appointment_id, s));
    setTriageAlerts(map);
  };

  const fetchWaitingPatients = async (docId: string) => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const { data } = await db.from("appointments")
      .select("id, scheduled_at, status, patient_id, duration_minutes, appointment_type")
      .eq("doctor_id", docId)
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString())
      .in("status", ["waiting", "scheduled", "in_progress"])
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) { setWaitingPatients([]); return; }

    const patientIds = [...new Set(data.filter(a => a.patient_id).map(a => a.patient_id))];
    const guestIds = [...new Set(data.filter(a => a.guest_patient_id).map(a => a.guest_patient_id))];

    const [pRes, gRes] = await Promise.all([
      patientIds.length ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => id !== null)) : { data: [] },
      guestIds.length ? db.from("guest_patients").select("id, full_name").in("id", guestIds.filter((id): id is string => id !== null)) : { data: [] },
    ]);

    const pMap = new Map((pRes.data ?? []).map((p: any) => [p.user_id, `${p.first_name} ${p.last_name}`]));
    const gMap = new Map((gRes.data ?? []).map((g: any) => [g.id, g.full_name]));

    setWaitingPatients(data.map(a => ({
      ...a,
      patient_name: a.patient_id ? (pMap.get(a.patient_id) ?? "Paciente") : (gMap.get(a.guest_patient_id) ?? "Avulso"),
    })));

    // Fetch triage data for all appointments
    fetchTriageData(data.map(a => a.id));
  };

  const getTriageAlert = (appointmentId: string) => {
    const triage = triageAlerts.get(appointmentId);
    if (!triage) return null;
    
    const hasCriticalSymptom = (triage.symptoms as string[] || []).some((s: string) => 
      CRITICAL_SYMPTOMS.some(cs => s.toLowerCase().includes(cs.toLowerCase()))
    ) || CRITICAL_SYMPTOMS.some(cs => triage.main_complaint?.toLowerCase().includes(cs.toLowerCase()));
    
    const isSevere = triage.severity === "very_severe" || triage.severity === "severe";
    
    if (hasCriticalSymptom || isSevere) {
      return { level: "critical" as const, triage };
    }
    if (triage.severity === "moderate") {
      return { level: "moderate" as const, triage };
    }
    return { level: "info" as const, triage };
  };

  const waitingCount = waitingPatients.filter(p => p.status === "waiting").length;
  const inProgressCount = waitingPatients.filter(p => p.status === "in_progress").length;
  const criticalCount = waitingPatients.filter(p => getTriageAlert(p.id)?.level === "critical").length;

  const renderTriageBadge = (appointmentId: string) => {
    const alert = getTriageAlert(appointmentId);
    if (!alert) return null;
    
    if (alert.level === "critical") {
      return (
        <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 animate-pulse">
          <div className="flex items-center gap-1.5 mb-1">
            <HeartPulse className="w-4 h-4 text-destructive" />
            <span className="text-xs font-bold text-destructive">⚠️ ALERTA CRÍTICO</span>
          </div>
          <p className="text-xs text-destructive/80 font-medium">{alert.triage.main_complaint}</p>
          {(alert.triage.symptoms as string[])?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(alert.triage.symptoms as string[]).map((s: string) => (
                <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  CRITICAL_SYMPTOMS.some(cs => s.toLowerCase().includes(cs.toLowerCase()))
                    ? "bg-destructive/20 text-destructive font-bold"
                    : "bg-muted text-muted-foreground"
                }`}>{s}</span>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    if (alert.level === "moderate") {
      return (
        <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">Queixa:</span> {alert.triage.main_complaint}
            {alert.triage.severity && <span className="ml-1">· {alert.triage.severity === "moderate" ? "🟡 Moderada" : ""}</span>}
          </p>
        </div>
      );
    }
    
    return (
      <div className="mt-2 p-2 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Queixa:</span> {alert.triage.main_complaint}
        </p>
      </div>
    );
  };

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("waiting-room")}>
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6 space-y-5">
        {/* Premium header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-500 p-5 text-white" style={{ boxShadow: "0 8px 32px rgba(180,100,0,0.25)" }}>
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">Atendimento virtual</p>
              <h1 className="text-xl font-black tracking-tight mt-1">🏥 Sala de Espera</h1>
              <p className="text-xs text-white/70 mt-1.5">
                {waitingCount} aguardando · {inProgressCount} em atendimento · ~{avgDuration}min/consulta
              </p>
              {criticalCount > 0 && (
                <p className="text-xs font-bold text-red-200 mt-1 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5" /> {criticalCount} alerta(s) crítico(s)
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => doctorId && fetchWaitingPatients(doctorId)} className="text-white/70 hover:text-white hover:bg-white/15 rounded-xl h-9">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Critical alerts banner */}
        {criticalCount > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-destructive/10 border-2 border-destructive/30">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-destructive animate-pulse" />
              <p className="text-sm font-bold text-destructive">
                {criticalCount} paciente(s) com sintomas críticos — priorize o atendimento!
              </p>
            </div>
          </div>
        )}

        {/* Waiting patients */}
        {waitingPatients.filter(p => p.status === "waiting").length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500 animate-pulse" />
              Aguardando Atendimento
            </h2>
            <div className="space-y-3">
              {/* Sort: critical first */}
              {waitingPatients
                .filter(p => p.status === "waiting")
                .sort((a, b) => {
                  const aLevel = getTriageAlert(a.id)?.level === "critical" ? 0 : 1;
                  const bLevel = getTriageAlert(b.id)?.level === "critical" ? 0 : 1;
                  return aLevel - bLevel;
                })
                .map(p => {
                  const t = typeLabel[p.appointment_type] ?? typeLabel.first_visit;
                  const alert = getTriageAlert(p.id);
                  const isCritical = alert?.level === "critical";
                  return (
                    <Card key={p.id} variant="interactive" className={`border-l-4 ${isCritical ? "border-l-destructive bg-destructive/5" : "border-l-orange-400"}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCritical ? "bg-destructive/20" : "bg-orange-100"}`}>
                              {isCritical ? <HeartPulse className="w-5 h-5 text-destructive" /> : <Clock className="w-5 h-5 text-orange-600" />}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{p.patient_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Horário: {format(new Date(p.scheduled_at), "HH:mm")} ·
                                Aguardando há {formatDistanceToNow(new Date(p.scheduled_at), { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${t.color}`}>
                              {t.icon} {t.label}
                            </span>
                            <Button size="sm" className="bg-gradient-hero text-primary-foreground" onClick={() => navigate(`/dashboard/consultation/${p.id}`)}>
                              <Video className="w-4 h-4 mr-1" /> Atender
                            </Button>
                          </div>
                        </div>
                        {renderTriageBadge(p.id)}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        )}

        {/* Scheduled (not yet arrived) */}
        {waitingPatients.filter(p => p.status === "scheduled").length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Agendados (aguardando entrada)</h2>
            <div className="space-y-2">
              {waitingPatients.filter(p => p.status === "scheduled").map(p => {
                const t = typeLabel[p.appointment_type] ?? typeLabel.first_visit;
                return (
                  <Card key={p.id} variant="flat" className="opacity-70">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.patient_name}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(p.scheduled_at), "HH:mm")} · {p.duration_minutes || 30}min</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${t.color}`}>
                          {t.icon} {t.label}
                        </span>
                      </div>
                      {renderTriageBadge(p.id)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* In progress */}
        {waitingPatients.filter(p => p.status === "in_progress").length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Video className="w-4 h-4 text-green-500" /> Em Atendimento
            </h2>
            <div className="space-y-2">
              {waitingPatients.filter(p => p.status === "in_progress").map(p => (
                <Card key={p.id} variant="interactive" className="border-l-4 border-l-green-500">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.patient_name}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.scheduled_at), "HH:mm")} · Em andamento</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/consultation/${p.id}`)}>
                        Retomar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {waitingPatients.length === 0 && !loading && (
          <Card variant="flat">
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Nenhum paciente na sala de espera.</p>
              <p className="text-xs text-muted-foreground mt-1">Os pacientes aparecerão aqui quando entrarem na sala.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DoctorWaitingRoom;
