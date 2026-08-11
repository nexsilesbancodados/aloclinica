import { useState, useEffect, useRef } from "react";
import mascotReading from "@/assets/mascot-reading.png";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import { getPatientNav } from "./patientNav";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface DoctorInfo {
  id: string;
  user_id: string;
  crm: string;
  crm_state: string;
  name: string;
}

interface PrescriptionItem {
  id: string;
  appointment_id: string;
  diagnosis: string | null;
  medications: unknown;
  observations: string | null;
  created_at: string;
}

interface HistoryAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  doctor_id: string;
  notes: string | null;
  duration_minutes: number | null;
  doctor: DoctorInfo | undefined;
  prescriptions: PrescriptionItem[];
  consultation_notes: string | null;
}

const MedicalHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep link vinda do resumo pós-consulta, da busca global e do detalhe da
  // consulta: ?appt=<id> destaca a consulta em vez de largar o paciente no
  // topo de uma lista longa. Só destaca — não dispara o resumo de IA, que é
  // uma ação explícita (e paga) do usuário.
  const focusedAppointmentId = searchParams.get("appt");
  const hasScrolledToFocus = useRef(false);

  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummary, setLoadingSummary] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { if (user) fetchHistory(); }, [user]);

  useEffect(() => {
    if (!focusedAppointmentId || loading || hasScrolledToFocus.current) return;
    const card = document.getElementById(`appointment-${focusedAppointmentId}`);
    if (!card) return;
    hasScrolledToFocus.current = true;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedAppointmentId, loading, appointments]);

  const fetchHistory = async () => {
    const { data: appts } = await db
      .from("appointments")
      .select("id, scheduled_at, status, doctor_id, notes, duration_minutes")
      .eq("patient_id", user!.id)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false });

    if (!appts || appts.length === 0) { setLoading(false); return; }

    const doctorIds = [...new Set(appts.map(a => a.doctor_id))];
    const [docsRes, prescRes, notesRes] = await Promise.all([
      db.from("doctor_profiles").select("id, user_id, crm, crm_state").in("id", doctorIds),
      db.from("prescriptions").select("id, appointment_id, diagnosis, medications, observations, created_at").eq("patient_id", user!.id),
      db.from("consultation_notes").select("id, appointment_id, content").in("doctor_id", doctorIds),
    ]);

    const docUserIds = docsRes.data?.map(d => d.user_id) ?? [];
    const { data: profiles } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", docUserIds);

    const docMap = new Map<string, DoctorInfo>();
    docsRes.data?.forEach(d => {
      const p = profiles?.find(pr => pr.user_id === d.user_id);
      docMap.set(d.id, { ...d, name: p ? `Dr(a). ${p.first_name} ${p.last_name}` : "Médico" });
    });

    const prescMap = new Map<string, PrescriptionItem[]>();
    prescRes.data?.forEach(p => {
      const list = prescMap.get(p.appointment_id) ?? [];
      list.push(p as PrescriptionItem);
      prescMap.set(p.appointment_id, list);
    });

    const notesMap = new Map<string, string>();
    notesRes.data?.forEach(n => notesMap.set(n.appointment_id, n.content));

    setAppointments(appts.map(a => ({
      ...a,
      doctor: docMap.get(a.doctor_id),
      prescriptions: prescMap.get(a.id) ?? [],
      consultation_notes: notesMap.get(a.id) ?? null,
    })));
    setLoading(false);
  };

  const generateSummary = async (appt: HistoryAppointment) => {
    if (summaries[appt.id]) {
      setExpandedId(expandedId === appt.id ? null : appt.id);
      return;
    }

    setLoadingSummary(prev => ({ ...prev, [appt.id]: true }));
    setExpandedId(appt.id);

    try {
      const presc = appt.prescriptions?.[0];
      const { data, error } = await db.functions.invoke("clinical-summary", {
        body: {
          notes: appt.consultation_notes || appt.notes || "",
          diagnosis: presc?.diagnosis || "",
          medications: presc?.medications || [],
        },
      });

      if (error) throw error;
      setSummaries(prev => ({ ...prev, [appt.id]: data.summary }));
    } catch {
      toast.error("Erro ao gerar resumo", { description: "Tente novamente em alguns segundos." });
      setExpandedId(null);
    } finally {
      setLoadingSummary(prev => ({ ...prev, [appt.id]: false }));
    }
  };

  const downloadPrescription = (prescription: PrescriptionItem, doctorName: string) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Receita Médica Digital", 20, 20);
    doc.setFontSize(12);
    doc.text(`Médico: ${doctorName}`, 20, 35);
    doc.text(`Data: ${format(new Date(prescription.created_at), "dd/MM/yyyy", { locale: ptBR })}`, 20, 42);
    if (prescription.diagnosis) {
      doc.text(`Diagnóstico: ${prescription.diagnosis}`, 20, 55);
    }
    doc.text("Medicamentos:", 20, 68);
    const meds = Array.isArray(prescription.medications) ? prescription.medications : [];
    meds.forEach((med: unknown, i: number) => {
      const m = med as Record<string, string>;
      const text = typeof med === "string" ? med : `${m.name || m.medication || "—"} - ${m.dosage || ""} - ${m.instructions || ""}`;
      doc.text(`${i + 1}. ${text}`, 25, 78 + i * 8);
    });
    if (prescription.observations) {
      doc.text(`Observações: ${prescription.observations}`, 20, 90 + meds.length * 8);
    }
    doc.save(`receita-${prescription.id.slice(0, 8)}.pdf`);
  };

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("health")}>
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6">
        <button onClick={() => navigate("/dashboard?role=patient")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform"><path d="m15 18-6-6 6-6"/></svg>
          Voltar ao painel
        </button>
        <h1 className="text-2xl font-bold text-foreground mb-1">Histórico Médico</h1>
        <p className="text-muted-foreground mb-6">Consultas realizadas, receitas e prontuários</p>

        {loading ? <div className="shimmer-v2 h-20 rounded-2xl"/> :
        appointments.length === 0 ? (
          <div className="text-center py-8 rounded-2xl border border-dashed border-border/40 bg-muted/10"><img src={mascotReading} alt="Pingo" className="w-20 h-20 object-contain mx-auto drop-shadow-md mb-3 select-none" loading="lazy" decoding="async" width={80} height={80} /><p className="text-[13px] font-semibold text-foreground mb-1">Nenhuma consulta realizada ainda</p><p className="text-[11px] text-muted-foreground">Seu histórico médico aparecerá aqui após sua primeira consulta</p></div>
        ) : (
          <div className="space-y-4">
            {appointments.map(a => (
              <Card
                key={a.id}
                id={`appointment-${a.id}`}
                className={a.id === focusedAppointmentId ? "border-primary ring-2 ring-primary/30" : "border-border"}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{a.doctor?.name ?? "Médico"}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        CRM {a.doctor?.crm}/{a.doctor?.crm_state} · {format(new Date(a.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant="default">Concluída</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.consultation_notes && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notas da Consulta</p>
                      <p className="text-sm text-foreground">{a.consultation_notes}</p>
                    </div>
                  )}

                  {/* AI Summary Button */}
                  {(a.consultation_notes || a.prescriptions.length > 0) && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateSummary(a)}
                        disabled={loadingSummary[a.id]}
                        className="w-full justify-between border-primary/20 hover:bg-primary/5"
                      >
                        <span className="flex items-center gap-1.5">
                          {loadingSummary[a.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
                          {summaries[a.id] ? "Resumo Simplificado (IA)" : "Gerar resumo simplificado com IA"}
                        </span>
                        {summaries[a.id] && (expandedId === a.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                      </Button>

                      <AnimatePresence>
                        {expandedId === a.id && summaries[a.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 p-4 rounded-xl bg-primary/5 border border-primary/10">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <p className="text-xs font-semibold text-primary">Resumo para você</p>
                              </div>
                              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                                {summaries[a.id]}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-3">
                                ⚠️ Este resumo foi gerado por IA para facilitar seu entendimento. Não substitui a orientação médica.
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {a.prescriptions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Receitas</p>
                      {a.prescriptions.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-2 border border-border rounded-lg mb-1">
                          <div>
                            <p className="text-sm text-foreground">{p.diagnosis || "Receita médica"}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => downloadPrescription(p, a.doctor?.name ?? "Médico")}>
                            <Download className="w-3 h-3 mr-1" /> PDF
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MedicalHistory;
