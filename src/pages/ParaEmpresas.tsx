import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Buildings,
  Users,
  TrendUp,
  ShieldCheck,
  CurrencyCircleDollar,
  Clock,
  CheckCircle,
  ArrowRight,
  ChartBar,
  Headset,
  Sparkle,
  CreditCard,
  Heart,
  QrCode,
  Gift,
  Calculator,
  Quotes,
  Star,
  Crown,
  Rocket,
} from "@phosphor-icons/react";
import { z } from "zod";
import { toast } from "sonner";
import Header from "@/components/landing/Header";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/integrations/supabase/untyped";
import pingoEmpresa from "@/assets/pingo-medico-ferramentas.jpg";

const Footer = lazy(() => import("@/components/landing/Footer"));

const leadSchema = z.object({
  company_name: z.string().trim().min(2, "Nome da empresa obrigatório").max(200),
  contact_name: z.string().trim().min(2, "Nome do contato obrigatório").max(200),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  message: z.string().max(2000).optional(),
});

const benefits = [
  {
    icon: CurrencyCircleDollar,
    title: "Reduza custos com saúde",
    desc: "Economia de até 60% em relação a planos de saúde tradicionais.",
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    icon: Clock,
    title: "Atendimento 24h",
    desc: "Seus colaboradores atendidos a qualquer hora, sem deslocamento.",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: TrendUp,
    title: "Mais produtividade",
    desc: "Menos faltas, menos afastamentos e mais bem-estar no trabalho.",
    color: "bg-amber-500/10 text-amber-600",
  },
  {
    icon: ShieldCheck,
    title: "Conformidade total",
    desc: "Atendimento conforme LGPD, CFM e diretrizes corporativas.",
    color: "bg-violet-500/10 text-violet-600",
  },
  {
    icon: ChartBar,
    title: "Painel gerencial",
    desc: "Relatórios de uso, indicadores de saúde e ROI em tempo real.",
    color: "bg-rose-500/10 text-rose-600",
  },
  {
    icon: Headset,
    title: "Suporte dedicado",
    desc: "Gerente de conta exclusivo para sua empresa.",
    color: "bg-teal-500/10 text-teal-600",
  },
];

const includes = [
  "Teleconsulta ilimitada com clínico geral 24h",
  "Acesso a 30+ especialidades médicas",
  "Receitas e atestados digitais com validade legal",
  "Pedidos de exames com integração laboratorial",
  "Prontuário eletrônico individual e seguro",
  "App mobile para colaboradores e dependentes",
  "Painel administrativo para gestor de RH",
  "Onboarding e treinamento da equipe",
];

