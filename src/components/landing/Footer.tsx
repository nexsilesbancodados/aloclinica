import { useState, forwardRef, memo } from "react";
import { db } from "@/integrations/supabase/untyped";
import { Envelope, Phone, InstagramLogo, LinkedinLogo, YoutubeLogo, Heart, ShieldCheck, Lock, SealCheck, PaperPlaneTilt, FacebookLogo, TwitterLogo, MapPin, CreditCard, Stethoscope, Buildings, Question, FirstAidKit, ArrowRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PINGO_LOGO_URL } from "@/lib/constants";
import { isFeatureEnabled } from "@/lib/featureFlags";
const logo = PINGO_LOGO_URL;

const Footer = memo(forwardRef<HTMLElement, { config?: any }>(({ config }, ref) => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const siteName    = config?.site_name || "AloClínica";
  const copyright   = config?.copyright || `© ${new Date().getFullYear()} AloClínica. Todos os direitos reservados.`;
  const footerTag   = config?.footer_tagline || "Telemedicina segura e acessível para todo o Brasil.";
  const contactEmail = config?.contact_email || "contato@aloclinica.com.br";
  const contactPhone = config?.contact_phone || "0800 123 4567";
  
  const socialLinksConfig = config?.social_links || [];
  
  const getSocialIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("instagram")) return InstagramLogo;
    if (p.includes("facebook")) return FacebookLogo;
    if (p.includes("twitter")) return TwitterLogo;
    if (p.includes("linkedin")) return LinkedinLogo;
    if (p.includes("youtube")) return YoutubeLogo;
    return InstagramLogo;
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await db.from("newsletter_subscribers").insert({ email: email.trim().toLowerCase() });
      if (error) {
        if (error.code === "23505") toast.info("Você já está inscrito! 📬");
        else toast.error("Erro ao inscrever.");
      } else {
        toast.success("Inscrito com sucesso! 🎉");
      }
      setEmail("");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer ref={ref} aria-label="Rodapé" className="relative bg-[hsl(215_45%_10%)] text-white overflow-hidden">
      {/* Glow ambient */}
      <div className="absolute inset-0 pointer-events-none opacity-50">
        <div className="absolute -top-40 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* Newsletter banner — destaque no topo */}
      <div className="relative border-b border-white/[0.06]">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28 py-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-md">
              <h3 className="text-xl lg:text-2xl font-extrabold text-white mb-1.5 tracking-tight">
                Receba dicas de saúde 💙
              </h3>
              <p className="text-sm text-white/50 leading-relaxed">
                Conteúdos exclusivos, novidades e ofertas — direto no seu e-mail.
              </p>
            </div>
            <form onSubmit={handleNewsletter} className="flex gap-2 w-full lg:w-auto lg:min-w-[420px]">
              <Input
                type="email"
                placeholder="Seu melhor e-mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 rounded-full h-12 px-5 text-sm focus-visible:ring-primary/40 focus-visible:border-primary/40"
                required
              />
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-full h-12 px-5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold shadow-lg shadow-primary/20 gap-2 shrink-0"
              >
                <span className="hidden sm:inline">Inscrever</span>
                <ArrowRight className="w-4 h-4" weight="bold" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Main grid — 4 colunas */}
      <div className="relative max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28 py-12 lg:py-16">
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-4">
            <Link to="/" className="flex items-center gap-2.5 mb-4 group">
              <img src={logo} alt={siteName} className="w-10 h-10 rounded-2xl group-hover:scale-105 transition-transform" width={40} height={40} />
              <span className="font-extrabold text-lg text-white tracking-tight">
                Alo<span className="text-primary">Clínica</span>
              </span>
            </Link>
            <p className="text-sm text-white/50 leading-relaxed mb-5 max-w-xs">{footerTag}</p>

            {/* Contato direto */}
            <ul className="space-y-2.5 mb-6">
              <li>
                <a href={`mailto:${contactEmail}`} className="flex items-center gap-2.5 text-xs text-white/60 hover:text-white transition-colors group">
                  <span className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Envelope className="w-3.5 h-3.5" weight="fill" />
                  </span>
                  {contactEmail}
                </a>
              </li>
              <li>
                <a href={`tel:${contactPhone}`} className="flex items-center gap-2.5 text-xs text-white/60 hover:text-white transition-colors group">
                  <span className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Phone className="w-3.5 h-3.5" weight="fill" />
                  </span>
                  {contactPhone}
                </a>
              </li>
              <li className="flex items-center gap-2.5 text-xs text-white/60">
                <span className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5" weight="fill" />
                </span>
                Brasil — Atendimento 100% online
              </li>
            </ul>

            {/* Social */}
            {socialLinksConfig.length > 0 && (
              <div className="flex gap-2">
                {socialLinksConfig.map((s: any, idx: number) => {
                  const Icon = getSocialIcon(s.platform || "");
                  return (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.platform}
                      className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-primary border border-white/[0.06] flex items-center justify-center transition-all text-white/60 hover:text-white hover:-translate-y-0.5"
                    >
                      <Icon className="w-4 h-4" weight="fill" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Empresa */}
          <div className="lg:col-span-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Empresa</h4>
            <ul className="space-y-3 text-sm text-white/60">
              <li><Link to="/sobre/quem-somos" className="hover:text-primary transition-colors">Quem somos</Link></li>
              <li><Link to="/sobre/porque-nos" className="hover:text-primary transition-colors">Porque nós</Link></li>
              <li><Link to="/sobre/depoimentos" className="hover:text-primary transition-colors">Depoimentos</Link></li>
              <li><Link to="/contato" className="hover:text-primary transition-colors">Fale conosco</Link></li>
            </ul>
          </div>

          {/* Serviços */}
          <div className="lg:col-span-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Serviços</h4>
            <ul className="space-y-3 text-sm text-white/60">
              {isFeatureEnabled("cartao_pingo") && (
                <li><Link to="/pingo-card" className="hover:text-primary transition-colors flex items-center gap-2"><CreditCard className="w-3.5 h-3.5 text-amber-400" weight="fill" /> Pingo Card</Link></li>
              )}
              <li><Link to="/para-empresas" className="hover:text-primary transition-colors flex items-center gap-2"><Buildings className="w-3.5 h-3.5 text-indigo-400" weight="fill" /> Saúde Corporativa</Link></li>
              <li><Link to="/para-profissionais" className="hover:text-primary transition-colors flex items-center gap-2"><Stethoscope className="w-3.5 h-3.5 text-rose-400" weight="fill" /> Para Médicos</Link></li>
              <li><Link to="/especialidades" className="hover:text-primary transition-colors flex items-center gap-2"><FirstAidKit className="w-3.5 h-3.5 text-emerald-400" weight="fill" /> Especialidades</Link></li>
            </ul>
          </div>

          {/* Suporte / Legal */}
          <div className="lg:col-span-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Suporte & Legal</h4>
            <ul className="space-y-3 text-sm text-white/60">
              <li><Link to="/ajuda" className="hover:text-primary transition-colors flex items-center gap-2"><Question className="w-3.5 h-3.5 text-teal-400" weight="fill" /> Central de Ajuda</Link></li>
              <li><Link to="/termos" className="hover:text-primary transition-colors">Termos de Uso</Link></li>
              <li><Link to="/privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link></li>
              <li><Link to="/lgpd" className="hover:text-primary transition-colors">LGPD</Link></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Selos / Trust badges */}
      <div className="relative border-t border-white/[0.06]">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/40 font-medium">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" weight="fill" /> Certificado CFM</span>
            <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-sky-400" weight="fill" /> LGPD Compliance</span>
            <span className="flex items-center gap-1.5"><SealCheck className="w-4 h-4 text-violet-400" weight="fill" /> SSL 256-bit</span>
            <span className="flex items-center gap-1.5"><Heart className="w-4 h-4 text-rose-400" weight="fill" /> Telemedicina ANS</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/30">
            Pagamentos:
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-bold tracking-wider">PIX</span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-bold tracking-wider">VISA</span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-bold tracking-wider">MASTER</span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-bold tracking-wider">ELO</span>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="relative border-t border-white/[0.05] py-5">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-28 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-[11px] text-white/30 flex items-center gap-1.5 text-center sm:text-left">
            {copyright}
          </p>
          <p className="text-[11px] text-white/30 flex items-center gap-1.5">
            Feito com <Heart className="w-3 h-3 text-rose-400" weight="fill" /> no Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}));

Footer.displayName = "Footer";
export default Footer;
