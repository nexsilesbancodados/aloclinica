import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Video, Shield, Clock, MapPin, Heart, Stethoscope, FileText, Smartphone,
  CheckCircle2, ArrowRight, Users, HelpCircle, MonitorSmartphone,
  Zap, Star, UserCheck, Receipt, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SEOHead from "@/components/SEOHead";
import Header from "@/components/landing/Header";
import { lazy, Suspense, useState } from "react";
import heroTeleconsultaPhone from "@/assets/hero-teleconsulta-phone.png";
import doctorTeleconsulta from "@/assets/doctor-teleconsulta.png";
import { cn } from "@/lib/utils";

const Footer = lazy(() => import("@/components/landing/Footer"));

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

const steps = [
  { step: "1", title: "Escolha seu Médico", desc: "Veja especializações, avaliações reais e preços. Escolha quem você quer consultar.", emoji: "🔍" },
  { step: "2", title: "Agende sem Fila", desc: "Escolha o horário ideal. Receba confirmação por SMS e e-mail na hora.", emoji: "⏰" },
  { step: "3", title: "Consulte por Vídeo", desc: "Videochamada criptografada. Médico vê seu histórico. Receita digital na hora!", emoji: "✅" },
];

const benefits = [
  { icon: <MapPin className="w-5 h-5" />, title: "Sem deslocamento", desc: "Atendido por vídeo no conforto da sua casa. Zero trânsito." },
  { icon: <Heart className="w-5 h-5" />, title: "Pacientes acamados", desc: "Impossibilidade de ir presencialmente? A teleconsulta resolve." },
  { icon: <Stethoscope className="w-5 h-5" />, title: "30+ Especialidades", desc: "Clínico geral, pediatria, dermatologia, psicologia, cardiologia e mais." },
  { icon: <Clock className="w-5 h-5" />, title: "Economia real", desc: "Economia de tempo e dinheiro — sem estacionamento, sem fila." },
  { icon: <Receipt className="w-5 h-5" />, title: "Receita digital", desc: "Prescrições e atestados válidos em qualquer farmácia do Brasil." },
  { icon: <MonitorSmartphone className="w-5 h-5" />, title: "Qualquer dispositivo", desc: "Celular, tablet ou computador. Funciona até com 3G." },
  { icon: <Users className="w-5 h-5" />, title: "Família na chamada", desc: "Convide parentes para participar da mesma videoconsulta." },
  { icon: <FileText className="w-5 h-5" />, title: "Prontuário digital", desc: "Histórico completo acessível a cada consulta, sempre atualizado." },
];

const faqItems = [
  {
    icon: <Stethoscope className="w-5 h-5" />,
    question: "Funciona por vídeo? E se precisar de exame físico?",
    answer: "Funciona! 80%+ dos diagnósticos vêm de conversa + histórico. Se precisar exame físico, o médico encaminha para presencial. Receitas e atestados saem na hora, válidos em farmácias e hospitais.",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    question: "Teleconsulta é legal no Brasil?",
    answer: "100% legal! Lei 13.989/2020, autorizado pelo CFM e regulado pela LGPD. Você tem os mesmos direitos que em consulta presencial. Médicos são verificados a cada atendimento.",
  },
  {
    icon: <Smartphone className="w-5 h-5" />,
    question: "Preciso de algum equipamento especial?",
    answer: "Não! Celular + wifi comum é suficiente. Testamos com 3G e funciona. Baixe nosso app ou use pelo navegador — 1 minuto de setup.",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    question: "Meus dados estão seguros?",
    answer: "Sim. Criptografia AES-256 (padrão bancário), backup automático, auditoria 24/7. Apenas você e o médico veem seus dados. Conformidade total LGPD.",
  },
  {
    icon: <CheckCircle2 className="w-5 h-5" />,
    question: "Vale a pena? É mais barato que presencial?",
    answer: "Sim! (1) Sem gasto com deslocamento. (2) Ganha tempo — sem 2h em trânsito. (3) Preço igual ou menor que presencial, disponível 24h.",
  },
];

const stats = [
  { value: "12k+", label: "Pacientes atendidos", icon: <Users className="w-5 h-5" /> },
  { value: "4.9", label: "Avaliação média", icon: <Star className="w-5 h-5" /> },
  { value: "30+", label: "Especialidades", icon: <Stethoscope className="w-5 h-5" /> },
  { value: "<15min", label: "Tempo médio", icon: <Clock className="w-5 h-5" /> },
];

/* ─── FAQ Accordion Item ─── */
const FaqItem = ({ faq, index }: { faq: typeof faqItems[0]; index: number }) => {
  const [open, setOpen] = useState(false);
  return (
    <motion.div variants={fadeUp}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full text-left p-5 rounded-2xl border transition-all duration-300 group",
          open
            ? "bg-card border-primary/20 shadow-lg"
            : "bg-card/60 border-border/50 hover:shadow-md hover:border-primary/15"
        )}
      >
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            open ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}>
            {faq.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-foreground text-[15px] leading-snug">{faq.question}</h3>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300",
                open && "rotate-180"
              )} />
            </div>
            <AnimatePresence>
              {open && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-muted-foreground leading-relaxed mt-2.5 overflow-hidden"
                >
                  {faq.answer}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </button>
    </motion.div>
  );
};

