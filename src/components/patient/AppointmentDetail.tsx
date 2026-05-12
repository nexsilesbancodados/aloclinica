import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Share2, Calendar, Clock, MapPin, AlertTriangle, Check, RotateCcw, X, Star, Video, ShieldCheck, FileText, Stamp, Download, Loader2 } from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { toastError } from "@/lib/errorMessages";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface AppointmentData {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  notes: string | null;
  doctor_name: string;
  doctor_crm: string;
  specialties: string[];
  rating: number | null;
}

type Prescription = { id: string; created_at: string; pdf_url: string | null };
type Certificate = { id: string; created_at: string; pdf_url: string | null; type?: string | null };

const AppointmentDetail = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appt, setAppt] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (user && appointmentId) fetchAppointment();
  }, [user, appointmentId]);

  // Tick a cada 30s pra atualizar o countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchAppointment = async () => {
    const { data } = await db
      .from("appointments")
      .select("id, scheduled_at, status, duration_minutes, notes, doctor_id")
      .eq("id", appointmentId!)
      .single();

    if (!data) { setLoading(false); return; }

    const { data: doc } = await db
      .from("doctor_profiles")
      .select("id, crm, rating, user_id")
      .eq("id", data.doctor_id)
      .single();

    let doctorName = "Médico";
    let specialties: string[] = [];

    if (doc) {
      const { data: profile } = await db
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", doc.user_id)
        .single();
      if (profile) doctorName = `Dr(a). ${profile.first_name} ${profile.last_name}`;

      const { data: specs } = await db
        .from("doctor_specialties")
        .select("specialty_id")
        .eq("doctor_id", doc.id);
      if (specs?.length) {
        const { data: specNames } = await db
          .from("specialties")
          .select("name")
          .in("id", specs.map(s => s.specialty_id));
        specialties = specNames?.map(s => s.name) ?? [];
      }
    }

    setAppt({
      id: data.id,
      scheduled_at: data.scheduled_at,
      status: data.status,
      duration_minutes: data.duration_minutes,
      notes: data.notes,
      doctor_name: doctorName,
      doctor_crm: doc?.crm ?? "",
      specialties,
      rating: doc?.rating ?? null,
    });

    // Carrega receitas/atestados em paralelo (só faz sentido se completed)
    if (data.status === "completed") {
      const [prescRes, certRes] = await Promise.all([
        db.from("prescriptions").select("id, created_at, pdf_url").eq("appointment_id", appointmentId!).order("created_at", { ascending: false }),
        (db as any).from("medical_certificates").select("id, created_at, pdf_url, type").eq("appointment_id", appointmentId!).order("created_at", { ascending: false }),
      ]);
      setPrescriptions((prescRes.data ?? []) as Prescription[]);
      setCertificates((certRes?.data ?? []) as Certificate[]);
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!appointmentId) return;
    setCancelling(true);
    try {
      const { error } = await db
        .from("appointments")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null } as any)
        .eq("id", appointmentId);
      if (error) throw error;
      toast.success("Consulta cancelada", { description: "Você receberá confirmação por email." });
      setShowCancel(false);
      navigate("/dashboard/appointments?role=patient");
    } catch (e) {
      toastError(toast, e, "agendamento");
    } finally {
      setCancelling(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = appt ? `Consulta com ${appt.doctor_name} em ${format(new Date(appt.scheduled_at), "dd/MM 'às' HH:mm")}` : "Consulta AloClínica";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Consulta AloClínica", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch (e) {
      // Cancelled by user — silent
    }
  };

  const prepInstructions = [
    "Esteja em jejum de 8 horas (se aplicável)",
    "Leve seus exames recentes",
    "Anote suas dúvidas e sintomas",
    "Tenha seus documentos em mãos",
  ];

  if (loading) {
    return (
      <DashboardLayout title="Paciente" nav={getPatientNav("appointments")} role="patient">
        <div className="max-w-2xl mx-auto space-y-4 pb-24">
          <Skeleton className="h-52 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!appt) {
    return (
      <DashboardLayout title="Paciente" nav={getPatientNav("appointments")} role="patient">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Consulta não encontrada.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/dashboard/appointments?role=patient")}>
            Voltar
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const date = new Date(appt.scheduled_at);
  const initials = appt.doctor_name.replace("Dr(a). ", "").split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("appointments")} role="patient">
      <div className="max-w-2xl mx-auto pb-24 md:pb-6">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <button
            onClick={handleShare}
            aria-label="Compartilhar consulta"
            className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-primary via-[hsl(215_70%_38%)] to-[hsl(215_55%_48%)] p-6 text-center mb-5"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.06] blur-[40px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="relative z-10">
            <Avatar className="w-20 h-20 mx-auto border-4 border-white/20 mb-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              <AvatarFallback className="bg-white/20 text-primary-foreground text-xl font-bold backdrop-blur-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            {appt.specialties.length > 0 && (
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-foreground/60 mb-1">
                {appt.specialties[0]} Especialista
              </p>
            )}
            <h2 className="font-[Manrope] text-[22px] font-extrabold text-primary-foreground">
              {appt.doctor_name}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              {appt.rating && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  <span className="text-sm font-bold text-primary-foreground">{appt.rating.toFixed(1)}</span>
                </div>
              )}
              {appt.status === "scheduled" && (() => {
                const mins = differenceInMinutes(new Date(appt.scheduled_at), new Date(now));
                if (mins < 0) return null;
                if (mins <= 60) {
                  return (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/30 backdrop-blur-sm border border-emerald-300/30 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span className="text-sm font-bold text-primary-foreground">
                        {mins === 0 ? "Começando agora" : `Em ${mins} min`}
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm">
                    <Clock className="w-3.5 h-3.5 text-primary-foreground/80" />
                    <span className="text-sm font-bold text-primary-foreground">
                      {formatDistanceToNow(new Date(appt.scheduled_at), { locale: ptBR, addSuffix: true })}
                    </span>
                  </div>
                );
              })()}
              {appt.status === "completed" && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/25 backdrop-blur-sm border border-emerald-300/30">
                  <Check className="w-3.5 h-3.5 text-emerald-100" />
                  <span className="text-sm font-bold text-primary-foreground">Concluída</span>
                </div>
              )}
              {appt.status === "cancelled" && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/30 backdrop-blur-sm">
                  <X className="w-3.5 h-3.5 text-primary-foreground" />
                  <span className="text-sm font-bold text-primary-foreground">Cancelada</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Date + Time Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden bg-card rounded-2xl p-4 border border-border/20 shadow-sm"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">Data</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[15px] font-bold text-foreground">
                {format(date, "dd 'de' MMMM", { locale: ptBR })}
              </span>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative overflow-hidden bg-card rounded-2xl p-4 border border-border/20 shadow-sm"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-secondary/30" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">Horário</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary/8 flex items-center justify-center">
                <Clock className="w-4 h-4 text-secondary" />
              </div>
              <span className="text-[15px] font-bold text-foreground">
                {format(date, "HH:mm")}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Location */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-4 border border-border/20 shadow-sm mb-3"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
                <Video className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Modalidade</p>
            </div>
          </div>
          <p className="text-[15px] font-bold text-foreground mt-1">Teleconsulta Online</p>
          <p className="text-[13px] text-muted-foreground">Acesse pela plataforma AloClínica</p>
        </motion.div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl p-5 mb-6 bg-gradient-to-br from-warning/[0.06] to-warning/[0.02] border border-warning/15"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <span className="text-[14px] font-bold text-foreground">Instruções de Preparo</span>
          </div>
          <ul className="space-y-2.5">
            {prepInstructions.map((inst, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-success" />
                </div>
                {inst}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Documents — só aparece se concluída e tem algo */}
        {appt.status === "completed" && (prescriptions.length > 0 || certificates.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.27 }}
            className="bg-card rounded-2xl p-5 border border-border/20 shadow-sm mb-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Documentos da consulta</p>
            <div className="space-y-2">
              {prescriptions.map((p) => (
                <a
                  key={p.id}
                  href={p.pdf_url ?? `/dashboard/patient/prescriptions?appt=${appt.id}`}
                  target={p.pdf_url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">Receita</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(p.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </a>
              ))}
              {certificates.map((c) => (
                <a
                  key={c.id}
                  href={c.pdf_url ?? `/dashboard/patient/health?appt=${appt.id}`}
                  target={c.pdf_url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Stamp className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">Atestado{c.type ? ` · ${c.type}` : ""}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        {appt.status === "scheduled" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            {(() => {
              const mins = differenceInMinutes(new Date(appt.scheduled_at), new Date(now));
              const checkInOpen = mins >= -60 && mins <= 15;
              return (
                <Button
                  className="w-full h-[52px] rounded-full bg-primary text-primary-foreground font-[Manrope] font-bold text-[15px] shadow-[0_4px_16px_hsl(215_75%_32%/0.3)] disabled:opacity-50"
                  disabled={!checkInOpen}
                  onClick={() => navigate(`/dashboard/consultation/${appt.id}`)}
                >
                  <ShieldCheck className="w-5 h-5 mr-2" />
                  {checkInOpen ? "Entrar na consulta" : `Disponível 15 min antes`}
                </Button>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 rounded-full gap-2 border-border/30 hover:bg-muted/30"
                onClick={() => toast.info("Reagendamento", { description: "Cancele esta consulta e agende um novo horário." })}
              >
                <RotateCcw className="w-4 h-4" /> Reagendar
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-full gap-2 bg-destructive/[0.04] border-destructive/15 text-destructive hover:bg-destructive/10"
                onClick={() => setShowCancel(true)}
              >
                <X className="w-4 h-4" /> Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar consulta?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está cancelando a consulta com <strong>{appt.doctor_name}</strong> em{" "}
              {format(new Date(appt.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}.
              {(() => {
                const hoursToAppt = differenceInMinutes(new Date(appt.scheduled_at), new Date()) / 60;
                if (hoursToAppt < 24 && hoursToAppt > 0) {
                  return (
                    <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-300">
                      <strong>Atenção:</strong> cancelamentos com menos de 24h podem não ter reembolso integral.
                    </div>
                  );
                }
                return null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Cancelando…</> : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AppointmentDetail;
