import { memo } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lightning, Receipt, UsersFour, SealCheck, ArrowRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import familyImg from "@/assets/pingo-king-familia.jpg";
import doctorAppImg from "@/assets/doctor-phone-teleconsulta.png";
import multiplatformImg from "@/assets/devices-mascot.jpg";
import familyPlanImg from "@/assets/pingo-mini-familia.png";
import medicalRecordsImg from "@/assets/pingo-medico-ferramentas.jpg";

const sideBenefits = [
  {
    icon: Lightning,
    title: "Atendimento em minutos",
    description: "Sem filas ou deslocamento. Consulte médicos especialistas de qualquer lugar do Brasil.",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600",
  },
  {
    icon: ShieldCheck,
    title: "Segurança total",
    description: "Dados criptografados end-to-end em total conformidade com a LGPD e o CFM.",
    iconBg: "bg-secondary/10",
    iconColor: "text-secondary",
  },
  {
    icon: Receipt,
    title: "Receita digital válida",
    description: "Receitas e atestados assinados digitalmente, aceitos em farmácias de todo o país.",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
];

const bottomCards = [
  {
    image: multiplatformImg,
    title: "Multiplataforma",
    description: "Acesse pelo celular, tablet ou computador. Sem instalações complexas.",
    cta: { label: "Baixar app", href: "/agendar" },
  },
  {
    image: familyPlanImg,
    title: "Plano família",
    description: "Adicione dependentes e cuide de toda a família em uma conta única.",
    cta: { label: "Agendar consulta", href: "/agendar" },
  },
  {
    image: medicalRecordsImg,
    title: "Prontuário completo",
    description: "Todo seu histórico de consultas, exames e receitas sempre à mão.",
    cta: { label: "Ver detalhes", href: "/sobre/tecnologia" },
  },
];

function BenefitsGrid() {
  return (
    <section className="py-16 md:py-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-col gap-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="px-4 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-bold tracking-widest uppercase border border-primary/10">
            Soluções Modernas
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight">
            Saúde moderna, <span className="text-primary">sem complicação</span>
          </h2>
        </motion.div>

        {/* Top Grid: Hero + side benefits */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Hero family card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="md:col-span-8 group relative overflow-hidden rounded-[2.5rem] bg-muted aspect-[16/10] md:aspect-auto md:min-h-[480px] flex flex-col shadow-2xl shadow-primary/10"
          >
            <img
              src={familyImg}
              alt="Família em teleconsulta com Pingo"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent" />
            <div className="relative mt-auto p-8 md:p-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-xl border border-white/20 w-fit">
                <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="text-white text-[10px] font-bold uppercase tracking-widest">Para toda a família</span>
              </div>
              <h3 className="text-2xl md:text-4xl font-bold text-white leading-tight max-w-xl">
                Consultas para toda a família, de onde vocês estiverem
              </h3>
              <p className="text-white/80 text-base md:text-lg max-w-lg leading-relaxed">
                Cuide de quem você ama com praticidade. Adicione dependentes e gerencie a saúde de todos em um só lugar.
              </p>
            </div>
          </motion.div>

          {/* Right column: 3 benefit cards */}
          <div className="md:col-span-4 flex flex-col gap-6">
            {sideBenefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 bg-card p-7 rounded-[2rem] border border-border/40 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-2xl ${b.iconBg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <b.icon className={`w-6 h-6 ${b.iconColor}`} weight="fill" />
                </div>
                <h4 className="font-bold text-foreground text-lg mb-2">{b.title}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom row: 3 mascot cards + CFM trust card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {bottomCards.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group bg-card p-6 sm:p-7 md:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-border/40 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center flex flex-col items-center h-full"
            >
              <div className="w-full h-40 sm:h-44 md:h-48 mb-5 sm:mb-6 flex items-end justify-center overflow-hidden">
                <img
                  src={c.image}
                  alt={c.title}
                  loading="lazy"
                  decoding="async"
                  className="max-h-full max-w-full w-auto h-auto object-contain group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <h4 className="font-bold text-foreground text-lg mb-2">{c.title}</h4>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">{c.description}</p>
              <Link
                to={c.cta.href}
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
              >
                {c.cta.label}
                <ArrowRight className="w-4 h-4" weight="bold" />
              </Link>
            </motion.div>
          ))}

          {/* CFM Verified */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="relative overflow-hidden rounded-[2.5rem] group min-h-[320px] shadow-xl shadow-primary/10"
          >
            <div className="absolute inset-0 bg-primary" />
            <img
              src={doctorAppImg}
              alt="Médica verificada com Pingo"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent" />
            <div className="relative h-full p-8 flex flex-col justify-between">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25">
                <SealCheck className="w-6 h-6 text-white" weight="fill" />
              </div>
              <div>
                <h4 className="text-white font-bold text-xl leading-snug mb-2">Médicos verificados pelo CFM</h4>
                <p className="text-white/75 text-sm leading-relaxed">
                  Excelência clínica e conformidade ética em cada atendimento realizado.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default memo(BenefitsGrid);
