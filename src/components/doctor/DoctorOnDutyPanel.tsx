import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getDoctorNav } from "./doctorNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, UserCheck, Zap, Users, TrendingUp, DollarSign } from "lucide-react";
import { toast } from "sonner";
const DoctorOnDutyPanel = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [todayStats, setTodayStats] = useState({ sessions: 0, revenue: 0 });

  useEffect(() => {
    if (user) {
      fetchDoctorProfile();
      fetchQueue();
    }
  }, [user]);

  // Realtime
  useEffect(() => {
    const channel = db
      .channel("on-duty-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "on_demand_queue" }, () => fetchQueue())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, []);

  const fetchDoctorProfile = async () => {
    if (!user) return;
    const { data } = await db.from("doctor_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (data) {
      setDoctorProfileId(data.id);
      // Fetch today's urgent_care stats for this doctor
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: appts } = await db
        .from("appointments")
        .select("id, price")
        .eq("doctor_id", data.id)
        .eq("appointment_type", "urgent_care")
        .gte("scheduled_at", todayStart.toISOString());
      const sessions = appts?.length ?? 0;
      const revenue = (appts ?? []).reduce((sum: number, a: { price?: number }) => sum + Number(a.price ?? 0) * 0.5, 0);
      setTodayStats({ sessions, revenue });
    }
  };

  const fetchQueue = async () => {
    const { data } = await db
      .from("on_demand_queue")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: true });
    setQueue(data ?? []);
    setLoading(false);
  };

  const handleAcceptPatient = async (entry: any) => {
    if (!doctorProfileId || !user) return;
    setAccepting(true);

    // Create appointment
    const { data: appt, error: apptError } = await db.from("appointments").insert({
      patient_id: entry.patient_id,
      doctor_id: doctorProfileId,
      scheduled_at: new Date().toISOString(),
      status: "in_progress",
      payment_status: "approved",
      appointment_type: "urgency",
    }).select("id").single();

    if (apptError || !appt) {
      toast.error("Erro ao criar consulta: " + (apptError?.message || ""));
      setAccepting(false);
      return;
    }

    // Update queue entry
    await db.from("on_demand_queue").update({
      status: "in_progress",
      assigned_doctor_id: doctorProfileId,
      assigned_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      appointment_id: appt.id,
    }).eq("id", entry.id);

    toast.success("Paciente aceito! Redirecionando...");
    setTimeout(() => {
      window.location.href = `/dashboard/consultation/${appt.id}?role=doctor`;
    }, 500);
    setAccepting(false);
  };

  const waitTime = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60);
    return `${diff} min`;
  };

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("on-duty")}>
      <div className="w-full mx-auto max-w-4xl pb-24 md:pb-6 space-y-5">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 p-5 text-white" style={{ boxShadow: "0 8px 32px rgba(180,100,0,0.25)" }}>
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">Pronto-Atendimento</p>
              <h1 className="text-xl font-black tracking-tight mt-1">⚡ Plantão 24h</h1>
              <p className="text-xs text-white/70 mt-1">Fila de atendimento digital em tempo real</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5">
              <Users className="w-4 h-4" />
              <span className="text-2xl font-black tabular-nums">{queue.length}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">na fila</span>
            </div>
          </div>
        </div>

        {/* Today KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/40 bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Atendimentos hoje</p>
              <p className="text-xl font-black text-foreground tabular-nums">{todayStats.sessions}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Receita hoje (50%)</p>
              <p className="text-xl font-black text-foreground tabular-nums">R$ {todayStats.revenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/50" />)}</div>
        ) : queue.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border/40 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/30">
              <Zap className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-bold text-foreground mb-1">Nenhum paciente na fila</h3>
            <p className="text-sm text-muted-foreground">Novos pacientes aparecerão aqui em tempo real</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {queue.map((entry, i) => (
              <div key={entry.id} className={`flex items-center gap-4 rounded-2xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${i === 0 ? "border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/30" : "border-border/30 bg-card"}`} style={{ boxShadow: "var(--d-shadow-card)" }}>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-black text-lg ${i === 0 ? "bg-amber-500 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                  {i + 1}º
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {entry.shift === "day" ? "☀️ Diurno" : entry.shift === "night" ? "🌙 Noturno" : "🌃 Madrugada"}
                    </span>
                    {i === 0 && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">Próximo</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">R$ {Number(entry.price).toFixed(2)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {waitTime(entry.created_at)}</span>
                  </div>
                </div>
                <Button size="sm" disabled={accepting} onClick={() => handleAcceptPatient(entry)} className="rounded-xl h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-600/20">
                  <UserCheck className="w-4 h-4" /> Atender
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DoctorOnDutyPanel;
