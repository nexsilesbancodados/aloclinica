import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, ThumbsUp, ThumbsDown, Stethoscope, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface RateConsultationProps {
  appointmentId: string;
  doctorId: string;
  onClose: () => void;
}

const positiveTags = ["Atencioso", "Explicou bem", "Pontual", "Resolveu meu problema", "Profissional", "Empático"];
const negativeTags = ["Demorou", "Qualidade do vídeo", "Explicação confusa", "Preço alto", "Pouco tempo", "Desorganizado"];

const RateConsultation = ({ appointmentId, doctorId, onClose }: RateConsultationProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [ease, setEase] = useState(0);
  const [quality, setQuality] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [videoQuality, setVideoQuality] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    checkExisting();
  }, [appointmentId]);

  const checkExisting = async () => {
    const { data } = await db
      .from("satisfaction_surveys")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("patient_id", user!.id)
      .limit(1);
    if (data && data.length > 0) setAlready(true);
  };

  const updateDoctorRating = async () => {
    const { data: surveys } = await db
      .from("satisfaction_surveys")
      .select("quality_score, nps_score")
      .eq("doctor_id", doctorId);

    if (!surveys || surveys.length === 0) return;

    const ratings = surveys.map(s => {
      const npsAs5 = (s.nps_score / 10) * 5;
      const qual = s.quality_score ?? npsAs5;
      return (npsAs5 + qual) / 2;
    });
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    // Colunas da TABELA: rating_avg / rating_count. `rating` e `total_reviews`
    // só existem na view `doctor_profiles_public` — gravar nelas aqui fazia o
    // UPDATE inteiro falhar (42703) e a nota do paciente nunca era consolidada.
    const { error: ratingError } = await db
      .from("doctor_profiles")
      .update({ rating_avg: Math.round(avgRating * 10) / 10, rating_count: surveys.length })
      .eq("id", doctorId);
    if (ratingError) console.error("Falha ao atualizar média do médico:", ratingError.message);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const submit = async () => {
    if (nps === null) { toast.error("Selecione uma nota NPS (0-10)"); return; }
    if (already) { toast.error("Você já avaliou esta consulta."); return; }
    setSubmitting(true);

    const fullComment = [
      selectedTags.length > 0 ? `Tags: ${selectedTags.join(", ")}` : "",
      comment.trim(),
    ].filter(Boolean).join(" | ");

    const { error } = await db.from("satisfaction_surveys").insert({
      appointment_id: appointmentId,
      patient_id: user!.id,
      doctor_id: doctorId,
      nps_score: nps,
      ease_score: ease || null,
      quality_score: quality || null,
      would_recommend: recommend,
      comment: fullComment || null,
    });

    if (error) {
      toast.error("Erro ao enviar avaliação");
    } else {
      await updateDoctorRating();
      toast.success("Obrigado pela sua avaliação! ⭐");
      onClose();
    }
    setSubmitting(false);
  };

  if (already) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Avaliação já enviada ✅</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm py-4">Você já avaliou esta consulta. Obrigado pelo seu feedback!</p>
          <Button onClick={onClose}>Fechar</Button>
        </DialogContent>
      </Dialog>
    );
  }

  const npsColors = (i: number) => {
    if (i <= 6) return nps === i ? "bg-destructive text-destructive-foreground" : "border-destructive/30 text-destructive hover:bg-destructive/10";
    if (i <= 8) return nps === i ? "bg-yellow-500 text-white" : "border-yellow-500/30 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20";
    return nps === i ? "bg-green-600 text-white" : "border-green-500/30 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20";
  };

  const StarRow = ({ label, value, onChange, icon: Icon }: { label: string; value: number; onChange: (v: number) => void; icon: React.ElementType }) => (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-8 h-8 sm:w-7 sm:h-7 cursor-pointer transition-all ${i <= value ? "text-yellow-500 fill-yellow-500 scale-110" : "text-muted-foreground/30 hover:text-yellow-400"}`}
            onClick={() => onChange(i)}
          />
        ))}
      </div>
    </div>
  );

  const totalSteps = 3;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Como foi sua consulta?
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </DialogHeader>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-5"
        >
          {step === 0 && (
            <>
              {/* NPS */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">De 0 a 10, o quanto recomendaria a AloClinica?</p>
                <div className="grid grid-cols-6 sm:flex sm:flex-wrap gap-1.5 sm:gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setNps(i)}
                      className={`h-11 sm:h-9 sm:w-9 rounded-lg border text-sm font-bold transition-all ${npsColors(i)} ${nps === i ? "scale-105 shadow-md ring-2 ring-primary/30" : ""}`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Nada provável</span>
                  <span>Muito provável</span>
                </div>
              </div>

              {/* Star ratings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StarRow label="Qualidade" value={quality} onChange={setQuality} icon={Stethoscope} />
                <StarRow label="Facilidade" value={ease} onChange={setEase} icon={MessageSquare} />
                <StarRow label="Pontualidade" value={punctuality} onChange={setPunctuality} icon={Clock} />
                <StarRow label="Videochamada" value={videoQuality} onChange={setVideoQuality} icon={Clock} />
              </div>

              <Button
                className="w-full h-11"
                disabled={nps === null}
                onClick={() => setStep(1)}
              >
                Próximo →
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              {/* Quick tags */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">O que foi bom? (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {positiveTags.map(tag => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className={`cursor-pointer transition-all text-xs py-1.5 px-3 ${
                        selectedTags.includes(tag) ? "bg-success text-success-foreground" : "hover:bg-success/10"
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">O que pode melhorar? (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {negativeTags.map(tag => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className={`cursor-pointer transition-all text-xs py-1.5 px-3 ${
                        selectedTags.includes(tag) ? "bg-destructive text-destructive-foreground" : "hover:bg-destructive/10"
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Recommend */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Recomendaria este médico?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={recommend === true ? "default" : "outline"} onClick={() => setRecommend(true)} className="gap-2 h-11 flex-1 sm:flex-none">
                    <ThumbsUp className="w-4 h-4" /> Sim
                  </Button>
                  <Button size="sm" variant={recommend === false ? "destructive" : "outline"} onClick={() => setRecommend(false)} className="gap-2 h-11 flex-1 sm:flex-none">
                    <ThumbsDown className="w-4 h-4" /> Não
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-11">← Voltar</Button>
                <Button onClick={() => setStep(2)} className="flex-1 h-11">Próximo →</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Comment */}
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Comentário (opcional)</p>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={selectedTags.length > 0
                    ? `Conte mais sobre: ${selectedTags.slice(0, 2).join(", ")}...`
                    : "Conte-nos mais sobre sua experiência..."
                  }
                  rows={4}
                  className="text-base"
                />
              </div>

              {/* Would use again */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Você usaria a AloClinica de novo?</p>
                <div className="flex gap-2">
                  {["Sim", "Talvez", "Não"].map(opt => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={recommend === (opt === "Sim") ? "default" : "outline"}
                      onClick={() => setRecommend(opt === "Sim" ? true : opt === "Não" ? false : null)}
                      className="flex-1 h-11"
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-11">← Voltar</Button>
                <Button onClick={submit} disabled={submitting} className="flex-1 h-11">
                  {submitting ? "Enviando..." : "⭐ Enviar Avaliação"}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default RateConsultation;
