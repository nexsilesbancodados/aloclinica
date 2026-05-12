import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, FileText, Pill, Star, ArrowRight,
  MessageSquare, Shield, Send, CalendarPlus, Download, Stamp, Users
} from "lucide-react";

interface PostConsultationSummaryProps {
  appointmentId: string;
  isDoctor: boolean;
  elapsed: number;
  messageCount: number;
  onContinue: () => void;
}

const PostConsultationSummary = ({
  appointmentId,
  isDoctor,
  elapsed,
  messageCount,
  onContinue,
}: PostConsultationSummaryProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hasNotes, setHasNotes] = useState(false);
  const [hasPrescription, setHasPrescription] = useState(false);
  const [hasCertificate, setHasCertificate] = useState(false);
  const [otherPartyName, setOtherPartyName] = useState("");
  const [doctorIdRaw, setDoctorIdRaw] = useState<string | null>(null);
  const [nextWaiting, setNextWaiting] = useState<{ id: string; patient_name: string } | null>(null);

  // Rating state
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [notesRes, prescRes, certRes, apptRes] = await Promise.all([
        db.from("consultation_notes").select("id").eq("appointment_id", appointmentId).limit(1),
        db.from("prescriptions").select("id").eq("appointment_id", appointmentId).limit(1),
        (db as any).from("medical_certificates").select("id").eq("appointment_id", appointmentId).limit(1),
        db.from("appointments").select("patient_id, doctor_id").eq("id", appointmentId).single(),
      ]);
      setHasNotes((notesRes.data?.length ?? 0) > 0);
      setHasPrescription((prescRes.data?.length ?? 0) > 0);
      setHasCertificate((certRes?.data?.length ?? 0) > 0);

      if (apptRes.data) {
        const otherId = isDoctor ? apptRes.data.patient_id : null;
        const otherDocId = !isDoctor ? apptRes.data.doctor_id : null;
        if (!isDoctor && apptRes.data.doctor_id) setDoctorIdRaw(apptRes.data.doctor_id);
        if (otherId) {
          const { data: p } = await db.from("profiles").select("first_name, last_name").eq("user_id", otherId).single();
          if (p) setOtherPartyName(`${p.first_name} ${p.last_name}`);
        } else if (otherDocId) {
          const { data: doc } = await db.from("doctor_profiles").select("user_id").eq("id", otherDocId).single();
          if (doc) {
            const { data: p } = await db.from("profiles").select("first_name, last_name").eq("user_id", doc.user_id).single();
            if (p) setOtherPartyName(`Dr(a). ${p.first_name} ${p.last_name}`);
          }
        }

        // Para o médico: descobre próximo paciente em fila pra evitar voltar pro dashboard
        if (isDoctor && apptRes.data.doctor_id) {
          const { data: nx } = await db
            .from("appointments")
            .select("id, patient_id, scheduled_at")
            .eq("doctor_id", apptRes.data.doctor_id)
            .in("status", ["waiting", "in_progress"])
            .neq("id", appointmentId)
            .order("scheduled_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (nx?.patient_id) {
            const { data: nxProf } = await db.from("profiles").select("first_name, last_name").eq("user_id", nx.patient_id).single();
            if (nxProf) {
              setNextWaiting({ id: nx.id, patient_name: `${nxProf.first_name} ${nxProf.last_name}` });
            }
          }
        }
      }
    };
    load();
  }, [appointmentId, isDoctor]);

  const handleSubmitRating = async () => {
    if (!selectedRating) { toast.error("Selecione uma avaliação de 1 a 5 estrelas"); return; }
    setRatingSubmitting(true);
    const { error } = await db.from("satisfaction_surveys").insert({
      appointment_id: appointmentId,
      patient_id: user?.id,
      nps_score: selectedRating * 2,
      comment: reviewText.trim() || null,
    } as any);

    if (error) {
      logError("[PostConsultationSummary] submit rating failed", error);
      toast.error("Erro ao salvar avaliação. Tente novamente.");
    } else {
      setRatingDone(true);
      setExistingRating(selectedRating);
      toast.success("Avaliação enviada! Obrigado pelo seu feedback.");
      setTimeout(() => onContinue(), 1500);
    }
    setRatingSubmitting(false);
  };

  const starLabel = (n: number) => ["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente"][n] ?? "";

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Success icon */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3 sm:mb-4"
          >
            <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-success" />
          </motion.div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1 sm:mb-2">Consulta Encerrada</h1>
          <p className="text-sm text-muted-foreground">
            {isDoctor ? `Atendimento com ${otherPartyName}` : `Consulta com ${otherPartyName}`}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-6" role="list" aria-label="Resumo da consulta">
          <Card className="bg-card border-border" role="listitem">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary mx-auto mb-1" aria-hidden="true" />
              <p className="text-base sm:text-lg font-bold text-foreground">{formatDuration(elapsed)}</p>
              <p className="text-[10px] text-muted-foreground">Duração</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border" role="listitem">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary mx-auto mb-1" aria-hidden="true" />
              <p className="text-base sm:text-lg font-bold text-foreground">{messageCount}</p>
              <p className="text-[10px] text-muted-foreground">Mensagens</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border" role="listitem">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-success mx-auto mb-1" aria-hidden="true" />
              <p className="text-base sm:text-lg font-bold text-success">E2E</p>
              <p className="text-[10px] text-muted-foreground">Criptografada</p>
            </CardContent>
          </Card>
        </div>

        {/* Checklist */}
        <Card className="bg-card border-border mb-5 sm:mb-6">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 ${hasNotes ? "bg-success/15" : "bg-muted"}`}>
                  <FileText className={`w-3.5 h-3.5 ${hasNotes ? "text-success" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-sm ${hasNotes ? "text-foreground" : "text-muted-foreground"}`}>
                  {hasNotes ? "Prontuário SOAP preenchido" : "Prontuário não preenchido"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 ${hasPrescription ? "bg-success/15" : "bg-muted"}`}>
                  <Pill className={`w-3.5 h-3.5 ${hasPrescription ? "text-success" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-sm ${hasPrescription ? "text-foreground" : "text-muted-foreground"}`}>
                  {hasPrescription ? "Receita emitida" : "Nenhuma receita emitida"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 ${hasCertificate ? "bg-success/15" : "bg-muted"}`}>
                  <Stamp className={`w-3.5 h-3.5 ${hasCertificate ? "text-success" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-sm ${hasCertificate ? "text-foreground" : "text-muted-foreground"}`}>
                  {hasCertificate ? "Atestado emitido" : "Sem atestado"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient Rating Section */}
        <AnimatePresence>
          {!isDoctor && showRating && (
            <motion.div
              key="rating-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden mb-4"
            >
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm font-semibold text-foreground text-center">
                    {ratingDone ? "Sua avaliação" : `Como foi sua consulta com ${otherPartyName || "o médico"}?`}
                  </p>

                  {/* Stars */}
                  <div className="flex justify-center gap-2" role="group" aria-label="Avaliação de 1 a 5 estrelas">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={ratingDone}
                        aria-label={`${n} estrela${n > 1 ? "s" : ""} — ${starLabel(n)}`}
                        onMouseEnter={() => !ratingDone && setHoveredStar(n)}
                        onMouseLeave={() => !ratingDone && setHoveredStar(0)}
                        onClick={() => !ratingDone && setSelectedRating(n)}
                        className="transition-transform active:scale-90 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      >
                        <Star
                          className={`w-9 h-9 sm:w-10 sm:h-10 transition-colors ${
                            n <= (hoveredStar || selectedRating)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {selectedRating > 0 && (
                    <p className="text-center text-sm font-medium text-primary">
                      {starLabel(selectedRating)}
                    </p>
                  )}

                  {!ratingDone && (
                    <>
                      <Textarea
                        placeholder="Comentário opcional sobre a consulta..."
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 h-10 rounded-xl text-sm"
                          onClick={() => { setShowRating(false); setSelectedRating(0); setReviewText(""); setHoveredStar(0); }}
                        >
                          Pular
                        </Button>
                        <Button
                          className="flex-1 h-10 rounded-xl text-sm gap-1.5"
                          onClick={handleSubmitRating}
                          disabled={ratingSubmitting || !selectedRating}
                        >
                          <Send className="w-3.5 h-3.5" />
                          {ratingSubmitting ? "Enviando..." : "Enviar Avaliação"}
                        </Button>
                      </div>
                    </>
                  )}

                  {ratingDone && (
                    <p className="text-center text-xs text-muted-foreground">
                      Avaliação registrada. Obrigado!
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="space-y-3">
          {/* Médico: próximo paciente em fila — handoff direto sem voltar pro dashboard */}
          {isDoctor && nextWaiting && (
            <Button
              onClick={() => navigate(`/dashboard/consultation/${nextWaiting.id}`)}
              className="w-full h-12 rounded-xl font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Users className="w-5 h-5" />
              Atender {nextWaiting.patient_name.split(" ")[0]} agora
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {isDoctor && !hasPrescription && (
            <Button
              onClick={() => navigate(`/dashboard/prescribe/${appointmentId}`)}
              variant={nextWaiting ? "outline" : "default"}
              className="w-full h-12 rounded-xl font-semibold gap-2"
            >
              <Pill className="w-5 h-5" />
              Emitir Receita
            </Button>
          )}

          {isDoctor && !hasCertificate && (
            <Button
              onClick={() => navigate(`/dashboard/medical-certificate/${appointmentId}`)}
              variant="outline"
              className="w-full h-12 rounded-xl font-semibold gap-2"
            >
              <Stamp className="w-5 h-5" />
              Emitir atestado
            </Button>
          )}

          {!isDoctor && !showRating && !ratingDone && (
            <Button
              className="w-full h-12 rounded-xl font-semibold gap-2"
              onClick={() => setShowRating(true)}
            >
              <Star className="w-5 h-5" />
              Avaliar Consulta
            </Button>
          )}

          {!isDoctor && doctorIdRaw && (
            <Button
              variant="outline"
              onClick={() => navigate(`/dashboard/schedule/${doctorIdRaw}?return=true&original=${appointmentId}`)}
              className="w-full h-12 rounded-xl font-semibold gap-2 border-warning/30 text-warning hover:bg-warning/5 hover:text-warning"
            >
              <CalendarPlus className="w-5 h-5" />
              Agendar retorno (50% off)
            </Button>
          )}

          {!isDoctor && hasPrescription && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/dashboard/patient/prescriptions?appt=${appointmentId}`)}
              className="w-full h-11 rounded-xl text-sm gap-2"
            >
              <Download className="w-4 h-4" />
              Ver e baixar receita
            </Button>
          )}

          <Button
            onClick={onContinue}
            variant={(!isDoctor && !ratingDone) || (isDoctor && !hasPrescription) ? "outline" : "default"}
            className="w-full h-12 rounded-xl font-semibold gap-2"
          >
            {isDoctor ? "Voltar ao Dashboard" : ratingDone ? "Continuar" : "Pular Avaliação"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-6">
          Consulta registrada em conformidade com a Resolução CFM 2.314/2022
        </p>
      </motion.div>
    </div>
  );
};

export default PostConsultationSummary;
