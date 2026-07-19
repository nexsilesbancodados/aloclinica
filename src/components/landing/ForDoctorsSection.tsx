import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  CurrencyDollar,
  CalendarBlank,
  Globe,
  ShieldCheck,
  ArrowRight,
  ChartLineUp,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import doctorPingoImg from "@/assets/doctor-phone-teleconsulta.png";
import doctorAvatar1 from "@/assets/doctor-premium-1.png";
import doctorAvatar2 from "@/assets/doctor-premium-2.png";
import doctorAvatar3 from "@/assets/doctor-signup-1.png";
import doctorAvatar4 from "@/assets/doctor-signup-2.png";

const perks = [
  {
    icon: CurrencyDollar,
    title: "Renda extra garantida",
    desc: "Atenda pacientes de todo o Brasil e aumente seu faturamento sem sair de casa.",
  },
  {
    icon: CalendarBlank,
    title: "Agenda no seu ritmo",
    desc: "Defina horários e especialidades. Você controla quando e quanto quer atender.",
  },
  {
    icon: Globe,
    title: "Alcance nacional",
    desc: "Conecte-se a pacientes de qualquer estado, sem limites geográficos.",
  },
  {
    icon: ShieldCheck,
    title: "100% regulamentado",
    desc: "Plataforma em conformidade com CFM, CRM e LGPD. Atenda com segurança jurídica.",
  },
  {
    icon: ChartLineUp,
    title: "Ferramentas completas",
    desc: "Prontuário SOAP, receita digital e atestado — tudo em um só lugar.",
  },
  {
    icon: Stethoscope,
    title: "Suporte dedicado",
    desc: "Time médico disponível para onboarding e dúvidas sobre a plataforma.",
  },
];

const stats = [
  { value: "500+", label: "Médicos ativos" },
  { value: "30+", label: "Especialidades" },
  { value: "R$3k+", label: "Renda média/mês" },
  { value: "4.9★", label: "Satisfação" },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

const ForDoctorsSection = forwardRef<HTMLElement>((_, ref) => {
  const navigate = useNavigate();

  return (
    <section
      ref={ref}
      id="para-medicos"
      aria-labelledby="doctors-heading"
      className="relative py-20 md:py-28 px-4 bg-gradient-to-b from-muted/30 to-background overflow-hidden"
    >
      {/* Subtle decorative blob */}
      <div
        aria-hidden
        className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-primary/5 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full bg-primary/5 blur-3xl pointer-events-none"
      />

      <div className="container mx-auto max-w-6xl relative">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:gap-16 items-start">
          {/* Left: content */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="lg:sticky lg:top-24"
          >
            {/* Social proof: avatar stack */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex -space-x-2">
                {[doctorAvatar1, doctorAvatar2, doctorAvatar3, doctorAvatar4].map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full border-2 border-background object-cover bg-muted shadow-sm"
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">+500 médicos</span> já confiam
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-5 ring-1 ring-primary/15">
              <Stethoscope className="w-3.5 h-3.5" weight="fill" />
              Para Médicos
            </span>

            <h2
              id="doctors-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground leading-[1.05] tracking-tight mb-5"
            >
              Atenda mais,{" "}
              <span className="block sm:inline">
                trabalhe{" "}
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  de onde quiser
                </span>
              </span>
            </h2>

            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
              Junte-se a mais de 500 médicos que já expandiram sua prática com telemedicina.
              Cadastro gratuito, aprovação em até 24h.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="text-center rounded-xl border border-border/70 bg-card/80 backdrop-blur-sm p-3 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <p className="text-xl sm:text-2xl font-extrabold text-primary tabular-nums leading-none">
                    {s.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
                    {s.label}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-gradient-hero text-primary-foreground hover:opacity-95 rounded-xl px-7 gap-2 font-semibold shadow-lg shadow-primary/25 h-12 group"
                onClick={() => navigate("/medico")}
              >
                <Stethoscope className="w-5 h-5" weight="fill" />
                Quero ser parceiro
                <ArrowRight
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  weight="bold"
                />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl px-7 font-semibold h-12 hover:border-primary/40 hover:text-primary"
                onClick={() => navigate("/medico")}
              >
                Saiba mais
              </Button>
            </div>
          </motion.div>

          {/* Right: perks grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
          >
            {/* Featured image card spanning full width */}
            <motion.div
              variants={itemVariants}
              className="sm:col-span-2 relative rounded-2xl overflow-hidden border border-border/70 bg-gradient-to-br from-primary/10 via-secondary/5 to-background shadow-lg shadow-primary/5 group"
            >
              <div
                aria-hidden
                className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-secondary/15 blur-3xl pointer-events-none"
              />
              <div
                aria-hidden
                className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-primary/15 blur-3xl pointer-events-none"
              />
              <div className="relative flex items-center gap-3 p-5 sm:p-6">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary mb-1.5">
                    Telemedicina premium
                  </p>
                  <h3 className="text-base sm:text-lg font-extrabold text-foreground leading-tight mb-1.5">
                    Atenda do seu consultório, de casa ou na estrada.
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Vídeo HD, prontuário e prescrição em uma única tela.
                  </p>
                </div>
                <img
                  src={doctorPingoImg}
                  alt="Médica em teleconsulta com o Pingo"
                  loading="lazy"
                  decoding="async"
                  width={180}
                  height={150}
                  className="w-28 sm:w-36 md:w-44 h-auto object-contain shrink-0 drop-shadow-[0_8px_20px_hsl(var(--primary)/0.18)] group-hover:scale-[1.03] transition-transform duration-500"
                />
              </div>
            </motion.div>

            {perks.map((p) => (
              <motion.div
                key={p.title}
                variants={itemVariants}
                whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="relative flex gap-3.5 p-4 rounded-2xl border border-border/70 bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all group overflow-hidden"
              >
                {/* Hover accent */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10 group-hover:ring-primary/25 group-hover:from-primary/20 transition-all">
                  <p.icon className="w-5 h-5 text-primary" weight="fill" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-foreground mb-1 leading-tight">
                    {p.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
});

ForDoctorsSection.displayName = "ForDoctorsSection";
export default ForDoctorsSection;
