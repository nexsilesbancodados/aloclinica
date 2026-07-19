import { lazy, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Star, ChatsCircle, ArrowRight, Quotes, MagnifyingGlass } from "@phosphor-icons/react";
import Header from "@/components/landing/Header";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Footer = lazy(() => import("@/components/landing/Footer"));

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true } as const,
};

type Testimonial = {
  name: string;
  city: string;
  text: string;
  stars: number;
  category: "Telemedicina" | "Especialidade" | "Suporte";
};

const testimonials: Testimonial[] = [
  { name: "Maria Fernanda", city: "São Paulo, SP", text: "Consultar pela AloClínica mudou minha vida. Recebi atendimento excelente sem precisar sair de casa.", stars: 5, category: "Telemedicina" },
  { name: "João Carlos", city: "Recife, PE", text: "Moro no interior e finalmente consegui consultar com um especialista. A receita digital funcionou perfeitamente.", stars: 5, category: "Telemedicina" },
  { name: "Ana Beatriz", city: "Belo Horizonte, MG", text: "Atendimento rápido, médico atencioso e a plataforma é super fácil de usar. Nota 10!", stars: 5, category: "Especialidade" },
  { name: "Roberto Lima", city: "Curitiba, PR", text: "Agendei em poucos minutos e fui atendido na hora marcada. Profissionalismo do começo ao fim.", stars: 5, category: "Telemedicina" },
  { name: "Fernanda Souza", city: "Salvador, BA", text: "Adoro a praticidade. Tenho meu prontuário sempre à mão e o suporte é muito atencioso.", stars: 5, category: "Suporte" },
  { name: "Lucas Almeida", city: "Porto Alegre, RS", text: "Receita digital aceita na farmácia sem nenhum problema. Recomendo demais.", stars: 5, category: "Telemedicina" },
  { name: "Eduardo Tavares", city: "Florianópolis, SC", text: "Consulta com cardiologista que demoraria 3 meses pelo SUS. Aqui foi no mesmo dia.", stars: 4, category: "Especialidade" },
  { name: "Julia Martins", city: "Goiânia, GO", text: "O suporte resolveu meu problema em 5 minutos pelo chat. Surpreendente.", stars: 5, category: "Suporte" },
];

const categories = ["Todas", "Telemedicina", "Especialidade", "Suporte"] as const;

const Depoimentos = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Todas");
  const [minStars, setMinStars] = useState<number>(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return testimonials.filter((t) => {
      const okSearch = !term || t.name.toLowerCase().includes(term) || t.text.toLowerCase().includes(term) || t.city.toLowerCase().includes(term);
      const okCat = category === "Todas" || t.category === category;
      const okStars = t.stars >= minStars;
      return okSearch && okCat && okStars;
    });
  }, [search, category, minStars]);

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title="Depoimentos | AloClínica"
        description="O que nossos pacientes dizem sobre a experiência de cuidar da saúde com a AloClínica."
        canonical="https://aloclinica.com.br/sobre/depoimentos"
      />
      <Header />

      {/* HERO */}
      <section className="pt-32 pb-12 md:pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full mb-5">
              <ChatsCircle className="w-3.5 h-3.5" weight="fill" /> Depoimentos
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold leading-[1.08] mb-5">
              Quem usa, <span className="text-gradient">recomenda</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              São milhares de brasileiros transformando a forma de cuidar da saúde. Veja o que eles têm a dizer.
            </p>

            <div className="flex items-center justify-center gap-2 mt-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-5 h-5 text-amber-400" weight="fill" />
              ))}
              <span className="font-bold text-foreground ml-2">4.9</span>
              <span className="text-muted-foreground text-sm">(2.000+ avaliações)</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FILTROS */}
      <section className="px-4 mb-8">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid lg:grid-cols-[1.5fr_2fr_1fr] gap-4 items-center">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" weight="bold" />
              <Input
                placeholder="Buscar nome, cidade ou trecho..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`text-xs font-bold px-3.5 py-2 rounded-full border transition-all ${
                    category === c
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 justify-start lg:justify-end">
              {[0, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinStars(n)}
                  className={`text-[11px] font-bold px-2.5 py-2 rounded-lg border transition-all flex items-center gap-1 ${
                    minStars === n
                      ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/40"
                      : "bg-background text-muted-foreground border-border hover:border-amber-400/60"
                  }`}
                >
                  {n === 0 ? "Todas" : <>{n}+ <Star className="w-3 h-3" weight="fill" /></>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* GRID DE DEPOIMENTOS */}
      <section className="pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-muted-foreground text-center mb-6">
            Exibindo <span className="font-semibold text-foreground">{filtered.length}</span> depoimento{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((t, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ delay: i * 0.06 }}
                className="relative p-6 rounded-2xl border border-border bg-card hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg transition-all"
              >
                <Quotes className="absolute top-5 right-5 w-7 h-7 text-primary/15" weight="fill" />
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-3">
                  {t.category}
                </span>
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <Star key={si} className="w-4 h-4 text-amber-400" weight="fill" />
                  ))}
                  {Array.from({ length: 5 - t.stars }).map((_, si) => (
                    <Star key={`o-${si}`} className="w-4 h-4 text-muted-foreground/25" weight="fill" />
                  ))}
                </div>
                <p className="text-foreground mb-5 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-border/60">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{t.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.city}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Nenhum depoimento encontrado com os filtros atuais.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setCategory("Todas");
                  setMinStars(0);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { metric: "100k+", label: "Pacientes" },
            { metric: "500+", label: "Médicos" },
            { metric: "30+", label: "Especialidades" },
            { metric: "4.9★", label: "Satisfação" },
          ].map((item, i) => (
            <motion.div key={i} {...fadeUp} transition={{ delay: i * 0.08 }} className="p-4">
              <div className="text-3xl sm:text-4xl font-extrabold text-primary mb-1">{item.metric}</div>
              <p className="text-sm text-muted-foreground">{item.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp} className="relative rounded-3xl overflow-hidden bg-gradient-hero p-10 sm:p-14 text-center shadow-elevated">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary-foreground)/0.22),transparent_38%)]" />
            <div className="relative z-10">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-primary-foreground mb-3">
                Faça parte dessa história
              </h3>
              <p className="text-primary-foreground/85 max-w-xl mx-auto mb-6">
                Sua próxima consulta pode ser agora mesmo.
              </p>
              <Button size="lg" className="bg-background text-primary hover:bg-background/95 rounded-2xl px-8 gap-2 font-extrabold" onClick={() => navigate("/agendar")}>
                Agendar Consulta <ArrowRight className="w-5 h-5" weight="bold" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Depoimentos;
