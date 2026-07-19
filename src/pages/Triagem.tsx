/**
 * Triagem inteligente pré-agendamento (PÚBLICA).
 *
 * Chama a edge function `clinical-ai` (task=triage) com queixa + sintomas +
 * duração + severidade. A IA retorna JSON com especialidade sugerida e urgência;
 * a página converte em CTA — "Agendar com {especialidade}" ou "Procure SAMU agora".
 *
 * Sem custo de aquisição clínica: ajuda o paciente a chegar no médico certo
 * (reduz no-show por especialidade errada e melhora resolução de 1a consulta).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Stethoscope, AlertTriangle, ArrowRight, Loader2, Sparkles, ShieldCheck, Phone, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

type TriageResult = {
  urgency: "emergencia" | "alta" | "media" | "baixa";
  specialty: string;
  red_flags: string[];
  explanation: string;
  recommended_action: "agendar_consulta" | "samu_192" | "pronto_socorro" | "farmacia_orientacao";
};

const COMMON_SYMPTOMS = [
  "Febre", "Dor de cabeça", "Tosse", "Falta de ar", "Dor no peito",
  "Dor abdominal", "Náusea", "Diarreia", "Erupção na pele", "Ansiedade",
  "Insônia", "Cansaço extremo", "Dor lombar", "Tontura", "Sangramento",
];

const SPECIALTY_LABELS: Record<string, string> = {
  clinico_geral: "Clínico Geral",
  cardiologia: "Cardiologia",
  pediatria: "Pediatria",
  psiquiatria: "Psiquiatria",
  ginecologia: "Ginecologia",
  dermatologia: "Dermatologia",
  ortopedia: "Ortopedia",
  otorrino: "Otorrinolaringologia",
  endocrinologia: "Endocrinologia",
  gastro: "Gastroenterologia",
  neurologia: "Neurologia",
  psicologia: "Psicologia",
  urologia: "Urologia",
};

const URGENCY_STYLE: Record<TriageResult["urgency"], { bg: string; text: string; label: string }> = {
  emergencia: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", label: "Emergência" },
  alta:       { bg: "bg-orange-500/10 border-orange-500/30",    text: "text-orange-600 dark:text-orange-400", label: "Alta prioridade" },
  media:      { bg: "bg-amber-500/10 border-amber-500/30",      text: "text-amber-600 dark:text-amber-400", label: "Prioridade média" },
  baixa:      { bg: "bg-emerald-500/10 border-emerald-500/30",  text: "text-emerald-600 dark:text-emerald-400", label: "Pode aguardar" },
};

const Triagem = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [duration, setDuration] = useState("");
  const [severity, setSeverity] = useState(5);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);

  const toggleSymptom = (s: string) => {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submit = async () => {
    if (!complaint.trim() || complaint.trim().length < 6) {
      toast.info("Conte um pouco mais sobre o que está sentindo.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("clinical-ai", {
        body: {
          task: "triage",
          payload: {
            complaint: complaint.trim(),
            symptoms: symptoms.join(", "),
            duration,
            severity,
            notes: notes.trim() || undefined,
          },
        },
      });
      if (error) throw error;
      const raw = (data as any)?.result || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Resposta inválida da IA");
      const parsed = JSON.parse(m[0]) as TriageResult;
      setResult(parsed);
      setStep(2);
    } catch (e: any) {
      toast.error("Não foi possível concluir a triagem", { description: e?.message || "Tente novamente." });
    } finally {
      setLoading(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;
    const u = URGENCY_STYLE[result.urgency];
    const isEmergency = result.urgency === "emergencia" || result.recommended_action === "samu_192";
    const specLabel = SPECIALTY_LABELS[result.specialty] || "Clínico Geral";
    return (
      <Card className="overflow-hidden">
        <CardHeader className={`${u.bg} border-b`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${u.text.replace("text-", "bg-")}`} aria-hidden="true" />
            <CardTitle className={`text-base ${u.text}`}>{u.label}</CardTitle>
          </div>
          <CardDescription className="text-foreground">
            {result.explanation}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {isEmergency ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Procure atendimento de emergência AGORA</p>
                  <p className="text-sm text-muted-foreground">Os sintomas relatados podem indicar uma condição que exige avaliação presencial imediata. Não dirija — peça ajuda.</p>
                </div>
              </div>
              <a href="tel:192" className="block">
                <Button size="lg" variant="destructive" className="w-full h-12 rounded-2xl gap-2">
                  <Phone className="w-4 h-4" /> Ligar para SAMU (192)
                </Button>
              </a>
              <p className="text-xs text-muted-foreground text-center">Em caso de risco iminente: SAMU 192 ou pronto-socorro mais próximo.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Especialidade sugerida</p>
                  <p className="text-lg font-bold text-foreground">{specLabel}</p>
                </div>
              </div>
              {(() => {
                const specLabel = SPECIALTY_LABELS[result.specialty] || "Clínico Geral";
                const next = `/dashboard/schedule?q=${encodeURIComponent(specLabel)}`;
                const redir = encodeURIComponent(next);
                return (
                  <div className="grid grid-cols-1 gap-2">
                    <Button size="lg" className="h-12 rounded-2xl gap-2" onClick={() => navigate(`/paciente?redirect=${redir}`)}>
                      Já tenho conta — agendar agora <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button size="lg" variant="outline" className="h-12 rounded-2xl" onClick={() => navigate(`/paciente/cadastro?redirect=${redir}`)}>
                      Criar conta e agendar (1 minuto)
                    </Button>
                  </div>
                );
              })()}
              {result.red_flags.length > 0 && (
                <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Atenção a estes sinais — se aparecerem, procure pronto-socorro:</p>
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                    {result.red_flags.slice(0, 5).map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <button onClick={() => { setStep(1); setResult(null); }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Refazer triagem
          </button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <SEOHead title="Triagem | AloClínica" description="Triagem rápida com IA para encontrar a especialidade certa." />
      <div className="max-w-xl mx-auto">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Triagem inteligente</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Em menos de 1 minuto, a IA te ajuda a encontrar a especialidade certa.
            <span className="block text-[11px] mt-1 opacity-70">Não substitui consulta médica nem atende emergências.</span>
          </p>
        </div>

        {step === 1 && (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div>
                <label className="text-sm font-semibold text-foreground">O que está sentindo? *</label>
                <Textarea
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  placeholder="Ex.: dor de cabeça forte que começou ontem, latejante, do lado direito…"
                  rows={3}
                  maxLength={500}
                  className="mt-1 resize-none"
                  aria-label="Descreva sua queixa principal"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground">Sintomas associados</label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMMON_SYMPTOMS.map((s) => {
                    const on = symptoms.includes(s);
                    return (
                      <button key={s} onClick={() => toggleSymptom(s)} type="button"
                        className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/50"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-foreground">Há quanto tempo?</label>
                  <select value={duration} onChange={(e) => setDuration(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg border border-border bg-card px-3 text-sm">
                    <option value="">Selecione…</option>
                    <option>algumas horas</option>
                    <option>1-2 dias</option>
                    <option>3-7 dias</option>
                    <option>1-4 semanas</option>
                    <option>mais de 1 mês</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground">Severidade ({severity}/10)</label>
                  <input type="range" min={0} max={10} value={severity}
                    onChange={(e) => setSeverity(Number(e.target.value))}
                    aria-label={`Severidade ${severity} de 10`}
                    className="mt-3 w-full" />
                </div>
              </div>

              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={400}
                placeholder="Algo a mais que ajude a entender (medicações, alergias, doenças prévias)…"
                className="resize-none text-sm" />

              <Button size="lg" className="w-full h-12 rounded-2xl gap-2" disabled={loading} onClick={submit}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Analisando…" : "Ver minha recomendação"}
              </Button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="w-3 h-3" /> Seus dados são tratados conforme LGPD e não geram histórico clínico sem cadastro.
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && renderResult()}

        <div className="text-center mt-4">
          <button onClick={() => navigate("/")} className="text-xs text-muted-foreground hover:text-foreground">
            Voltar para a home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Triagem;
