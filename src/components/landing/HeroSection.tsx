import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { memo, forwardRef } from "react";
import { motion } from "framer-motion";
import { usePrefetchRoute } from "@/hooks/use-prefetch-route";
import OptimizedImage from "@/components/ui/optimized-image";
import { ArrowRight, Star, CreditCard, VideoCamera, ShieldCheck, Clock, Sparkle, Check, WifiHigh } from "@phosphor-icons/react";
import heroPingoFamily from "@/assets/hero-pingo-family.png";

const highlights = [
  { icon: ShieldCheck, text: "Receita digital válida em todo o Brasil" },
  { icon: Clock, text: "Atendimento 24h — inclusive feriados" },
  { icon: Sparkle, text: "30+ especialidades médicas" },
];

const HeroSection = memo(
  forwardRef<HTMLElement, { config?: any }>(({ config }, ref) => {
    const navigate = useNavigate();
    const prefetchPaciente = usePrefetchRoute(() => import("@/pages/AuthPaciente"));

    const subtitle  = config?.subtitle || "Conecte-se a médicos especialistas verificados pelo CFM. Consultas por vídeo em HD, receitas digitais válidas e prontuário eletrônico completo.";
    const ctaText   = config?.cta_text || "Agendar consulta";
    const ctaUrl    = config?.cta_url || "/agendar";
    const badgeText = config?.badge_text || "Médicos disponíveis agora";

    return (
      <section
        ref={ref}
        aria-label="Início"
        className="relative pt-24 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24 overflow-hidden bg-gradient-to-b from-[#f0f9ff] via-white to-[#f0f9ff]"
      >
        {/* Ambient glow */}
        <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[#0ea5e9]/[0.10] blur-[120px]" />
          <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#0284c7]/[0.08] blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.025] [background-image:radial-gradient(circle_at_1px_1px,#0284c7_1px,transparent_0)] [background-size:24px_24px]" />
        </div>

        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-4 lg:auto-rows-[110px]">

            {/* Headline + CTA principal */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="public-card lg:col-span-7 lg:row-span-4 bg-white/95 backdrop-blur-sm rounded-[28px] p-8 md:p-12 flex flex-col justify-center border border-white shadow-[0_20px_60px_-20px_rgba(2,132,199,0.15)] relative overflow-hidden"
            >
              <div aria-hidden className="absolute -top-10 -right-10 w-48 h-48 bg-gradient-to-br from-[#e0f2fe] to-transparent rounded-full blur-2xl" />
              <div aria-hidden className="absolute -bottom-16 -left-10 w-40 h-40 bg-gradient-to-tr from-sky-100/60 to-transparent rounded-full blur-2xl" />

              <div className="inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 bg-gradient-to-r from-emerald-50 to-emerald-50/50 text-emerald-700 rounded-full text-xs font-semibold mb-6 border border-emerald-200/60 shadow-sm shadow-emerald-100/50 w-fit relative">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                {badgeText}
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[64px] font-extrabold leading-[1.02] mb-5 tracking-[-0.02em] relative">
                <span className="text-slate-900">Cuidado médico de </span>
                <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-[#0ea5e9] via-[#0284c7] to-[#0369a1] bg-clip-text text-transparent">
                  excelência
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-lg mb-8 leading-relaxed relative">
                {subtitle}
              </p>

              <div className="flex flex-wrap items-center gap-4 relative">
                <Button
                  size="lg"
                  onClick={() => navigate(ctaUrl)}
                  onMouseEnter={prefetchPaciente}
                  className="relative rounded-2xl h-[60px] px-8 text-base font-bold bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] hover:from-[#0284c7] hover:to-[#075985] text-white shadow-[0_12px_30px_-8px_rgba(2,132,199,0.55)] hover:shadow-[0_18px_40px_-8px_rgba(2,132,199,0.65)] transition-all duration-300 hover:-translate-y-0.5 group overflow-hidden"
                >
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative">{ctaText}</span>
                  <ArrowRight className="relative w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" weight="bold" />
                </Button>

                <div className="hidden sm:flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-muted overflow-hidden">
                        <img src={`https://i.pravatar.cc/80?u=${i}`} alt="Paciente" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-md">
                      +12k
                    </div>
                  </div>
                  <div className="ml-1 leading-tight">
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[1,2,3,4,5].map((i)=>(<Star key={i} className="w-3 h-3" weight="fill" />))}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">+12k pacientes atendidos</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Pingo — célula âncora */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
              className="public-media-card lg:col-span-5 lg:row-span-6 bg-gradient-to-br from-[#e0f2fe] to-[#f0f9ff] rounded-3xl overflow-hidden relative group min-h-[440px] border border-white shadow-sm"
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 flex items-end justify-center pt-20 px-4"
              >
                <OptimizedImage
                  src={heroPingoFamily}
                  alt="Pingo, mascote da AloClínica, junto a pacientes"
                  priority
                  className="public-image-depth w-full h-auto max-h-full object-contain mix-blend-multiply"
                />
              </motion.div>

              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0ea5e9]/10 to-transparent pointer-events-none" />

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="absolute top-5 right-5 z-10"
              >
                <div className="bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white shadow-lg flex items-center gap-3">
                  <div className="p-2 bg-[#0ea5e9]/10 rounded-lg">
                    <VideoCamera className="w-5 h-5 text-[#0ea5e9]" weight="fill" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Em consulta agora</p>
                    <p className="text-sm font-bold text-slate-800">847 pacientes</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="absolute bottom-5 left-5 right-5 z-10"
              >
                <div className="bg-white/85 backdrop-blur-md p-4 rounded-2xl border border-white shadow-xl">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className="w-3.5 h-3.5" weight="fill" />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-800">4.9</span>
                    </div>
                    <div className="bg-rose-50 px-2 py-1 rounded text-[10px] font-bold text-rose-600 border border-rose-100 uppercase tracking-tighter">
                      CFM Verificado
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 italic leading-snug">
                    "Resolvi minha consulta em 8 minutos, sem sair do sofá."
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase">— Maria, SP</p>
                </div>
              </motion.div>
            </motion.div>

            {/* Benefícios principais */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="public-card lg:col-span-7 lg:row-span-2 bg-white/95 backdrop-blur-sm rounded-3xl p-6 border border-white shadow-[0_12px_40px_-16px_rgba(2,132,199,0.18)] flex flex-col gap-3 justify-center"
            >
              {highlights.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 group">
                  <div className="bg-gradient-to-br from-sky-50 to-sky-100 p-2 rounded-lg flex-shrink-0 ring-1 ring-sky-100 group-hover:scale-110 transition-transform">
                    <Icon className="w-4 h-4 text-[#0284c7]" weight="fill" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 leading-snug">{text}</p>
                </div>
              ))}
            </motion.div>

          </div>
        </div>
      </section>
    );
  })
);

HeroSection.displayName = "HeroSection";
export default HeroSection;
