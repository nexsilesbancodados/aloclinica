import { forwardRef, lazy, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Stethoscope, CurrencyDollar, CalendarBlank, Globe, ShieldCheck, ArrowRight,
  ChartLineUp, CheckCircle, Lock, Star, CaretDown, Video, Notepad, Certificate,
  FirstAid, Heartbeat, Clock, Wallet, UserCirclePlus, FileText, ChatsCircle,
  Lightning, X, Sparkle, MapPin,
} from "@phosphor-icons/react";
import { TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/landing/Header";
import SEOHead from "@/components/SEOHead";

import doctorTeleconsulta from "@/assets/doctor-teleconsulta.png";
import doctorFerramentas from "@/assets/doctor-ferramentas.png";
import doctorRenda from "@/assets/doctor-renda.png";

const Footer = lazy(() => import("@/components/landing/Footer"));

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true } as const,
};

const stagger = { initial: "hidden", whileInView: "visible", viewport: { once: true } as const };
const staggerContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const staggerItem = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } };

const ForDoctors = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [consultsPerWeek, setConsultsPerWeek] = useState<number>(15);
  const [pricePerConsult, setPricePerConsult] = useState<number>(55);
  const monthlyEarnings = consultsPerWeek * pricePerConsult * 4;
  const yearlyEarnings = monthlyEarnings * 12;

  return (
    <div ref={ref} className="relative min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-[image:var(--landing-bg)] pointer-events-none" />

      <SEOHead
        title="Seja Médico Parceiro | Telemedicina AloClínica"
        description="Atenda pacientes online e aumente sua renda. Cadastro gratuito, aprovação em 24h. 500+ médicos já parceiros."
        canonical="https://aloclinica.com.br/para-medicos"
      />

      <Header />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pt-32 pb-16 md:pb-24 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Stethoscope className="w-3.5 h-3.5" weight="fill" />
                Para Médicos
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-foreground leading-[1.08] mb-5">
                Atenda mais,{" "}
                <span className="text-gradient">ganhe mais</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
                Junte-se a mais de 500 médicos que já expandiram sua prática com telemedicina.
                Cadastro gratuito, aprovação em até 24h, e renda extra garantida sem sair de casa.
              </p>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                  { value: "500+", label: "Médicos ativos" },
                  { value: "30+", label: "Especialidades" },
                  { value: "R$3k+", label: "Renda média/mês" },
                  { value: "4.9★", label: "Satisfação" },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 200 }}
                    className="text-center rounded-xl border border-border bg-card/80 p-3"
                  >
                    <p className="text-xl font-extrabold text-primary tabular-nums">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="rounded-2xl h-[54px] px-8 text-sm font-bold shadow-lg shadow-primary/25 gap-2 group"
                  onClick={() => navigate("/medico/cadastro")}
                >
                  <Stethoscope className="w-4 h-4" weight="fill" />
                  Quero ser parceiro
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" weight="bold" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl h-[54px] px-8 text-sm font-bold border-2"
                  onClick={() => navigate("/medico")}
                >
                  Já sou parceiro
                </Button>
              </div>

              {/* Trust signals */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                {[
                  { icon: CheckCircle, label: "Cadastro gratuito" },
                  { icon: Clock, label: "Aprovação em 24h" },
                  { icon: ShieldCheck, label: "100% CFM e LGPD" },
                  { icon: Wallet, label: "Saque via PIX" },
                ].map((t) => (
                  <span key={t.label} className="inline-flex items-center gap-1.5">
                    <t.icon className="w-4 h-4 text-primary" weight="fill" />
                    <span className="font-medium text-foreground/80">{t.label}</span>
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <img
                src={doctorTeleconsulta}
                alt="Pingo em teleconsulta"
                width={440}
                height={440}
                className="w-[280px] sm:w-[360px] lg:w-[440px] drop-shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ POR QUE ATENDER ONLINE ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              Vantagens
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Por que atender pela AloClínica?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Tudo o que você precisa para expandir sua prática médica com segurança e praticidade.
            </p>
          </motion.div>

          <motion.div {...stagger} variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: CurrencyDollar, title: "Renda extra garantida", desc: "Atenda pacientes de todo o Brasil e aumente seu faturamento sem sair de casa. Pagamento garantido em 48h." },
              { icon: CalendarBlank, title: "Agenda no seu ritmo", desc: "Defina seus horários com total liberdade. Manhã, tarde, noite ou madrugada — você decide quando atender." },
              { icon: Globe, title: "Alcance nacional", desc: "Conecte-se a pacientes de qualquer estado. Sem limites geográficos, com demanda constante." },
              { icon: ShieldCheck, title: "100% regulamentado", desc: "Plataforma em conformidade com CFM, CRM e LGPD. Atenda com segurança jurídica total." },
              { icon: ChartLineUp, title: "Dashboard completo", desc: "Métricas de performance, histórico de consultas, relatórios financeiros e muito mais." },
              { icon: FirstAid, title: "Suporte médico 24/7", desc: "Time médico dedicado para onboarding, dúvidas clínicas e suporte técnico." },
            ].map((p, i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                className="p-6 rounded-2xl border border-border bg-background hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <p.icon className="w-6 h-6 text-primary" weight="fill" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FERRAMENTAS CLÍNICAS ═══════════════ */}
      <section className="py-20 md:py-28 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div className="flex justify-center order-2 lg:order-1" {...fadeUp} transition={{ duration: 0.6 }}>
              <img
                src={doctorFerramentas}
                alt="Pingo com ferramentas médicas"
                loading="lazy"
                width={512}
                height={512}
                className="w-[260px] sm:w-[320px] lg:w-[380px] drop-shadow-xl"
              />
            </motion.div>

            <motion.div className="order-1 lg:order-2" {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Notepad className="w-3.5 h-3.5" weight="fill" />
                Ferramentas Clínicas
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
                Tudo num <span className="text-primary">só lugar</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Prontuário eletrônico, receita digital e atestados — todas as ferramentas
                que você precisa integradas na plataforma.
              </p>

              <div className="space-y-4">
                {[
                  { icon: FileText, title: "Prontuário SOAP", desc: "Registro clínico completo com anamnese estruturada, CID-10 e exportação." },
                  { icon: Certificate, title: "Receita Digital ICP-Brasil", desc: "Prescrições com assinatura digital certificada, válidas em todo o país." },
                  { icon: Heartbeat, title: "Atestados", desc: "Gere documentos médicos com verificação por QR Code e hash de segurança." },
                  { icon: Video, title: "Videochamada HD", desc: "Consultas por vídeo com criptografia E2E, gravação (com consentimento) e chat." },
                  { icon: ChatsCircle, title: "Chat com Paciente", desc: "Comunicação segura antes e depois da consulta para acompanhamento." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-4 p-4 rounded-2xl bg-card/80 border border-border/40 hover:border-primary/20 hover:shadow-md transition-all"
                    {...fadeUp}
                    transition={{ delay: 0.2 + i * 0.08 }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" weight="fill" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-[15px]">{item.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ COMO FUNCIONA ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              Passo a Passo
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Comece a atender em 3 passos
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Processo rápido, simples e seguro. Cadastre-se hoje, atenda amanhã.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "1", icon: UserCirclePlus, title: "Cadastre-se", desc: "Preencha seu perfil com CRM, especialidade e horários. Leva menos de 5 minutos." },
              { step: "2", icon: CheckCircle, title: "Validação em 24h", desc: "Nossa equipe verifica seus documentos e valida seu CRM automaticamente." },
              { step: "3", icon: Video, title: "Comece a atender", desc: "Receba pacientes imediatamente e acompanhe seus ganhos no dashboard." },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="relative p-8 rounded-2xl border border-border bg-background text-center hover:border-primary/30 hover:shadow-lg transition-all"
                {...fadeUp}
                transition={{ delay: i * 0.12 }}
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <item.icon className="w-8 h-8 text-primary" weight="fill" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-extrabold">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>

                {i < 2 && (
                  <div className="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="w-6 h-6 text-muted-foreground/30" weight="bold" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ RENDA & FINANCEIRO ═══════════════ */}
      <section className="py-20 md:py-28 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Wallet className="w-3.5 h-3.5" weight="fill" />
                Simulador de Renda
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
                Quanto você pode <span className="text-primary">ganhar?</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Ajuste o número de consultas semanais e o valor médio para descobrir
                seu potencial de renda mensal e anual com a AloClínica.
              </p>

              <div className="space-y-6 p-6 rounded-2xl border border-border bg-card/80">
                <div>
                  <div className="flex justify-between items-baseline mb-3">
                    <label className="text-sm font-semibold text-foreground">Consultas por semana</label>
                    <span className="text-lg font-extrabold text-primary tabular-nums">{consultsPerWeek}</span>
                  </div>
                  <Slider
                    value={[consultsPerWeek]}
                    onValueChange={(v) => setConsultsPerWeek(v[0])}
                    min={1}
                    max={50}
                    step={1}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-3">
                    <label className="text-sm font-semibold text-foreground">Valor médio por consulta</label>
                    <span className="text-lg font-extrabold text-primary tabular-nums">R$ {pricePerConsult}</span>
                  </div>
                  <Slider
                    value={[pricePerConsult]}
                    onValueChange={(v) => setPricePerConsult(v[0])}
                    min={30}
                    max={150}
                    step={5}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
                  <div className="rounded-xl bg-primary/5 p-4">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Por mês</p>
                    <p className="text-2xl font-extrabold text-primary tabular-nums mt-1">
                      R$ {monthlyEarnings.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/5 p-4">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Por ano</p>
                    <p className="text-2xl font-extrabold text-primary tabular-nums mt-1">
                      R$ {yearlyEarnings.toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                {[
                  { icon: Clock, title: "Pagamento em 48h", desc: "Após a consulta, crédito na carteira digital." },
                  { icon: Wallet, title: "Saque via PIX", desc: "Solicite saques quando quiser, sem burocracia." },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background hover:border-primary/20 transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-primary" weight="fill" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div className="flex justify-center" {...fadeUp} transition={{ duration: 0.6, delay: 0.2 }}>
              <img
                src={doctorRenda}
                alt="Pingo renda extra"
                loading="lazy"
                width={512}
                height={512}
                className="w-[260px] sm:w-[320px] lg:w-[380px] drop-shadow-xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ DEPOIMENTOS ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              Depoimentos
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Médicos que já transformaram sua prática
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Veja como profissionais como você estão aumentando sua renda com a AloClínica.
            </p>
          </motion.div>

          <motion.div {...stagger} variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Dr. Lucas Ferreira", specialty: "Cardiologista", income: "R$ 4.2k", quote: "Em 6 meses de teleconsulta, fiz mais consultas do que fazia em 1 ano de consultório físico. Flexibilidade total e pagamento garantido." },
              { name: "Dra. Marina Silva", specialty: "Dermatologista", income: "R$ 3.8k", quote: "Perfeito para retornos e acompanhamento. Menos deslocamento, mais renda. O prontuário digital é excepcional." },
              { name: "Dr. Rafael Mendes", specialty: "Clínico Geral", income: "R$ 5.1k", quote: "Atendo pacientes de todo o Brasil. Minha renda triplicou sem abandonar meu consultório presencial." },
            ].map((t, i) => (
              <motion.div key={i} variants={staggerItem}>
                <Card className="h-full border-border hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group bg-background">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-1 mb-4">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} className="w-4 h-4 text-amber-400" weight="fill" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground italic mb-5 leading-relaxed">"{t.quote}"</p>
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm group-hover:scale-110 transition-transform">
                          {t.name.split(" ").slice(-1)[0][0]}
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-sm">{t.name}</h3>
                          <p className="text-xs text-muted-foreground">{t.specialty}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-primary flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" /> {t.income}
                        </p>
                        <p className="text-[10px] text-muted-foreground">/mês</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FAQ ACCORDION ═══════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              Dúvidas
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Perguntas Frequentes
            </h2>
          </motion.div>

          <div className="space-y-3">
            {[
              { q: "Quanto eu ganho por consulta?", a: "A média é de R$ 30-80 por consulta de 20-30 min, dependendo da especialidade. Médicos de cardiologia, dermatologia e psicologia ganham mais. Pagamento creditado em até 48h." },
              { q: "Preciso abandonar meu consultório?", a: "Não! A teleconsulta é complemento de renda. Muitos médicos atendem 2-3 pacientes online entre consultas presenciais. Você controla 100% da sua agenda." },
              { q: "Vocês controlam meus horários?", a: "Zero controle. Você define quando está disponível — pode ser de manhã, de madrugada, no fim de semana. Pacientes encaixam nos seus horários." },
              { q: "Meus dados de paciente ficam seguros?", a: "Sim. LGPD compliant, criptografia AES-256, prontuário eletrônico em nuvem com backup automático. Auditoria e conformidade 100% CFM." },
              { q: "Como funciona o pagamento?", a: "Após cada consulta, o valor é creditado na sua carteira digital. Você pode sacar via PIX a qualquer momento, sem taxas de saque." },
              { q: "Posso atender qualquer especialidade?", a: "Atendemos 30+ especialidades. Basta ter CRM ativo e, quando necessário, RQE válido para sua especialidade." },
            ].map((faq, i) => (
              <motion.div
                key={i}
                className="rounded-2xl border border-border bg-background overflow-hidden hover:border-primary/20 transition-colors"
                {...fadeUp}
                transition={{ delay: i * 0.05 }}
              >
                <button
                  className="w-full flex items-center justify-between p-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-foreground text-sm pr-4">{faq.q}</span>
                  <CaretDown
                    className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                    weight="bold"
                  />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA FINAL ═══════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto mb-20">
          <motion.div className="text-center mb-10" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              <Sparkle className="w-3.5 h-3.5" weight="fill" />
              Comparativo
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3">
              AloClínica vs consultório tradicional
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Veja por que centenas de médicos preferem complementar a renda com a telemedicina.
            </p>
          </motion.div>

          <motion.div {...fadeUp} className="overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm">
            <div className="grid grid-cols-3 bg-muted/40 text-xs sm:text-sm font-bold uppercase tracking-wider">
              <div className="p-4 text-muted-foreground">Característica</div>
              <div className="p-4 text-primary text-center">AloClínica</div>
              <div className="p-4 text-muted-foreground text-center">Consultório tradicional</div>
            </div>
            {[
              { feat: "Custo inicial", us: "R$ 0", them: "R$ 30k+", usIcon: CheckCircle },
              { feat: "Aluguel e estrutura", us: false, them: true },
              { feat: "Alcance geográfico", us: "Nacional", them: "Local", usIcon: Globe },
              { feat: "Agenda flexível", us: true, them: false },
              { feat: "Pagamento garantido em 48h", us: true, them: false },
              { feat: "Prontuário digital incluso", us: true, them: false },
              { feat: "Receita ICP-Brasil", us: true, them: false },
              { feat: "Suporte e onboarding", us: true, them: false },
            ].map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-3 text-sm border-t border-border/60 ${i % 2 === 1 ? "bg-background/60" : ""}`}
              >
                <div className="p-4 font-medium text-foreground">{row.feat}</div>
                <div className="p-4 flex items-center justify-center gap-1.5 font-semibold text-primary">
                  {typeof row.us === "boolean" ? (
                    row.us ? <CheckCircle className="w-5 h-5" weight="fill" /> : <X className="w-5 h-5 text-muted-foreground/50" />
                  ) : (
                    <>
                      {row.usIcon && <row.usIcon className="w-4 h-4" weight="fill" />}
                      <span>{row.us}</span>
                    </>
                  )}
                </div>
                <div className="p-4 flex items-center justify-center gap-1.5 text-muted-foreground">
                  {typeof row.them === "boolean" ? (
                    row.them ? <CheckCircle className="w-5 h-5" weight="fill" /> : <X className="w-5 h-5" />
                  ) : (
                    <span>{row.them}</span>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="max-w-7xl mx-auto">
          <motion.div
            {...fadeUp}
            className="relative rounded-3xl overflow-hidden bg-gradient-hero shadow-elevated"
          >
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary-foreground)/0.22),transparent_38%),radial-gradient(circle_at_bottom_right,hsl(var(--primary-foreground)/0.14),transparent_34%)]" />
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 px-8 sm:px-12 py-14 sm:py-16">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-primary-foreground mb-2">
                  Comece a atender hoje mesmo
                </h2>
                <p className="text-primary-foreground/85 max-w-xl">
                  Cadastro gratuito, análise em 24h. Junte-se a mais de 500 médicos parceiros e aumente sua renda.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button
                  size="lg"
                  className="bg-background text-primary hover:bg-background/95 rounded-2xl px-8 gap-2 font-extrabold"
                  onClick={() => navigate("/medico/cadastro")}
                >
                  <CheckCircle className="w-5 h-5" weight="fill" />
                  Quero Começar
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl px-8 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 font-extrabold"
                  onClick={() => navigate("/contato")}
                >
                  Falar com equipe
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
});

ForDoctors.displayName = "ForDoctors";
export default ForDoctors;
