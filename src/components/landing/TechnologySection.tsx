import { motion } from "framer-motion";
import { Video, ShieldCheck, Cpu, Lock, Zap } from "lucide-react";
import technologyImage from "@/assets/technology-doctor.png";

const TechnologySection = ({ config }: { config?: any }) => {
  const title = config?.title || "Inovação a serviço da sua saúde";
  const subtitle = config?.subtitle || "Utilizamos tecnologia de ponta para oferecer uma experiência médica segura e eficiente. Cada detalhe foi pensado para garantir qualidade no atendimento.";
  
  const features = [
    {
      icon: <Video className="w-6 h-6" />,
      title: "Videochamada em HD",
      description: "Conexão estável com criptografia ponta a ponta para consultas seguras e sem interrupção.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "Receita Digital Válida",
      description: "Prescrições com assinatura digital certificada ICP-Brasil, aceitas em qualquer farmácia do país.",
    },
    {
      icon: <Cpu className="w-6 h-6" />,
      title: "Inteligência Artificial",
      description: "IA para auxiliar médicos em diagnósticos, otimizar o atendimento e melhorar a experiência do paciente.",
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "Proteção de Dados (LGPD)",
      description: "Seus dados são protegidos com os mais altos padrões de segurança e em total conformidade com a LGPD.",
    },
  ];

  return (
    <section className="relative w-full py-16 md:py-24 bg-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-white rounded-[2rem] md:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(20,66,114,0.12)] border border-slate-200/60 overflow-hidden">
          {/* Decorative Tech Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(hsl(215,75%,32%) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-secondary/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 p-6 sm:p-10 lg:p-20 items-center">
            {/* Left: Mascot + floating glass widgets */}
            <motion.div
              className="relative flex justify-center items-center h-full min-h-[420px] lg:min-h-[520px]"
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {/* Floating glass widget — top right */}
              <div className="absolute top-0 right-0 sm:right-4 z-20 w-40 sm:w-44 bg-white/70 backdrop-blur-md rounded-2xl border border-white shadow-xl px-4 py-3 animate-float-up">
                <div className="w-10 h-1.5 bg-secondary rounded-full mb-3" />
                <div className="space-y-1.5">
                  <div className="w-24 h-1 bg-slate-200 rounded-full" />
                  <div className="w-16 h-1 bg-slate-200 rounded-full" />
                </div>
              </div>

              {/* Floating glass widget — bottom left */}
              <div className="absolute bottom-4 left-0 sm:left-2 z-20 w-48 bg-white/70 backdrop-blur-md rounded-2xl border border-white shadow-xl px-5 py-4 animate-float-down">
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <div className="w-20 h-2 bg-primary rounded-full" />
                </div>
                <div className="space-y-1.5">
                  <div className="w-32 h-1 bg-slate-200 rounded-full" />
                  <div className="w-24 h-1 bg-slate-200 rounded-full" />
                </div>
              </div>

              {/* Mascot */}
              <div className="relative z-10 w-full max-w-[460px] drop-shadow-[0_20px_60px_rgba(20,66,114,0.2)]">
                <img
                  src={technologyImage}
                  alt="Pingo — tecnologia de ponta"
                  className="w-full h-auto select-none"
                  draggable={false}
                />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2/3 h-10 bg-black/10 blur-xl rounded-[100%]" />
              </div>
            </motion.div>

            {/* Right: Content */}
            <div className="flex flex-col">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-6 self-start">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-primary">
                    Nossa Tecnologia
                  </span>
                </div>

                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-primary leading-[1.1] mb-5">
                  Tecnologia de ponta
                  <br />
                  <span className="text-secondary">a seu favor</span>
                </h2>

                <p className="text-slate-500 text-base sm:text-lg mb-10 leading-relaxed max-w-lg">
                  {subtitle}
                </p>
              </motion.div>

              <div className="grid gap-4">
                {features.map((feature, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="group relative p-5 sm:p-6 bg-slate-50/60 hover:bg-white border border-transparent hover:border-secondary/20 rounded-[1.5rem] sm:rounded-[2rem] transition-all duration-300 hover:shadow-[0_20px_40px_-15px_rgba(20,66,114,0.12)]"
                  >
                    <div className="flex items-start gap-4 sm:gap-5">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-primary mb-1">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-slate-500 leading-snug">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechnologySection;
