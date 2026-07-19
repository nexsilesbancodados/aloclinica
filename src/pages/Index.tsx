import { useEffect, forwardRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import PingoRunBanner from "@/components/landing/PingoRunBanner";
import SpecialtiesSection from "@/components/landing/SpecialtiesSection";
import Footer from "@/components/landing/Footer";
import TechnologySection from "@/components/landing/TechnologySection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import BenefitsGrid from "@/components/landing/BenefitsGrid";
import ForDoctorsSection from "@/components/landing/ForDoctorsSection";
import CTABanner from "@/components/landing/CTABanner";
import ConsultaInfoBanner from "@/components/landing/ConsultaInfoBanner";
import TrustBanner from "@/components/landing/TrustBanner";
import FAQSection from "@/components/landing/FAQSection";
import TestimonialsMarquee from "@/components/landing/TestimonialsMarquee";
import PingoCampaignShowcase from "@/components/landing/PingoCampaignShowcase";
import PublicPageEnhancer from "@/components/landing/PublicPageEnhancer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, CalendarCheck, CreditCard, Star, Stethoscope, Video } from "lucide-react";
import { useSiteSections } from "@/lib/site-sections";
import { motion } from "framer-motion";
import doctorTeleconsulta from "@/assets/doctor-phone-teleconsulta.png";
import pingoCalendar from "@/assets/pingo-calendar.jpg";
import pingoVideocall from "@/assets/pingo-videocall.png";
import pingoPrescription from "@/assets/pingo-prescription.jpg";
import pingoDepoimentos from "@/assets/pingo-depoimentos.png";

const Index = forwardRef<HTMLDivElement>((_, ref) => {
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();
  const { enabled, sections } = useSiteSections();

  const sectionData = useMemo(() => {
    const map: Record<string, any> = {};
    if (sections) {
      sections.forEach(s => {
        map[s.key] = s.config;
      });
    }
    return map;
  }, [sections]);

  const isOn = (key: string) => enabled(key);

  useEffect(() => {
    const prev = theme;
    setTheme("light");
    return () => { if (prev && prev !== "light") setTheme(prev); };
  }, []);

  return (
    <div className="public-page public-home-page relative min-h-screen bg-background" ref={ref}>
      <PublicPageEnhancer accent="#0b63f6" />
      <div className="absolute inset-0 -z-10 bg-[image:var(--landing-bg)] pointer-events-none" />
      <SEOHead
        title="Consultas Médicas Online por Vídeo 24h | AloClínica"
        description="Consulte médicos online por vídeo 24h. Agendamento fácil, receitas digitais válidas, 30+ especialidades, plantão clínico 24h. Sua saúde na palma da mão."
        canonical="https://aloclinica.com.br/"
      />
      
      {isOn("header") && <Header config={sectionData.header} />}
      {isOn("hero") && <HeroSection config={sectionData.hero} />}
      <section className="relative z-20 -mt-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="public-card grid gap-3 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/86 p-3 shadow-[0_24px_80px_-36px_rgba(11,47,115,0.42)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              { icon: CalendarCheck, title: "Agendar consulta", desc: "Escolha horario e especialidade", href: "/agendar", tone: "from-blue-500 to-cyan-500" },
              { icon: Video, title: "Teleconsulta 24h", desc: "Atendimento online seguro", href: "/teleconsulta", tone: "from-emerald-500 to-teal-500" },
              { icon: Building2, title: "Empresas", desc: "Saude corporativa simples", href: "/para-empresas", tone: "from-indigo-500 to-violet-500" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="group flex items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-slate-50"
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${item.tone} text-white shadow-lg shadow-slate-900/10 transition group-hover:scale-105`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-slate-950">{item.title}</span>
                    <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-500">{item.desc}</span>
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                </button>
              );
            })}
          </motion.div>
        </div>
      </section>
      <PingoCampaignShowcase />
      <SpecialtiesSection config={sectionData.specialties} />
      <PingoRunBanner />

      {/* ═══════════════ AGENDAR CONSULTA ═══════════════ */}
      <section className="relative py-24 md:py-40 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/[0.02] via-primary/[0.05] to-background" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-24 items-center">
            <motion.div
              className="flex justify-center relative order-2 lg:order-1"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-[80px] scale-75 animate-pulse" />
              <img src={doctorTeleconsulta} alt="Médico Teleconsulta" className="public-image-depth relative z-10 w-[380px] lg:w-[540px] h-auto drop-shadow-2xl" />
            </motion.div>

            <motion.div
              className="order-1 lg:order-2"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-4xl lg:text-6xl font-black text-foreground leading-[1.05] mb-6">
                Agende sua <span className="text-gradient">consulta online</span> em minutos
              </h2>
              <p className="text-muted-foreground text-lg sm:text-xl mb-12 max-w-xl">
                Acesso imediato a médicos especialistas de qualquer lugar. Receitas, atestados e exames entregues digitalmente com total segurança.
              </p>

              <div className="grid sm:grid-cols-1 gap-5 mb-12">
                {[
                  { img: pingoCalendar, title: "Agende em segundos", desc: "Escolha o melhor horário para você" },
                  { img: pingoVideocall, title: "Consulta por vídeo HD", desc: "Atendimento humano e seguro por vídeo" },
                  { img: pingoPrescription, title: "Receita digital", desc: "Válida em todas as farmácias do país" },
                ].map((item, i) => (
                  <div key={i} className="public-card flex items-center gap-5 overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:bg-card hover:shadow-xl">
                    <img src={item.img} alt={item.title} className="public-image-depth w-14 h-14 object-contain" />
                    <div>
                      <p className="font-extrabold text-foreground text-lg">{item.title}</p>
                      <p className="text-sm text-muted-foreground font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="rounded-2xl h-[60px] px-12 text-lg font-bold shadow-2xl shadow-primary/25 transition-transform hover:scale-105" onClick={() => navigate("/agendar")}>
                  Agendar consulta <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button size="lg" variant="outline" className="rounded-2xl h-[60px] px-8 text-base font-bold border-2" onClick={() => navigate("/especialidades")}>
                  <Stethoscope className="w-5 h-5 mr-2" />
                  Ver especialidades
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <TechnologySection config={sectionData.technology} />
      <ConsultaInfoBanner />
      {isOn("how_it_works") !== false && <HowItWorksSection />}
      {isOn("benefits") !== false && <BenefitsGrid />}
      <TrustBanner />

      {/* ═══════════════ DEPOIMENTOS ═══════════════ */}
      {isOn("testimonials") && (
        <section className="relative py-24 md:py-32 overflow-hidden">
          {/* Background ambiance */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-primary/[0.04] to-background" />
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-primary/10 blur-3xl -z-10" />
          <div className="absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full bg-secondary/10 blur-3xl -z-10" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-[0.9fr_1.3fr] gap-16 lg:gap-20 items-center">
              {/* Pingo + rating */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="flex flex-col items-center text-center relative"
              >
                <div className="relative">
                  {/* Halo */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-secondary/15 to-transparent rounded-full blur-2xl scale-110" />
                  <div className="absolute inset-4 bg-card rounded-full shadow-2xl" />
                  <img
                    src={pingoDepoimentos}
                    alt="Pingo celebrando avaliações dos pacientes"
                    className="relative w-[260px] lg:w-[360px] drop-shadow-2xl pingo-float"
                  />
                </div>

                <div className="relative mt-6 px-8 py-5 rounded-[2rem] bg-card border border-border/60 shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.25)]">
                  <div className="flex items-center justify-center gap-1 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400 drop-shadow-sm" />
                    ))}
                  </div>
                  <p className="text-4xl font-extrabold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent leading-none">
                    4.9<span className="text-2xl text-muted-foreground font-bold">/5</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 font-semibold uppercase tracking-wider">
                    +12.000 avaliações reais
                  </p>
                </div>
              </motion.div>

              {/* Testimonials */}
              <div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="mb-10"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary/60 mb-3 block">
                    Depoimentos
                  </span>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight leading-[1.05]">
                    {sectionData.testimonials?.title || (
                      <>
                        O que nossos <span className="text-primary">pacientes</span> dizem
                      </>
                    )}
                  </h2>
                </motion.div>

                <TestimonialsMarquee />
              </div>
            </div>
          </div>
        </section>
      )}

      {isOn("for_doctors") !== false && <ForDoctorsSection />}
      {isOn("faq") !== false && <FAQSection />}
      {isOn("cta_banner") !== false && <CTABanner />}

      {isOn("footer") && <Footer config={sectionData.footer} />}
    </div>
  );
});

Index.displayName = "Index";
export default Index;
