import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { memo, forwardRef } from "react";
import { motion } from "framer-motion";
import { usePrefetchRoute } from "@/hooks/use-prefetch-route";
import OptimizedImage from "@/components/ui/optimized-image";
import { ArrowRight, ShieldCheck, Lock, Star, CheckCircle, CreditCard, Clock, Heartbeat, VideoCamera } from "@phosphor-icons/react";
import heroPingoFamily from "@/assets/hero-pingo-family.png";
import { isFeatureEnabled } from "@/lib/featureFlags";

const trustItems = [
  { label: "Regulamentado CFM", icon: ShieldCheck },
  { label: "Criptografia E2E", icon: Lock },
  { label: "4.9★ — 12k avaliações", icon: Star },
];

const highlights = [
  "Receita digital válida em todo o Brasil",
  "Atendimento 24h — inclusive feriados",
  "30+ especialidades médicas",
];

const HeroSection = memo(
  forwardRef<HTMLElement, { config?: any }>(({ config }, ref) => {
    const navigate = useNavigate();
    const prefetchPaciente = usePrefetchRoute(() => import("@/pages/AuthPaciente"));

    const title      = config?.title || "Cuidado médico de excelência para você";
    const subtitle   = config?.subtitle || "Conecte-se a médicos especialistas verificados pelo CFM em poucos cliques. Atendimento humano, seguro e disponível a qualquer momento do seu dia.";
    const ctaText    = config?.cta_text || "Agendar consulta";
    const ctaUrl     = config?.cta_url || "/agendar";
    const badgeText  = config?.badge_text || "Médicos disponíveis agora";
    const heroImgUrl = heroPingoFamily;

    return (
      <section
        ref={ref}
        aria-label="Início"
        className="relative flex items-center pt-24 sm:pt-28 lg:pt-36 pb-20 sm:pb-24 lg:pb-32 overflow-hidden"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/[0.02]" />
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/[0.06] blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-secondary/[0.05] blur-[120px]" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--foreground) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.5) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
        </div>

        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16 xl:gap-24 items-center">
            <motion.div
              className="max-w-2xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-success/20 bg-success/[0.06] text-success text-xs font-bold mb-8 shadow-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                </span>
                {badgeText}
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[3.6rem] font-black leading-[1.05] tracking-tight text-foreground mb-6">
                <span className="text-gradient block">{title}</span>
              </h1>

              <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mb-8">
                {subtitle}
              </p>

              <div className="flex flex-col gap-3 mb-10">
                {highlights.map((h) => (
                  <div key={h} className="flex items-center gap-3 text-[15px] font-medium text-foreground/80">
                    <CheckCircle className="w-5 h-5 text-success shrink-0" weight="fill" />
                    {h}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Button
                  size="lg"
                  className="w-full sm:w-auto rounded-2xl h-[60px] px-10 text-[15px] font-extrabold shadow-xl shadow-primary/25 group transition-all duration-300 hover:scale-[1.02] bg-primary hover:bg-primary/90"
                  onClick={() => navigate(ctaUrl)}
                  onMouseEnter={prefetchPaciente}
                >
                  {ctaText}
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" weight="bold" />
                </Button>

                 {isFeatureEnabled("cartao_pingo") && (
                   <motion.div
                     whileHover={{ scale: 1.03 }}
                     whileTap={{ scale: 0.98 }}
                     className="w-full sm:w-auto"
                   >
                     <Button
                       size="lg"
                       variant="outline"
                       className="w-full sm:w-auto rounded-2xl h-[60px] px-8 text-[15px] font-bold border-amber-400/60 bg-amber-400/5 hover:bg-amber-400/10 hover:border-amber-500 text-foreground transition-all duration-300 gap-3 group relative overflow-hidden"
                       onClick={() => navigate("/pingo-card")}
                     >
                       <div className="absolute inset-0 bg-gradient-to-r from-amber-400/0 via-amber-400/5 to-amber-400/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                       <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shadow-[0_4px_12px_rgba(245,158,11,0.3)] group-hover:shadow-[0_4px_20px_rgba(245,158,11,0.5)] transition-all shrink-0">
                         <CreditCard className="w-5 h-5 text-amber-950" weight="fill" />
                       </div>
                       <div className="flex flex-col items-start leading-tight">
                         <span className="text-amber-600 text-[10px] font-bold uppercase tracking-wider">Cartão de Benefícios</span>
                         <span className="text-[16px]">Pingo Card</span>
                       </div>
                     </Button>
                   </motion.div>
                 )}
                
                <div className="flex -space-x-2 ml-2 hidden xl:flex">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden">
                      <img src={`https://i.pravatar.cc/150?u=${i}`} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    +12k
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="relative hidden lg:flex justify-center items-center"
              initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
            >
              {/* Halo */}
              <div className="absolute inset-0 -z-10">
                <div className="absolute inset-10 rounded-full bg-gradient-to-br from-primary/20 via-secondary/15 to-transparent blur-3xl" />
              </div>

              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 w-full"
              >
                <OptimizedImage
                  src={heroImgUrl}
                  alt="Médico e pacientes"
                  className="w-full h-auto max-w-[600px] mx-auto mix-blend-multiply"
                />
              </motion.div>

              {/* Floating stats card — top-left */}
              <motion.div
                initial={{ opacity: 0, x: -30, y: -10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="absolute top-6 left-0 xl:left-2 z-20 hidden xl:flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-md p-3 pr-4 shadow-xl shadow-primary/10"
              >
                <div className="w-11 h-11 rounded-xl bg-success/15 flex items-center justify-center">
                  <VideoCamera className="w-5 h-5 text-success" weight="fill" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Em consulta agora</p>
                  <p className="text-base font-extrabold text-foreground">847 pacientes</p>
                </div>
              </motion.div>

              {/* Floating rating card — bottom-right */}
              <motion.div
                initial={{ opacity: 0, x: 30, y: 10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="absolute bottom-8 right-0 xl:right-2 z-20 hidden xl:block rounded-2xl border border-border/60 bg-background/80 backdrop-blur-md p-4 shadow-xl shadow-primary/10 max-w-[220px]"
              >
                <div className="flex items-center gap-1 mb-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-3.5 h-3.5 text-amber-400" weight="fill" />
                  ))}
                  <span className="text-xs font-extrabold text-foreground ml-1">4.9</span>
                </div>
                <p className="text-[12px] text-foreground/80 leading-snug font-medium italic">
                  "Resolvi minha consulta em 8 minutos, do sofá."
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-semibold">— Maria, SP</p>
              </motion.div>

              {/* Floating heartbeat pulse — middle-right */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, duration: 0.5, type: "spring" }}
                className="absolute top-1/2 right-4 z-20 hidden 2xl:flex items-center gap-2 rounded-full border border-border/60 bg-background/80 backdrop-blur-md px-3 py-2 shadow-lg"
              >
                <Heartbeat className="w-4 h-4 text-destructive animate-pulse" weight="fill" />
                <span className="text-[11px] font-bold text-foreground">CFM Verificado</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>
    );
  })
);

HeroSection.displayName = "HeroSection";
export default HeroSection;
