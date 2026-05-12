/**
 * FirstConsultationTour — overlay com 4 passos rápidos para o paciente
 * que está chegando agora na plataforma.
 *
 * Mostra 1x. Persiste em localStorage `tour_first_consult_done = "true"`
 * (independente do PatientOnboarding, que é coleta de dados).
 *
 * Não bloqueia: se o paciente clicar fora ou em "Pular", fecha.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, X, MagnifyingGlass, Lightning, ChatCircleDots, ShieldCheck } from "@phosphor-icons/react";
import { isFeatureEnabled } from "@/lib/featureFlags";

const STORAGE_KEY = "tour_first_consult_done";

type Step = {
  title: string;
  body: string;
  icon: any;
  bullet?: string;
};

const STEPS: Step[] = [
  {
    title: "Bem-vindo à AloClínica! 👋",
    body: "Em 4 telas rápidas, te mostro como agendar sua primeira consulta.",
    icon: ShieldCheck,
    bullet: "Pode pular a qualquer momento.",
  },
  {
    title: "1. Encontre seu especialista",
    body: "Use a busca do dashboard para achar por especialidade, sintoma ou nome do médico.",
    icon: MagnifyingGlass,
    bullet: "Mais de 100 médicos verificados pelo CFM.",
  },
  {
    title: "2. Urgência? Atendimento já",
    body: "Botão vermelho \"Urgência\" coloca você em fila com médicos online em até 15 min.",
    icon: Lightning,
    bullet: "Custo a partir de R$ 35,00.",
  },
  {
    title: "3. Conversa segura por vídeo",
    body: "Sem instalar app: tudo no navegador. A receita vem assinada digitalmente para a farmácia.",
    icon: ChatCircleDots,
    bullet: "Suporte 24h pelo chat se precisar.",
  },
];

export default function FirstConsultationTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isFeatureEnabled("first_tour")) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch { return; }
    // Pequeno delay para não competir com loading do dashboard
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* ignore */ }
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  };

  if (!open) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={close}
        role="dialog"
        aria-modal="true"
        aria-label="Tour de boas-vindas"
      >
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card text-card-foreground rounded-3xl shadow-2xl max-w-md w-full p-6 relative"
        >
          <button
            onClick={close}
            aria-label="Fechar tour"
            className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center justify-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Icon size={30} weight="fill" className="text-primary" />
            </div>
          </div>

          <h2 className="text-xl font-extrabold text-center text-foreground mb-2 leading-tight">
            {current.title}
          </h2>
          <p className="text-sm text-center text-muted-foreground leading-relaxed">
            {current.body}
          </p>
          {current.bullet && (
            <p className="text-xs text-center text-muted-foreground/80 mt-2 italic">
              {current.bullet}
            </p>
          )}

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 mt-6">
            <Button
              variant="ghost"
              onClick={close}
              className="flex-1 text-muted-foreground"
            >
              Pular
            </Button>
            <Button
              onClick={next}
              className="flex-1 gap-2 font-bold"
            >
              {isLast ? "Começar" : "Próximo"}
              {!isLast && <ArrowRight size={16} weight="bold" />}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