const Teleconsulta = () => {
  return (
    <>
      <SEOHead
        title="Teleconsulta Médica Online | AloClinica"
        description="Consulte médicos online por vídeo 24h. Entenda como funciona a teleconsulta, benefícios, legalidade e como agendar."
      />
      <div className="min-h-screen relative">
        {/* Background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,80%,92%)] via-[hsl(215,65%,88%)] to-[hsl(225,55%,85%)] dark:from-[hsl(210,40%,10%)] dark:via-[hsl(215,35%,13%)] dark:to-[hsl(225,30%,16%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_75%_0%,hsl(205,85%,85%),transparent)] dark:bg-[radial-gradient(ellipse_70%_50%_at_75%_0%,hsl(205,50%,18%),transparent)]" />
        </div>
        <Header />

        {/* ═══════════════ HERO ═══════════════ */}
        <section className="relative mt-[70px] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.07),transparent_55%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="container mx-auto px-4 py-16 md:py-20 lg:py-28 relative z-10">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              {/* Left — Text */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="max-w-xl"
              >
                <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="mb-6">
                  <Badge variant="outline" className="px-4 py-1.5 text-xs font-semibold rounded-full border-primary/30 text-primary bg-primary/5">
                    <Video className="w-3.5 h-3.5 mr-1.5" /> Telemedicina por vídeo
                  </Badge>
                </motion.div>

                <motion.h1
                  className="text-4xl md:text-5xl lg:text-[3.5rem] font-black text-foreground leading-[1.08] tracking-tight mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  Sem tempo?
                  <br />
                  <span className="text-primary">A consulta</span>
                  <br />
                  <span className="text-primary">vai até você</span>
                </motion.h1>

                <motion.p
                  className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  A telemedicina resolve questões de saúde com mais agilidade, sem precisar ir ao consultório. Ideal pra quem tem a agenda cheia.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-col sm:flex-row items-start gap-3"
                >
                  <Button size="lg" className="rounded-xl px-10 h-14 font-bold text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all" asChild>
                    <Link to="/dashboard/schedule?role=patient" className="flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Agendar Consulta
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-xl px-8 h-14 font-bold text-base border-border hover:border-primary/40 hover:bg-primary/5 transition-all" asChild>
                    <Link to="/medico" className="flex items-center gap-2">
                      Sou Médico
                      <Stethoscope className="w-4 h-4" />
                    </Link>
                  </Button>
                </motion.div>

                {/* Trust badges */}
                <motion.div className="flex flex-wrap items-center gap-5 mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                  {[
                    { icon: <Shield className="w-4 h-4 text-primary" />, label: "Conforme LGPD" },
                    { icon: <Video className="w-4 h-4 text-primary" />, label: "Vídeo HD criptografado" },
                    { icon: <FileText className="w-4 h-4 text-primary" />, label: "Receita digital válida" },
                  ].map((item, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                      {item.icon} {item.label}
                    </span>
                  ))}
                </motion.div>
              </motion.div>

              {/* Right — Pingo */}
              <motion.div
                className="flex items-center justify-center lg:justify-end"
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.7, type: "spring", stiffness: 100 }}
              >
                <div className="relative w-[280px] md:w-[380px] lg:w-[440px]">
                  <img
                    src={heroTeleconsultaPhone}
                    alt="Pingo — sua assistente de teleconsulta saindo do celular"
                    width={1024}
                    height={1024}
                    className="w-full h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.12)]"
                  />
                  {/* Floating badges */}
                  <motion.div
                    className="absolute top-6 -left-2 md:top-10 md:-left-6 bg-card/95 backdrop-blur-sm border border-border rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2.5"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground leading-none mb-0.5">24h por dia</p>
                      <p className="text-[10px] text-muted-foreground leading-none">Inclusive feriados</p>
                    </div>
                  </motion.div>

                  <motion.div
                    className="absolute bottom-10 -right-2 md:bottom-14 md:-right-6 bg-card/95 backdrop-blur-sm border border-border rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2.5"
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  >
                    <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground leading-none mb-0.5">CRM verificado</p>
                      <p className="text-[10px] text-muted-foreground leading-none">30+ especialidades</p>
                    </div>
                  </motion.div>

                  <motion.div
                    className="absolute top-1/2 -right-3 md:-right-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg flex items-center gap-1.5"
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-foreground">4.9</span>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════════════ STATS BAR ═══════════════ */}
        <section className="border-y border-border bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              {stats.map((s, i) => (
                <motion.div
                  key={i}
                  className="py-6 md:py-8 text-center"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-primary">{s.icon}</span>
                    <span className="text-2xl md:text-3xl font-black text-foreground">{s.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ COMO FUNCIONA ═══════════════ */}
        <section className="py-20 relative">
          <div className="container mx-auto px-4 max-w-4xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.div variants={fadeUp} className="text-center mb-14">
                <Badge variant="outline" className="mb-4 text-sm px-4 py-1.5 rounded-full font-semibold">
                  ✦ 3 Passos Simples
                </Badge>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight mb-3">
                  Marque em 2 Minutos
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Processo transparente. Sem surpresas. Médicos verificados a cada passo.
                </p>
              </motion.div>

              {/* Progress line */}
              <motion.div className="hidden md:block mb-10 relative h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary via-secondary to-primary rounded-full"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.3 }}
                  style={{ originX: 0 }}
                />
              </motion.div>

              <div className="grid md:grid-cols-3 gap-5">
                {steps.map((item, i) => (
                  <motion.div key={i} variants={fadeUp} whileHover={{ y: -6 }} className="relative">
                    <Card className="h-full border-border/50 hover:shadow-xl hover:border-primary/20 transition-all duration-300 group overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <CardContent className="p-7">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          {item.step}
                        </div>
                        <h3 className="font-bold text-foreground text-lg mb-2 group-hover:text-primary transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} className="mt-6 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Plataforma segura e regulamentada</span> — Prontuário em nuvem, criptografia de ponta e conformidade total com LGPD.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════ BENEFÍCIOS ═══════════════ */}
        <section className="py-20 bg-muted/30 dark:bg-muted/10">
          <div className="container mx-auto px-4 max-w-6xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.div variants={fadeUp} className="text-center mb-14">
                <Badge className="mb-4 text-sm px-4 py-1.5 rounded-full font-semibold bg-primary/10 text-primary border-primary/20">
                  💡 Benefícios Reais
                </Badge>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight mb-3">
                  Por Que Milhões Escolhem Teleconsulta
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Velocidade, segurança e economia que funcionam na prática
                </p>
              </motion.div>

              <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-10 lg:gap-14 items-center">
                {/* Left column — 4 benefits */}
                <div className="space-y-4">
                  {benefits.slice(0, 4).map((b, i) => (
                    <motion.div key={i} variants={fadeUp}>
                      <Card className="border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group">
                        <CardContent className="p-5 flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            {b.icon}
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground mb-1">{b.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Center — Pingo teleconsulta */}
                <motion.div
                  className="hidden lg:flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <img
                    src={doctorTeleconsulta}
                    alt="Pingo fazendo teleconsulta"
                    loading="lazy"
                    width={400}
                    height={400}
                    className="w-[260px] xl:w-[300px] drop-shadow-xl"
                  />
                </motion.div>

                {/* Right column — 4 benefits */}
                <div className="space-y-4">
                  {benefits.slice(4).map((b, i) => (
                    <motion.div key={i} variants={fadeUp}>
                      <Card className="border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group">
                        <CardContent className="p-5 flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            {b.icon}
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground mb-1">{b.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════ CTA INTERMEDIÁRIO ═══════════════ */}
        <section className="py-6 px-4">
          <div className="container mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20"
            >
              <div className="text-center sm:text-left">
                <h3 className="text-lg font-bold flex items-center gap-2 justify-center sm:justify-start">
                  <Video className="w-5 h-5" /> Marque sua Teleconsulta agora!
                </h3>
                <p className="text-sm opacity-70 mt-1">Atendimento rápido, seguro e sem sair de casa.</p>
              </div>
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 rounded-full px-8 font-bold shadow-lg shrink-0" asChild>
                <Link to="/dashboard/schedule?role=patient">Agendar <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════ FAQ ═══════════════ */}
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.div variants={fadeUp} className="text-center mb-12">
                <Badge variant="outline" className="mb-4 text-sm px-4 py-1.5 rounded-full font-semibold">
                  <HelpCircle className="w-3.5 h-3.5 mr-2" /> Tire suas dúvidas
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
                  Perguntas Frequentes
                </h2>
              </motion.div>
              <div className="space-y-3">
                {faqItems.map((faq, i) => (
                  <FaqItem key={i} faq={faq} index={i} />
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════ FINAL CTA ═══════════════ */}
        <section className="py-20 bg-muted/20 dark:bg-muted/5">
          <div className="container mx-auto px-4 max-w-2xl text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mx-auto mb-5">
                <Smartphone className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground mb-3 tracking-tight">
                Sua saúde na palma da mão
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Celular, tablet ou computador com webcam. É tudo que você precisa para consultar agora.
              </p>
              <Button size="lg" className="rounded-xl h-14 px-10 text-base font-bold shadow-lg shadow-primary/20" asChild>
                <Link to="/dashboard/schedule?role=patient">Marcar Teleconsulta <ArrowRight className="w-5 h-5 ml-2" /></Link>
              </Button>
            </motion.div>
          </div>
        </section>

        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </div>
    </>
  );
};

export default Teleconsulta;
