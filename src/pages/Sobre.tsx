import { forwardRef, lazy } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Heart, Eye, Target, Users, Lightning, Lock, Star, ShieldCheck, Video, FirstAid, Heartbeat, Cpu, ChatsCircle, Globe, Certificate } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/landing/Header";
import SEOHead from "@/components/SEOHead";
import PublicPageEnhancer from "@/components/landing/PublicPageEnhancer";

import heroDoctor from "@/assets/hero-doctor.png";
import heroTeleconsulta from "@/assets/hero-teleconsulta.png";
import bannerPatient from "@/assets/banner-teleconsulta-patient.jpg";
import heroSeguranca from "@/assets/doctor-seguranca.png";
import pingoVideocall from "@/assets/pingo-videocall.png";

const Footer = lazy(() => import("@/components/landing/Footer"));

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true } as const,
};

const stagger = { initial: "hidden", whileInView: "visible", viewport: { once: true } as const };
const staggerContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const staggerItem = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } };

const Sobre = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();

  return (
    <div ref={ref} className="public-page public-about-page relative min-h-screen bg-background">
      <PublicPageEnhancer accent="#2563eb" />
      <div className="absolute inset-0 -z-10 bg-[image:var(--landing-bg)] pointer-events-none" />

      <SEOHead
        title="Sobre AloClínica - Saúde Digital para Todos"
        description="Conheça a missão de revolucionar acesso à saúde no Brasil. Tecnologia, segurança e cuidado em primeiro lugar."
        canonical="https://aloclinica.com.br/sobre"
      />

      <Header />

      {/* ═══════════════ HERO ═══════════════ */}
      <section id="quem-somos" className="relative overflow-hidden pt-32 pb-16 md:pb-24 px-4">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_14%_22%,hsl(var(--primary)/0.12),transparent_32%),radial-gradient(circle_at_90%_8%,hsl(var(--secondary)/0.10),transparent_30%)]" />
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.03fr_0.97fr] gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Heart className="w-3.5 h-3.5" weight="fill" />
                Quem Somos
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-[4rem] font-extrabold text-foreground leading-[1.02] mb-6 tracking-tight">
                Cuidando da saúde de{" "}
                <span className="text-gradient">milhares de brasileiros</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
                A AloClínica nasceu com a missão de democratizar o acesso à saúde de qualidade. 
                Conectamos pacientes e médicos através de tecnologia segura, acessível e humanizada — 
                porque acreditamos que todo brasileiro merece atendimento de excelência.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-8 max-w-xl">
                {[
                  { value: "24h", label: "cuidado online" },
                  { value: "30+", label: "especialidades" },
                  { value: "LGPD", label: "dados protegidos" },
                ].map((item) => (
                  <div key={item.label} className="public-card overflow-hidden rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur">
                    <p className="text-2xl font-black text-primary leading-none">{item.value}</p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="rounded-2xl h-[54px] px-8 text-sm font-bold shadow-lg shadow-primary/25 gap-2 group"
                  onClick={() => navigate("/agendar")}
                >
                  Agendar Consulta
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" weight="bold" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl h-[54px] px-8 text-sm font-bold border-2"
                  onClick={() => navigate("/para-medicos")}
                >
                  Seja Parceiro
                </Button>
              </div>
            </motion.div>

            <motion.div
              className="public-media-card relative flex min-h-[420px] justify-center overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 shadow-[0_30px_90px_-46px_rgba(15,23,42,0.5)] backdrop-blur"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_24%_22%,hsl(var(--secondary)/0.18),transparent_30%),linear-gradient(145deg,white,hsl(var(--primary)/0.08))]" />
              <div aria-hidden className="absolute right-6 top-6 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-xl backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modelo de cuidado</p>
                <p className="text-sm font-extrabold text-primary">Digital + humano</p>
              </div>
              <div aria-hidden className="absolute bottom-6 left-6 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-xl backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Confianca</p>
                <p className="text-sm font-extrabold text-foreground">Medicos verificados</p>
              </div>
              
              <img 
                src={heroDoctor} 
                alt="Médico AloClínica" 
                width={500} 
                height={500} 
                className="public-image-depth w-full max-w-[420px] lg:max-w-[480px] drop-shadow-2xl relative z-10 object-contain" 
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ MISSÃO, VISÃO, COMPROMISSO ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div {...stagger} variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: "Missão", icon: Target, color: "text-primary", text: "Democratizar acesso à saúde de qualidade através de telemedicina segura, rápida e acessível para todos os brasileiros." },
              { label: "Visão", icon: Eye, color: "text-primary", text: "Ser a plataforma de saúde digital mais confiável e utilizada no Brasil, referência em inovação e cuidado humanizado." },
              { label: "Compromisso", icon: Heart, color: "text-primary", text: "Colocar o paciente no centro de cada decisão, com ética, transparência e excelência médica." },
            ].map((item, i) => (
              <motion.div key={i} variants={staggerItem} className="public-card relative p-8 rounded-2xl border border-border bg-background hover:border-primary/30 transition-all group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                    <item.icon className={`w-7 h-7 ${item.color}`} weight="fill" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{item.label}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ NOSSA TECNOLOGIA ═══════════════ */}
      <section className="py-20 md:py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div className="relative flex justify-center order-2 lg:order-1" {...fadeUp} transition={{ duration: 0.6 }}>
              <div className="absolute inset-0 bg-primary/[0.05] blur-[60px] rounded-full scale-75 -z-10" />
              <img 
                src={heroTeleconsulta} 
                alt="Tecnologia Médica" 
                loading="lazy" 
                width={512} 
                height={512} 
                className="public-image-depth w-full max-w-[400px] lg:max-w-[450px] drop-shadow-xl relative z-10" 
              />
            </motion.div>

            <motion.div className="order-1 lg:order-2" {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Cpu className="w-3.5 h-3.5" weight="fill" />
                Nossa Tecnologia
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
                Inovação a serviço da <span className="text-primary">sua saúde</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Utilizamos tecnologia de ponta para oferecer uma experiência médica segura e eficiente. 
                Cada detalhe foi pensado para garantir qualidade no atendimento.
              </p>

              <div className="space-y-4">
                {[
                  { icon: Video, title: "Videochamada em HD", desc: "Conexão estável com criptografia ponta a ponta para consultas seguras e sem interrupção." },
                  { icon: ShieldCheck, title: "Receita Digital Válida", desc: "Prescrições com assinatura digital certificada (ICP-Brasil), aceitas em qualquer farmácia do país." },
                  { icon: Cpu, title: "Inteligência Artificial", desc: "IA para auxiliar médicos em diagnósticos, otimizar o atendimento e melhorar a experiência do paciente." },
                  { icon: Lock, title: "Proteção de Dados (LGPD)", desc: "Seus dados são protegidos com os mais altos padrões de segurança e em total conformidade com a LGPD." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="public-card flex items-start gap-4 overflow-hidden p-4 rounded-2xl bg-card/80 border border-border/40 hover:border-primary/20 hover:shadow-md transition-all"
                    {...fadeUp}
                    transition={{ delay: 0.2 + i * 0.1 }}
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

      {/* ═══════════════ NOSSOS VALORES ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-4">
              Nossos Valores
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              A moral que nos guia
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Cada ação, cada linha de código e cada consulta é orientada por valores que colocam o ser humano em primeiro lugar.
            </p>
          </motion.div>

          <motion.div {...stagger} variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Heart, title: "Empatia", desc: "Tratamos cada paciente como gostaríamos de ser tratados. Cuidado humanizado acima de tudo.", color: "bg-red-500/10 text-red-500" },
              { icon: Certificate, title: "Ética", desc: "Seguimos rigorosamente o código de ética médica, as normas do CFM e legislação brasileira.", color: "bg-primary/10 text-primary" },
              { icon: Lightning, title: "Inovação", desc: "Buscamos constantemente novas formas de melhorar a experiência e o acesso à saúde.", color: "bg-amber-500/10 text-amber-500" },
              { icon: Globe, title: "Acessibilidade", desc: "Saúde de qualidade para todos os brasileiros, de qualquer lugar e a qualquer hora.", color: "bg-emerald-500/10 text-emerald-500" },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                className="public-card overflow-hidden p-6 rounded-2xl border border-border bg-background hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <item.icon className="w-6 h-6" weight="fill" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ PACIENTES SATISFEITOS ═══════════════ */}
      <section id="depoimentos" className="py-20 md:py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <ChatsCircle className="w-3.5 h-3.5" weight="fill" />
                Pacientes Satisfeitos
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
                Quem usa, <span className="text-primary">recomenda</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                A satisfação dos nossos pacientes é o que nos motiva a evoluir todos os dias. 
                São milhares de vidas transformadas com atendimento médico de qualidade.
              </p>

              <div className="space-y-5">
                {[
                  { name: "Maria Fernanda", city: "São Paulo, SP", text: "Consultar pela AloClínica mudou minha vida. Recebi atendimento excelente sem precisar sair de casa. Super recomendo!", stars: 5 },
                  { name: "João Carlos", city: "Recife, PE", text: "Moro no interior e finalmente consegui consultar com um especialista. A receita digital funcionou perfeitamente na farmácia.", stars: 5 },
                  { name: "Ana Beatriz", city: "Belo Horizonte, MG", text: "Atendimento rápido, médico muito atencioso e a plataforma é super fácil de usar. Nota 10!", stars: 5 },
                ].map((t, i) => (
                  <motion.div
                    key={i}
                    className="public-card overflow-hidden p-5 rounded-2xl border border-border bg-card/80 hover:shadow-md transition-all"
                    {...fadeUp}
                    transition={{ delay: 0.15 + i * 0.1 }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      {Array.from({ length: t.stars }).map((_, si) => (
                        <Star key={si} className="w-4 h-4 text-amber-400" weight="fill" />
                      ))}
                    </div>
                    <p className="text-sm text-foreground mb-3 italic">"{t.text}"</p>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{t.name[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.city}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div className="relative flex justify-center" {...fadeUp} transition={{ duration: 0.6, delay: 0.2 }}>
              <div className="absolute inset-0 bg-secondary/[0.05] blur-[60px] rounded-full scale-75 -z-10" />
              <img 
                src={bannerPatient} 
                alt="Pacientes utilizando a AloClínica" 
                loading="lazy" 
                width={512} 
                height={512} 
                className="public-image-depth w-full max-w-[420px] lg:max-w-[480px] rounded-3xl shadow-2xl relative z-10" 
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ NÚMEROS ═══════════════ */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              AloClínica em números
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Resultados que comprovam nosso compromisso com a saúde do brasileiro.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { metric: "100k+", label: "Pacientes Atendidos", icon: Users },
              { metric: "500+", label: "Médicos Especialistas", icon: FirstAid },
              { metric: "30+", label: "Especialidades Médicas", icon: Heartbeat },
              { metric: "4.9★", label: "Satisfação Geral", icon: Star },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="public-card overflow-hidden text-center p-6 rounded-2xl border border-border bg-background hover:border-primary/30 transition-all"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-primary" weight="fill" />
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-primary mb-1">{item.metric}</div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SEGURANÇA & CONFORMIDADE ═══════════════ */}
      <section className="py-20 md:py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div className="relative flex justify-center order-2 lg:order-1" {...fadeUp} transition={{ duration: 0.6 }}>
              <div className="absolute inset-0 bg-primary/[0.05] blur-[60px] rounded-full scale-75 -z-10" />
              <img 
                src={heroSeguranca} 
                alt="Segurança de Dados" 
                loading="lazy" 
                width={512} 
                height={512} 
                className="public-image-depth w-full max-w-[380px] lg:max-w-[420px] drop-shadow-xl relative z-10" 
              />
            </motion.div>

            <motion.div className="order-1 lg:order-2" {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }}>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
                <Lock className="w-3.5 h-3.5" weight="fill" />
                Segurança & Conformidade
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
                Seus dados estão <span className="text-primary">protegidos</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Seguimos os mais rigorosos padrões de segurança e estamos em total conformidade 
                com a legislação brasileira e as normas do Conselho Federal de Medicina.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { title: "LGPD Compliant", desc: "Proteção total de dados pessoais conforme a legislação brasileira." },
                  { title: "CFM Regulado", desc: "Aprovado pelo Conselho Federal de Medicina para telemedicina." },
                  { title: "Criptografia E2E", desc: "Comunicações protegidas com criptografia de ponta a ponta." },
                  { title: "Backup Contínuo", desc: "Redundância de sistemas e backup automático 24/7." },
                  { title: "ISO 27001", desc: "Práticas alinhadas ao padrão internacional de segurança." },
                  { title: "Auditoria", desc: "Logs de acesso e auditoria contínua de todas as operações." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3 p-3"
                    {...fadeUp}
                    transition={{ delay: 0.2 + i * 0.06 }}
                  >
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" weight="bold" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ DIFERENCIAIS ═══════════════ */}
      <section id="porque-nos" className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-14" {...fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Por que escolher a AloClínica?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Diferenciais que fazem da AloClínica a plataforma de saúde digital mais completa do Brasil.
            </p>
          </motion.div>

          <motion.div {...stagger} variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Video, title: "Consulta 24h", desc: "Atendimento médico disponível a qualquer hora, incluindo fins de semana e feriados." },
              { icon: FirstAid, title: "30+ Especialidades", desc: "De clínico geral a cardiologia, neurologia, dermatologia e muito mais." },
              { icon: ShieldCheck, title: "Médicos Verificados", desc: "Todos os profissionais são verificados pelo CRM e passam por rigoroso processo de seleção." },
              { icon: Heartbeat, title: "Prontuário Digital", desc: "Seu histórico médico completo, seguro e acessível de qualquer lugar." },
              { icon: ChatsCircle, title: "Suporte Humanizado", desc: "Equipe de suporte dedicada para ajudar em qualquer etapa do atendimento." },
              { icon: Globe, title: "Acesso Nacional", desc: "Consulte de qualquer cidade do Brasil com a mesma qualidade e agilidade." },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                className="public-card overflow-hidden p-6 rounded-2xl border border-border bg-background hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-primary" weight="fill" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ CTA FINAL ═══════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            {...fadeUp}
            className="public-card relative rounded-3xl overflow-hidden bg-gradient-hero shadow-elevated"
          >
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary-foreground)/0.22),transparent_38%),radial-gradient(circle_at_bottom_right,hsl(var(--primary-foreground)/0.14),transparent_34%)]" />
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 px-8 sm:px-12 py-14 sm:py-16">
              <div className="flex items-center gap-6">
                <img src={pingoVideocall} alt="Pingo" loading="lazy" width={100} height={100} className="w-20 h-20 hidden sm:block drop-shadow-lg" />
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-primary-foreground mb-2">
                    Comece a cuidar da sua saúde hoje
                  </h2>
                  <p className="text-primary-foreground/85 max-w-xl">
                    Agende sua primeira consulta e descubra por que milhares de brasileiros confiam na AloClínica.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button
                  size="lg"
                  className="bg-background text-primary hover:bg-background/95 rounded-2xl px-8 gap-2 font-extrabold"
                  onClick={() => navigate("/paciente/cadastro")}
                >
                  Comece Agora
                  <ArrowRight className="w-5 h-5" weight="bold" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl px-8 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 font-extrabold"
                  onClick={() => navigate("/para-medicos")}
                >
                  Seja Médico Parceiro
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

Sobre.displayName = "Sobre";
export default Sobre;