const ParaEmpresas = () => {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [employees, setEmployees] = useState<number>(50);

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const roi = useMemo(() => {
    // estimativas conservadoras
    const planoTradicionalPerHead = 280;
    const aloPerHead = 49;
    const traditional = employees * planoTradicionalPerHead;
    const alo = employees * aloPerHead;
    const monthlySaving = traditional - alo;
    const yearlySaving = monthlySaving * 12;
    const productivityGain = employees * 35; // R$/mês economizados em faltas
    return {
      traditional,
      alo,
      monthlySaving,
      yearlySaving,
      productivityGain,
      total: yearlySaving + productivityGain * 12,
    };
  }, [employees]);

  const corporatePlans = [
    {
      name: "Starter",
      tagline: "Times pequenos",
      icon: Rocket,
      employees: "Até 30 colaboradores",
      price: 49,
      color: "from-emerald-500 to-teal-500",
      ringColor: "ring-emerald-200",
      features: [
        "Teleconsulta 24h ilimitada",
        "App mobile + painel RH",
        "Suporte por chat",
      ],
    },
    {
      name: "Business",
      tagline: "O mais escolhido",
      icon: Star,
      employees: "31 a 200 colaboradores",
      price: 39,
      color: "from-primary to-blue-600",
      ringColor: "ring-primary/30",
      highlight: true,
      features: [
        "Tudo do Starter +",
        "30+ especialidades médicas",
        "Dependentes inclusos",
        "Gerente de conta dedicado",
        "Relatórios avançados de ROI",
      ],
    },
    {
      name: "Enterprise",
      tagline: "Grandes corporações",
      icon: Crown,
      employees: "200+ colaboradores",
      price: null,
      color: "from-violet-600 to-fuchsia-600",
      ringColor: "ring-violet-200",
      features: [
        "Tudo do Business +",
        "Integração com RH/folha",
        "SLA personalizado",
        "Programas de bem-estar",
        "Atendimento white-label",
      ],
    },
  ];

  const cases = [
    {
      company: "TechHub Brasil",
      logo: "TH",
      employees: "180 colaboradores",
      saved: "R$ 420 mil/ano",
      text: "Reduzimos em 65% nossos custos com saúde e nossos colaboradores adoraram a praticidade do atendimento online.",
      author: "Carla Mendes — Diretora de RH",
      color: "from-emerald-500/15 to-teal-500/10",
    },
    {
      company: "Logística Norte",
      logo: "LN",
      employees: "320 colaboradores",
      saved: "R$ 780 mil/ano",
      text: "Nossos motoristas conseguem atendimento médico em qualquer lugar do Brasil. Diminuímos em 40% as faltas por consulta.",
      author: "Roberto Lima — CEO",
      color: "from-amber-500/15 to-orange-500/10",
    },
    {
      company: "Indústria Sul",
      logo: "IS",
      employees: "560 colaboradores",
      saved: "R$ 1.2M/ano",
      text: "O painel de gestão nos dá visibilidade total. O ROI no primeiro ano superou 380% — e a satisfação do time disparou.",
      author: "Patrícia Souza — Gerente de Pessoas",
      color: "from-violet-500/15 to-fuchsia-500/10",
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = leadSchema.safeParse(form);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Verifique os dados informados");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await db.from("b2b_leads").insert({
        company_name: result.data.company_name,
        contact_name: result.data.contact_name,
        email: result.data.email,
        phone: result.data.phone,
        message: result.data.message,
        status: "new",
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success("Recebemos seu contato! Em breve nosso time falará com você.");
      setForm({ company_name: "", contact_name: "", email: "", phone: "", message: "" });
    } catch (err) {
      toast.error("Não foi possível enviar agora. Tente novamente em alguns minutos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title="AloClínica para Empresas - Saúde Corporativa por Teleconsulta"
        description="Ofereça teleconsulta 24h, mais de 30 especialidades e bem-estar para seus colaboradores. Reduza custos com saúde e aumente a produtividade."
        canonical="https://aloclinica.com.br/para-empresas"
      />

      <Header />

      {/* Hero */}
      <section className="pt-32 pb-12 md:pt-40 md:pb-20 px-4">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
              <Buildings className="w-3.5 h-3.5" weight="fill" />
              Para Empresas
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight">
              Saúde para sua equipe, <span className="text-gradient">sem complicação</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed max-w-xl">
              Ofereça teleconsulta 24h, mais de 30 especialidades e bem-estar real para seus
              colaboradores. Atendimento humano, tecnologia segura e custo previsível.
            </p>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mb-7">
              {[
                { value: "60%", label: "menos custo" },
                { value: "24h", label: "disponível" },
                { value: "+500", label: "empresas" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</span>
                  <span className="text-xs md:text-sm text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="font-bold">
                <a href="#solicitar-proposta">
                  Solicitar proposta
                  <ArrowRight className="w-5 h-5 ml-2" weight="bold" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="font-bold">
                <Link to="/contato">Falar com consultor</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative flex justify-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-secondary/15 blur-3xl" />
            <img
              src={pingoEmpresa}
              alt="Pingo, mascote da AloClínica, com ferramentas médicas"
              className="relative w-full max-w-md object-contain drop-shadow-2xl"
              loading="eager"
              decoding="async"
            />
          </motion.div>
        </div>
      </section>

      {/* Benefícios gerais */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
              <Sparkle className="w-3.5 h-3.5" weight="fill" />
              Por que escolher
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-3 tracking-tight">
              Vantagens para sua empresa
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Mais saúde, mais produtividade e custos previsíveis. A AloClínica entrega tudo isso
              com tecnologia simples e suporte humano.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.45 }}
                className="bg-card rounded-2xl border border-border/40 p-6 hover:shadow-lg hover:border-primary/15 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl ${b.color} flex items-center justify-center mb-4`}>
                  <b.icon className="w-6 h-6" weight="fill" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANOS CORPORATIVOS */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
              <Buildings className="w-3.5 h-3.5" weight="fill" /> PLANOS CORPORATIVOS
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-3 tracking-tight">
              Um plano para cada tamanho de empresa
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Sem letras miúdas, sem fidelidade longa. Cresce com você.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {corporatePlans.map((plan, i) => {
              const Icon = plan.icon;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={plan.highlight ? "md:-mt-4" : ""}
                >
                  <Card className={`h-full relative overflow-hidden border-2 transition-all hover:shadow-2xl ${plan.highlight ? "border-primary shadow-xl" : "hover:border-primary/30"}`}>
                    {plan.highlight && (
                      <div className="absolute top-0 right-0 bg-gradient-to-r from-primary to-blue-600 text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                        Mais popular
                      </div>
                    )}
                    <CardContent className="p-6 md:p-7">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4 shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" weight="fill" />
                      </div>
                      <h3 className="text-xl font-extrabold mb-1">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mb-1">{plan.tagline}</p>
                      <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-5">{plan.employees}</p>

                      <div className="mb-6 pb-5 border-b border-border/60">
                        {plan.price ? (
                          <>
                            <span className="text-4xl font-extrabold tracking-tight">{formatBRL(plan.price)}</span>
                            <span className="text-sm text-muted-foreground"> /colaborador/mês</span>
                          </>
                        ) : (
                          <>
                            <span className="text-3xl font-extrabold tracking-tight">Sob consulta</span>
                            <p className="text-xs text-muted-foreground mt-1">Proposta personalizada</p>
                          </>
                        )}
                      </div>

                      <ul className="space-y-2.5 mb-6">
                        {plan.features.map((f, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" weight="fill" />
                            <span className="text-foreground/90">{f}</span>
                          </li>
                        ))}
                      </ul>

                      <Button asChild className={`w-full font-bold ${plan.highlight ? "" : ""}`} variant={plan.highlight ? "default" : "outline"}>
                        <a href="#solicitar-proposta">{plan.price ? "Solicitar proposta" : "Falar com vendas"}</a>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CASOS DE EMPRESAS */}
      <section className="py-12 md:py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-3 py-1 rounded-full mb-4">
              <Quotes className="w-3.5 h-3.5" weight="fill" /> CASOS REAIS
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-3 tracking-tight">
              Empresas que economizam com a gente
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Veja como times de todos os tamanhos transformaram a saúde corporativa.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {cases.map((c, i) => (
              <motion.div
                key={c.company}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full relative overflow-hidden border-2 hover:shadow-xl transition-all bg-gradient-to-br ${c.color}`}>
                  <CardContent className="p-6 md:p-7">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-card border-2 border-border flex items-center justify-center font-extrabold text-foreground shadow-sm">
                        {c.logo}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base">{c.company}</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">{c.employees}</p>
                      </div>
                    </div>

                    <div className="bg-card rounded-xl p-3 mb-4 border border-border/50">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Economia anual</p>
                      <p className="text-xl font-extrabold text-emerald-600">{c.saved}</p>
                    </div>

                    <Quotes className="w-6 h-6 text-primary/30 mb-2" weight="fill" />
                    <p className="text-sm text-foreground/85 leading-relaxed mb-4">"{c.text}"</p>
                    <p className="text-xs font-semibold text-foreground/70 pt-3 border-t border-border/40">{c.author}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* O que está incluso */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-6xl mx-auto bg-card rounded-3xl border border-border/40 p-6 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
                <Users className="w-3.5 h-3.5" weight="fill" />
                Para todos os colaboradores
              </span>
              <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-3 tracking-tight">
                O que está incluso
              </h2>
              <p className="text-muted-foreground mb-4 max-w-md">
                Pacote completo de saúde digital para sua equipe e dependentes, sem letras miúdas.
              </p>
              <Button asChild size="lg" className="font-bold">
                <a href="#solicitar-proposta">
                  Quero conhecer
                  <ArrowRight className="w-5 h-5 ml-2" weight="bold" />
                </a>
              </Button>
            </div>

            <ul className="space-y-3">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm md:text-base text-foreground">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" weight="fill" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Formulário de proposta */}
      <section id="solicitar-proposta" className="py-12 md:py-20 px-4 scroll-mt-24">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-primary/5 via-card to-secondary/5 rounded-3xl border border-primary/15 p-6 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div>
              <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-3 tracking-tight">
                Solicitar proposta
              </h2>
              <p className="text-muted-foreground mb-6">
                Conte um pouco sobre sua empresa e nosso time entra em contato em até 1 dia útil
                com uma proposta personalizada.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" weight="fill" />
                  Sem compromisso e sem custo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" weight="fill" />
                  Atendimento por consultor especializado
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" weight="fill" />
                  Implantação em até 7 dias
                </li>
              </ul>
            </div>

            {submitted ? (
              <div className="bg-card rounded-2xl border border-border/40 p-6 text-center">
                <CheckCircle className="w-14 h-14 text-emerald-600 mx-auto mb-3" weight="fill" />
                <h3 className="text-xl font-bold text-foreground mb-2">Recebemos seu contato!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Nosso time entrará em contato em até 1 dia útil.
                </p>
                <Button onClick={() => setSubmitted(false)} variant="outline">
                  Enviar outro
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border/40 p-6 space-y-4">
                <div>
                  <Label htmlFor="company_name">Nome da empresa *</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                    maxLength={200}
                    className="mt-1.5"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contact_name">Seu nome *</Label>
                    <Input
                      id="contact_name"
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                      required
                      maxLength={200}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      required
                      maxLength={20}
                      placeholder="(11) 99999-9999"
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">E-mail corporativo *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    maxLength={255}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="message">Conte sobre sua necessidade</Label>
                  <Textarea
                    id="message"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    maxLength={2000}
                    rows={3}
                    placeholder="Quantos colaboradores, qual benefício atual, etc."
                    className="mt-1.5 resize-none"
                  />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="w-full font-bold">
                  {submitting ? "Enviando..." : "Solicitar proposta"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Ao enviar, você aceita nossa{" "}
                  <Link to="/privacy" className="underline hover:text-primary">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default ParaEmpresas;
