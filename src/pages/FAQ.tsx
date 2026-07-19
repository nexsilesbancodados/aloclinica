import { forwardRef, lazy, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import Header from "@/components/landing/Header";
import SEOHead from "@/components/SEOHead";

const Footer = lazy(() => import("@/components/landing/Footer"));

const faqCategories = {
  geral: {
    label: "Geral",
    icon: "❓",
    questions: [
      {
        q: "O que é AloClínica?",
        a: "AloClínica é uma plataforma de telemedicina que conecta pacientes com médicos especializados para consultas online 24 horas por dia.",
      },
      {
        q: "Como posso agendar uma consulta?",
        a: "Crie uma conta, escolha a especialidade ou médico desejado, selecione um horário disponível e confirme. Pronto!",
      },
      {
        q: "Quais formas de pagamento vocês aceitam?",
        a: "Aceitamos cartão de crédito, débito, PIX e planos de assinatura mensal ou familiar.",
      },
      {
        q: "Posso remarcar ou cancelar minha consulta?",
        a: "Sim, você pode remarcar ou cancelar sem custo até 12 horas antes da consulta.",
      },
    ],
  },
  paciente: {
    label: "Para Pacientes",
    icon: "👤",
    questions: [
      {
        q: "Quanto custa uma consulta?",
        a: "Consultas avulsas custam R$ 89. Temos planos mensais a partir de R$ 49 e planos família a partir de R$ 89.",
      },
      {
        q: "Preciso de receita? Como funciona?",
        a: "Sim, o médico pode prescrever medicamentos que são válidos em qualquer farmácia do Brasil.",
      },
      {
        q: "É preciso ter qualidade de internet boa?",
        a: "A plataforma é otimizada para diferentes velocidades. Uma conexão 3G+ é suficiente.",
      },
      {
        q: "Meus dados estão seguros?",
        a: "Sim, usamos criptografia AES-256, conformidade LGPD/CFM, e backups diários. Sua privacidade é nossa prioridade.",
      },
      {
        q: "Posso usar pelo celular?",
        a: "Sim, a plataforma é 100% otimizada para celular. App disponível em breve.",
      },
      {
        q: "Como recebo o atestado?",
        a: "O médico gera o atestado durante a consulta. Você recebe um PDF válido para usar no trabalho.",
      },
    ],
  },
  medico: {
    label: "Para Médicos",
    icon: "👨‍⚕️",
    questions: [
      {
        q: "Como posso me cadastrar como médico?",
        a: "Visite /para-medicos, preencha seu CRM, especialidade e documentos. Aprovação em até 24h.",
      },
      {
        q: "Quanto ganho por consulta?",
        a: "A remuneração varia de R$ 30 a R$ 80 por consulta, dependendo da especialidade e demanda.",
      },
      {
        q: "Posso definir meus próprios horários?",
        a: "Sim, você controla sua agenda completamente. Escolha quando quer atender.",
      },
      {
        q: "Como recebo meu pagamento?",
        a: "Realizamos saque automático mensal via transferência bancária. Você acompanha tudo em tempo real.",
      },
      {
        q: "Quais ferramentas médicas estão disponíveis?",
        a: "Prontuário SOAP, prescrição digital, atestados, compartilhamento de tela e histórico do paciente.",
      },
      {
        q: "Preciso aprovar pacientes antes de atender?",
        a: "Não, os pacientes confirmam na hora do agendamento. Você recebe notificação e pode aceitar ou recusar.",
      },
    ],
  },
  empresa: {
    label: "Para Empresas",
    icon: "🏢",
    questions: [
      {
        q: "Como funciona o Cartão B2B?",
        a: "Oferecemos planos corporativos que cobrem telemedicina para seus colaboradores com suporte dedicado.",
      },
      {
        q: "Qual é o ROI do investimento em saúde corporativa?",
        a: "Empresas relatam redução de 40% em afastamentos e aumento de 35% em produtividade.",
      },
      {
        q: "Posso customizar o plano?",
        a: "Sim, criamos planos sob medida para sua empresa. Converse com nosso time de vendas.",
      },
      {
        q: "Como é o suporte para empresas?",
        a: "Você tem um gestor dedicado, relatórios customizados, campanhas de saúde e suporte 24/7.",
      },
    ],
  },
  tecnico: {
    label: "Técnico",
    icon: "🔧",
    questions: [
      {
        q: "Que tipo de criptografia vocês usam?",
        a: "Criptografia AES-256 para dados em repouso e SSL/TLS para dados em trânsito.",
      },
      {
        q: "Quais certificações de segurança vocês têm?",
        a: "Somos LGPD compliant, CFM regulado, HIPAA-compatible e ISO 27001 certificados.",
      },
      {
        q: "Como é feito o backup de dados?",
        a: "Realizamos backups redundantes em múltiplos data centers com replicação em tempo real.",
      },
      {
        q: "Qual é o tempo de atividade (uptime) da plataforma?",
        a: "Garantimos 99.9% de uptime com monitoramento 24/7 e alertas automáticos.",
      },
      {
        q: "Como vocês lidam com conformidade LGPD?",
        a: "Temos política de coleta mínima, consentimento explícito, direito ao esquecimento e audit trails completos.",
      },
    ],
  },
};

const FAQ = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const allQuestions = Object.values(faqCategories)
    .flatMap((cat) =>
      cat.questions.map((q, i) => ({
        ...q,
        category: cat.label,
        icon: cat.icon,
        id: `${cat.label}-${i}`,
      }))
    )
    .filter(
      (item) =>
        item.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.a.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div ref={ref} className="relative min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-[image:var(--landing-bg)] pointer-events-none" />

      <SEOHead
        title="FAQ - Perguntas Frequentes | AloClínica"
        description="Respostas para as principais dúvidas sobre telemedicina, agendamento, pagamento e segurança."
        canonical="https://aloclinica.com.br/faq"
      />

      <Header />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
              Dúvidas?
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-tight mb-6">
              Perguntas <span className="text-primary">Frequentes</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Encontre respostas rápidas para as principais perguntas sobre AloClínica.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Search */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="relative">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" weight="bold" />
            <Input
              type="text"
              placeholder="Procure por pergunta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 rounded-xl text-base"
            />
          </div>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          {searchTerm === "" ? (
            // Show by category
            <div className="space-y-16">
              {Object.entries(faqCategories).map(([key, category], categoryIdx) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: categoryIdx * 0.1 }}
                >
                  <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
                    <span className="text-3xl">{category.icon}</span>
                    {category.label}
                  </h2>

                  <div className="space-y-3">
                    {category.questions.map((item, qIdx) => (
                      <motion.div
                        key={qIdx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: (categoryIdx * 0.1) + (qIdx * 0.02) }}
                        className="border border-border rounded-xl overflow-hidden bg-card hover:border-primary/30 transition-all"
                      >
                        <button
                          onClick={() =>
                            setExpandedQ(
                              expandedQ === `${key}-${qIdx}` ? null : `${key}-${qIdx}`
                            )
                          }
                          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                        >
                          <h3 className="font-semibold text-foreground">{item.q}</h3>
                          <CaretDown
                            className={`w-5 h-5 text-primary transition-transform ${
                              expandedQ === `${key}-${qIdx}` ? "rotate-180" : ""
                            }`}
                            weight="bold"
                          />
                        </button>

                        {expandedQ === `${key}-${qIdx}` && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="px-6 py-4 border-t border-border bg-muted/20"
                          >
                            <p className="text-muted-foreground leading-relaxed">{item.a}</p>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            // Show search results
            <div className="space-y-3">
              <p className="text-muted-foreground mb-6">
                {allQuestions.length} resultado{allQuestions.length !== 1 ? "s" : ""} encontrado{allQuestions.length !== 1 ? "s" : ""}
              </p>

              {allQuestions.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border border-border rounded-xl overflow-hidden bg-card hover:border-primary/30 transition-all"
                >
                  <button
                    onClick={() =>
                      setExpandedQ(expandedQ === item.id ? null : item.id)
                    }
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full mr-3">
                        {item.icon} {item.category}
                      </span>
                      <h3 className="font-semibold text-foreground mt-2">{item.q}</h3>
                    </div>
                    <CaretDown
                      className={`w-5 h-5 text-primary transition-transform shrink-0 ml-4 ${
                        expandedQ === item.id ? "rotate-180" : ""
                      }`}
                      weight="bold"
                    />
                  </button>

                  {expandedQ === item.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="px-6 py-4 border-t border-border bg-muted/20"
                    >
                      <p className="text-muted-foreground leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Não encontrou sua pergunta?
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              Nosso time está pronto para ajudar com qualquer dúvida.
            </p>
            <Button
              size="lg"
              className="bg-gradient-hero text-primary-foreground hover:opacity-90 rounded-xl px-8 h-12 font-semibold"
              onClick={() => navigate("/contato")}
            >
              Fale Conosco
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
});

FAQ.displayName = "FAQ";
export default FAQ;
