import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { securityMonitor } from "@/lib/security-monitor";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Lock, Stethoscope, KeyRound, Check, MessageCircle, LogIn, Eye, EyeOff,
  Shield, Star, Sparkles, Award, Video, FileText, Users, ChevronRight, ArrowRight,
  Calendar, DollarSign, BarChart3, Globe, Zap, HelpCircle, CheckCircle2, Smartphone,
  Camera, Upload, ImagePlus
} from "lucide-react";
import TermsConsentCheckbox from "@/components/auth/TermsConsentCheckbox";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { registerConsent } from "@/lib/consent";
import SEOHead from "@/components/SEOHead";
import PasswordStrength from "@/components/ui/password-strength";
import Header from "@/components/landing/Header";
import { translateAuthError } from "@/lib/authErrors";
import { lazy, Suspense } from "react";
import heroMedicos1 from "@/assets/hero-medicos.png";
import heroMedicos2 from "@/assets/hero-medicos-2.png";
import heroMedicos3 from "@/assets/hero-medicos-3.png";
import mascotWave from "@/assets/mascot-wave.png";
import bannerMedicoCta from "@/assets/banner-medico-cta.jpg";

const Footer = lazy(() => import("@/components/landing/Footer"));

const medicoHeroImages = [heroMedicos1, heroMedicos2, heroMedicos3];

const HeroCarousel = ({ images, alt }: { images: string[]; alt: string }) => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCurrent(prev => (prev + 1) % images.length), 5000);
    return () => clearInterval(timer);
  }, [images.length]);
  return (
    <>
      {images.map((img, i) => (
        <motion.img key={i} src={img} alt={`${alt} ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" initial={false} animate={{ opacity: i === current ? 1 : 0, scale: i === current ? 1.05 : 1 }} transition={{ opacity: { duration: 1 }, scale: { duration: 6 } }} />
      ))}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
        {images.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${i === current ? "bg-white w-8" : "bg-white/40 hover:bg-white/60"}`} />
        ))}
      </div>
    </>
  );
};

type Step = "welcome" | "code" | "register" | "login" | "quiz" | "apply" | "applied";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const fadeUpForm = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const landingBenefits = [
  { icon: Video, title: "Teleconsulta HD", desc: "Atenda de qualquer lugar com vídeo criptografado.", gradient: "from-primary to-primary/70" },
  { icon: FileText, title: "Receita Digital Legal", desc: "Receitas e atestados com assinatura digital válida.", gradient: "from-secondary to-secondary/70" },
  { icon: Calendar, title: "Agenda Inteligente", desc: "Gestão completa com confirmação automática.", gradient: "from-warning to-warning/70" },
  { icon: Users, title: "Prontuário Eletrônico", desc: "Histórico completo dos pacientes em um só lugar.", gradient: "from-destructive to-destructive/70" },
  { icon: DollarSign, title: "Receba na Hora", desc: "Pagamentos diretos. Você define seu preço.", gradient: "from-success to-success/70" },
  { icon: Shield, title: "Verificação CFM", desc: "Selo de médico verificado para credibilidade.", gradient: "from-primary to-secondary" },
];

const howItWorks = [
  { step: "01", title: "Solicite seu cadastro", desc: "Preencha o formulário com seus dados e CRM. Nossa equipe analisará sua solicitação.", icon: <FileText className="w-6 h-6 text-white" />, gradient: "from-primary to-primary/70" },
  { step: "02", title: "Aprovação por email", desc: "Você receberá um código de acesso por email após aprovação.", icon: <Mail className="w-6 h-6 text-white" />, gradient: "from-warning to-warning/70" },
  { step: "03", title: "Comece a atender", desc: "Use o código para criar sua conta e atenda por vídeo.", icon: <Video className="w-6 h-6 text-white" />, gradient: "from-secondary to-secondary/70" },
];

const features = [
  "Defina seus próprios preços por consulta",
  "Atenda pacientes de todo o Brasil",
  "Perfil público com avaliações verificadas",
  "Plantão digital — ative e receba pacientes na hora",
  "Inteligência Artificial para suporte clínico",
  "Relatórios financeiros detalhados",
  "Suporte técnico prioritário 24/7",
  "Sem mensalidade — ganhe por consulta",
];

const faqItems = [
  { question: "Como funciona o cadastro?", answer: "Preencha o formulário de solicitação. Nossa equipe verifica seus dados e CRM. Se aprovado, você recebe um código de acesso por email." },
  { question: "Como funciona o pagamento?", answer: "Você define o preço. O paciente paga pela plataforma e o valor é repassado diretamente para você." },
  { question: "A receita digital tem validade legal?", answer: "Sim. Nossas receitas seguem as normas do CFM com assinatura digital válida em todo Brasil." },
  { question: "Posso usar junto com meu consultório presencial?", answer: "Claro! Muitos médicos usam como complemento, ampliando alcance para pacientes de outras regiões." },
];

const PREDEFINED_SPECIALTIES = [
  "Acupuntura", "Alergia e Imunologia", "Anestesiologia", "Angiologia", "Cancerologia",
  "Cardiologia", "Cirurgia Cardiovascular", "Cirurgia da Mão", "Cirurgia de Cabeça e Pescoço",
  "Cirurgia do Aparelho Digestivo", "Cirurgia Geral", "Cirurgia Pediátrica", "Cirurgia Plástica",
  "Cirurgia Torácica", "Cirurgia Vascular", "Clínico Geral", "Coloproctologia",
  "Dermatologia", "Endocrinologia", "Endoscopia", "Gastroenterologia",
  "Genética Médica", "Geriatria", "Ginecologia e Obstetrícia", "Hematologia",
  "Homeopatia", "Infectologia", "Mastologia", "Medicina de Família e Comunidade",
  "Medicina do Esporte", "Medicina do Trabalho", "Medicina Intensiva",
  "Medicina Legal", "Medicina Nuclear", "Nefrologia", "Neurocirurgia",
  "Neurologia", "Nutrologia", "Oncologia Clínica", "Ortopedia e Traumatologia",
  "Otorrinolaringologia", "Patologia", "Pediatria", "Pneumologia", "Psiquiatria",
  "Radiologia", "Radioterapia", "Reumatologia", "Urologia",
];

const PREDEFINED_CARE_AREAS = [
  "Infecção Urinária", "Dor de Cabeça", "Dor nas Costas", "Ansiedade", "Depressão",
  "Insônia", "Hipertensão", "Diabetes", "Asma", "Bronquite", "Rinite Alérgica",
  "Sinusite", "Gripe e Resfriado", "Dor de Garganta", "Infecção de Ouvido",
  "Dor Abdominal", "Gastrite", "Refluxo", "Enxaqueca", "Obesidade",
  "Colesterol Alto", "Anemia", "Tireoide", "Dermatite", "Acne",
  "Queda de Cabelo", "Cistite", "Candidíase", "TPM", "Menopausa",
  "Dor no Peito", "Palpitações", "Falta de Ar", "Tontura", "Dor Articular",
  "Tendinite", "Lombalgia", "Fibromialgia", "Alergia Alimentar", "Conjuntivite",
];


const AuthMedico = () => {
  const [searchParams] = useSearchParams();
  const hasLoginAccess = true; // Login always accessible
  const [step, setStep] = useState<Step>(searchParams.get("acesso") === "entrar" ? "welcome" : "quiz");
  const [inviteCode, setInviteCode] = useState("");
  const [validatedCodeId, setValidatedCodeId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [email, setEmail] = useState(() => {
    const p = searchParams.get("email");
    return p && p.includes("@") ? p : "";
  });
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [crm, setCrm] = useState("");
  const [crmState, setCrmState] = useState("SP");
  const [phone, setPhone] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [showSpecialtyDropdown, setShowSpecialtyDropdown] = useState(false);
  const specialtyInputRef = useRef<HTMLInputElement>(null);
  const [selectedCareAreas, setSelectedCareAreas] = useState<string[]>([]);
  const [careAreaSearch, setCareAreaSearch] = useState("");
  const [showCareAreaDropdown, setShowCareAreaDropdown] = useState(false);
  const careAreaInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [experienceYears, setExperienceYears] = useState("");
  const [consultationType, setConsultationType] = useState("");
  const [howFound, setHowFound] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const navigate = useNavigate();
  
  const formRef = useRef<HTMLDivElement>(null);

  const filteredSpecialties = useMemo(() => {
    if (!specialtySearch.trim()) return PREDEFINED_SPECIALTIES.filter(s => !selectedSpecialties.includes(s));
    const q = specialtySearch.toLowerCase().trim();
    return PREDEFINED_SPECIALTIES.filter(s => s.toLowerCase().includes(q) && !selectedSpecialties.includes(s));
  }, [specialtySearch, selectedSpecialties]);

  const addSpecialty = (s: string) => {
    const trimmed = s.trim();
    if (trimmed && !selectedSpecialties.includes(trimmed)) {
      setSelectedSpecialties(prev => [...prev, trimmed]);
    }
    setSpecialtySearch("");
    setShowSpecialtyDropdown(false);
  };

  const removeSpecialty = (s: string) => setSelectedSpecialties(prev => prev.filter(x => x !== s));

  const filteredCareAreas = useMemo(() => {
    if (!careAreaSearch.trim()) return PREDEFINED_CARE_AREAS.filter(s => !selectedCareAreas.includes(s));
    const q = careAreaSearch.toLowerCase().trim();
    return PREDEFINED_CARE_AREAS.filter(s => s.toLowerCase().includes(q) && !selectedCareAreas.includes(s));
  }, [careAreaSearch, selectedCareAreas]);

  const addCareArea = (s: string) => {
    const trimmed = s.trim();
    if (trimmed && !selectedCareAreas.includes(trimmed)) {
      setSelectedCareAreas(prev => [...prev, trimmed]);
    }
    setCareAreaSearch("");
    setShowCareAreaDropdown(false);
  };

  const removeCareArea = (s: string) => setSelectedCareAreas(prev => prev.filter(x => x !== s));

  const handleSpecialtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && specialtySearch.trim()) {
      e.preventDefault();
      addSpecialty(specialtySearch);
    }
  };

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth" });


  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApplication(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const enrichedBio = [
        bio && `Sobre: ${bio}`,
        experienceYears && `Experiência: ${experienceYears} anos`,
        consultationType && `Tipo de atendimento: ${consultationType}`,
        howFound && `Como conheceu: ${howFound}`,
      ].filter(Boolean).join("\n");
      const { error } = await db.from("doctor_applications" as any).insert({
        full_name: fullName,
        email,
        phone: phone || null,
        crm,
        crm_state: crmState,
        specialty: selectedSpecialties.join(", ") || null,
        bio: enrichedBio || null,
      } as any);
      if (error) throw error;
      setStep("applied");
      toast.success("Solicitação enviada!", { description: "Analisaremos seus dados e retornaremos por email." });
    } catch (err: unknown) {
      toast.error("Erro ao enviar", { description: err instanceof Error ? err.message : "Tente novamente." });
    }
    setSubmittingApplication(false);
  };

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidating(true);
    try {
      const res = await db.functions.invoke("validate-invite-code", { body: { code: inviteCode.trim().toUpperCase() } });
      if (res.data?.valid) {
        setValidatedCodeId(res.data.code_id);
        setStep("register");
        toast.success("Código válido!", { description: "Preencha seus dados para criar sua conta." });
      } else {
        toast.error("Código inválido", { description: res.data?.error || "Verifique e tente novamente." });
      }
    } catch {
      toast.error("Erro", { description: "Não foi possível validar o código." });
    }
    setValidating(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (securityMonitor.isLoginBlocked(email)) {
      toast.error("Conta temporariamente bloqueada", { description: "Muitas tentativas. Aguarde 15 minutos." });
      return;
    }
    setLoading(true);
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      securityMonitor.trackFailedLogin(email);
      toast.error("Erro ao entrar", { description: translateAuthError(error.message) });
      return;
    }
    securityMonitor.clearFailedLogins(email);

    if (data.user) {
      let { data: doctorProfile } = await db
        .from("doctor_profiles")
        .select("id, is_approved, crm_verified")
        .eq("user_id", data.user.id)
        .maybeSingle();

      // Se o usuário tem papel doctor mas o perfil não existe (falha no signup),
      // cria um perfil aprovado on-the-fly para não travar o login.
      if (!doctorProfile) {
        const { data: roles } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);
        const hasDoctorRole = (roles ?? []).some((r: { role: string }) => r.role === "doctor");
        if (hasDoctorRole) {
          const { data: created } = await db
            .from("doctor_profiles")
            .insert({ user_id: data.user.id, is_approved: true })
            .select("id, is_approved, crm_verified")
            .maybeSingle();
          doctorProfile = created ?? null;
        }
      }

      if (!doctorProfile) {
        await db.auth.signOut();
        toast.error("Cadastro não encontrado", { description: "Seu perfil de médico não foi localizado. Solicite o cadastro primeiro." });
        setStep("quiz");
        return;
      }

      if (!doctorProfile.is_approved) {
        await db.auth.signOut();
        toast.error("Cadastro em análise", { description: "Seu cadastro está sendo analisado. Você receberá o código de acesso por email quando aprovado." });
        return;
      }

      navigate("/dashboard?role=doctor");
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo muito grande", { description: "Máximo 5 MB" }); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) { toast.error("Aceite os termos"); return; }
    if (!photoFile) { toast.error("Foto obrigatória", { description: "Adicione uma foto profissional para seu perfil público." }); return; }
    setLoading(true);
    const { data, error } = await db.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        // role lido pelo trigger handle_new_user para popular user_roles
        // assign-role abaixo lida com doctor_profiles + invite code
        data: { role: "doctor", first_name: firstName, last_name: lastName },
      },
    });
    if (error) { setLoading(false); toast.error("Erro no cadastro", { description: translateAuthError(error.message) }); return; }
    if (data.user) {
      // Upload photo
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${data.user.id}/avatar.${ext}`;
      const { error: uploadErr } = await db.storage.from("avatars").upload(path, photoFile, { upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = db.storage.from("avatars").getPublicUrl(path);
        await db.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", data.user.id);
      }

      await db.functions.invoke("assign-role", { body: { user_id: data.user.id, role: "doctor", profile_data: { crm, crm_state: crmState, invite_code_id: validatedCodeId } } });
      await registerConsent(data.user.id, "terms_and_privacy_doctor");
      db.functions.invoke("send-email", { body: { type: "welcome_doctor", to: email, data: { name: `${firstName} ${lastName}`, crm: `${crm}/${crmState}` } } }).catch(() => {});

      // Save display name and care areas
      const { data: docProfile } = await db.from("doctor_profiles").select("id").eq("user_id", data.user.id).maybeSingle();
      if (docProfile) {
        if (displayName.trim()) {
          await db.from("doctor_profiles").update({ display_name: displayName.trim() } as any).eq("id", docProfile.id);
        }
        if (selectedCareAreas.length > 0) {
          await db.from("doctor_care_areas" as any).insert(
            selectedCareAreas.map(area => ({ doctor_id: docProfile.id, area_name: area }))
          );
        }
      }
    }
    setLoading(false);
    toast.success("Cadastro realizado!", { description: "Aguarde a aprovação do seu CRM." });
    navigate("/dashboard?role=doctor");
  };

  return (
    <>
      <SEOHead title="Sou Médico — Atenda Online | AloClinica" description="Cadastre-se como médico na AloClinica. Atenda por teleconsulta, emita receitas digitais e amplie sua base de pacientes." />
      <div className="min-h-screen relative">
        <div className="fixed inset-0 -z-10 bg-gradient-to-br from-[hsl(175,50%,97%)] via-[hsl(185,42%,93%)] to-[hsl(195,38%,87%)] dark:from-[hsl(175,25%,7%)] dark:via-[hsl(185,20%,9%)] dark:to-[hsl(195,18%,11%)]" />
        <Header />

        {/* Hero */}
        <section className="relative overflow-hidden mt-[70px]" style={{ minHeight: "55vh" }}>
          <HeroCarousel images={medicoHeroImages} alt="Médico AloClínica" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="container mx-auto px-4 relative flex items-end pb-12" style={{ minHeight: "55vh" }}>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-xl">
              <Badge className="mb-3 text-xs px-4 py-1 bg-white/15 text-white border-white/20 backdrop-blur-sm">
                <Stethoscope className="w-3 h-3 mr-1" /> Para Médicos
              </Badge>
              <h1 className="text-3xl md:text-5xl font-black text-white mb-3 tracking-tight leading-tight">
                Atenda pacientes<br /><span className="text-white/85">de todo o Brasil</span>
              </h1>
              <p className="text-sm text-white/70 max-w-lg mb-6 leading-relaxed">
                Amplie sua base de pacientes, defina seus preços e atenda por videochamada. Sem mensalidade.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="default" className="bg-white text-primary hover:bg-white/90 rounded-2xl px-8 font-bold shadow-2xl" onClick={scrollToForm}>
                  Cadastrar como Médico <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button size="default" variant="ghost" className="text-white border border-white/30 hover:bg-white/10 rounded-2xl px-6 font-semibold" onClick={() => { setStep("login"); scrollToForm(); }}>
                  <LogIn className="w-4 h-4 mr-2" /> Já sou cadastrado
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-6">
                {[
                  { icon: <Shield className="w-3.5 h-3.5" />, label: "CFM Verificado" },
                  { icon: <Award className="w-3.5 h-3.5" />, label: "Selo Confiança" },
                  { icon: <Globe className="w-3.5 h-3.5" />, label: "30+ Especialidades" },
                  { icon: <Zap className="w-3.5 h-3.5" />, label: "Sem Mensalidade" },
                ].map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-white/50 text-xs font-medium">{item.icon} {item.label}</span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.div variants={fadeUp} className="text-center mb-14">
                <Badge variant="outline" className="mb-3 text-sm px-4 py-1 rounded-full"><Zap className="w-3.5 h-3.5 mr-1.5" /> Vantagens</Badge>
                <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">Tudo que você precisa para atender online</h2>
              </motion.div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {landingBenefits.map((b, i) => (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="h-full border-border/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                      <CardContent className="p-6">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${b.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                          <b.icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="font-bold text-foreground text-lg mb-1.5">{b.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 max-w-4xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.div variants={fadeUp} className="text-center mb-14 relative">
                <Badge variant="outline" className="mb-3 text-sm px-4 py-1 rounded-full"><HelpCircle className="w-3.5 h-3.5 mr-1.5" /> Passo a passo</Badge>
                <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">Como funciona?</h2>
                <motion.img src={mascotWave} alt="Pingo" className="absolute -right-2 sm:right-4 -bottom-6 w-14 sm:w-18 object-contain drop-shadow-lg" initial={{ opacity: 0, scale: 0.5 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, type: "spring", stiffness: 200 }} />
              </motion.div>
              <div className="grid md:grid-cols-3 gap-5">
                {howItWorks.map((item, i) => (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="h-full border-border/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>{item.icon}</div>
                          <span className="text-3xl font-black text-muted-foreground/20">{item.step}</span>
                        </div>
                        <h3 className="font-bold text-foreground text-lg mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ==================== AUTH FORM SECTION ==================== */}
        <section ref={formRef} id="cadastro" className="py-20">
          <div className="container mx-auto px-4 max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Stethoscope className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Portal do Médico</h2>
              <p className="text-muted-foreground mt-1">{hasLoginAccess ? "Acesse sua conta ou cadastre-se" : step === "quiz" ? "Conte-nos sobre sua atuação" : "Solicite seu cadastro na plataforma"}</p>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="bg-card border border-border rounded-2xl p-6 shadow-lg">
                {/* Welcome */}
                {step === "welcome" && hasLoginAccess && (
                  <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
                    {[
                      { icon: LogIn, label: "Entrar na minha conta", desc: "Acesse seu painel de atendimento", action: () => setStep("login"), variant: "primary" as const },
                      { icon: KeyRound, label: "Já tenho código de acesso", desc: "Recebi o código por email", action: () => setStep("code"), variant: "outline" as const },
                      { icon: Stethoscope, label: "Quero me cadastrar", desc: "Solicite acesso preenchendo seus dados", action: () => setStep("quiz"), variant: "outline" as const },
                      { icon: MessageCircle, label: "Dúvidas? Fale pelo WhatsApp", desc: "Fale com nossa equipe", action: () => window.open("https://wa.me/5511999999999?text=Olá! Sou médico e gostaria de me cadastrar na plataforma AloClinica.", "_blank"), variant: "ghost" as const },
                    ].map(({ icon: Icon, label, desc, action, variant }) => (
                      <motion.div key={label} variants={fadeUpForm}>
                        <Button className={`w-full h-auto py-4 px-5 justify-start text-left ${variant === "primary" ? "bg-gradient-to-r from-secondary to-primary text-primary-foreground shadow-lg shadow-primary/20" : ""}`} variant={variant === "primary" ? "default" : variant} size="lg" onClick={action}>
                          <div className="flex items-center gap-3 w-full">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${variant === "primary" ? "bg-white/20" : "bg-muted"}`}><Icon className="w-5 h-5" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{label}</p>
                              <p className={`text-xs mt-0.5 ${variant === "primary" ? "opacity-70" : "text-muted-foreground"}`}>{desc}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
                          </div>
                        </Button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Code */}
                {step === "code" && (
                  <form onSubmit={handleValidateCode} className="space-y-4">
                    <div className="p-4 rounded-xl bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><KeyRound className="w-4 h-4 text-primary" /><span className="font-medium">Já recebi meu código</span></div>
                      <p className="text-xs text-muted-foreground">Digite o código de acesso que você recebeu por email após aprovação.</p>
                    </div>
                    <div>
                      <Label>Código de Convite</Label>
                      <Input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="Ex: MED-XXXX-XXXX" required className="mt-1 font-mono text-center text-lg tracking-widest h-12" maxLength={20} />
                    </div>
                    <Button type="submit" className="w-full bg-gradient-to-r from-secondary to-primary text-primary-foreground h-12 shadow-lg" size="lg" disabled={validating}>
                      {validating ? <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin" /> Validando...</motion.span> : "Validar Código"}
                    </Button>
                    <p className="text-center text-sm text-muted-foreground"><button type="button" onClick={() => setStep("welcome")} className="text-primary font-semibold hover:underline">← Voltar</button></p>
                  </form>
                )}

                {/* Quiz - profiling step */}
                {step === "quiz" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 text-sm text-foreground mb-1"><Stethoscope className="w-4 h-4 text-primary" /><span className="font-medium">Sobre sua atuação</span></div>
                      <p className="text-xs text-muted-foreground">Responda essas perguntas rápidas para prosseguir ao cadastro.</p>
                    </div>
                    <div className="relative">
                      <Label>Especialidade(s) de atuação *</Label>
                      {selectedSpecialties.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                          {selectedSpecialties.map(s => (
                            <Badge key={s} className="bg-secondary/10 text-secondary border-secondary/20 gap-1 text-xs py-1 px-2.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors" onClick={() => removeSpecialty(s)}>
                              {s} ✕
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Input
                          ref={specialtyInputRef}
                          value={specialtySearch}
                          onChange={e => { setSpecialtySearch(e.target.value); setShowSpecialtyDropdown(true); }}
                          onFocus={() => setShowSpecialtyDropdown(true)}
                          onKeyDown={handleSpecialtyKeyDown}
                          placeholder={selectedSpecialties.length ? "Adicionar outra..." : "Buscar ou digitar especialidade..."}
                          className="mt-1 h-11"
                        />
                        {showSpecialtyDropdown && (specialtySearch.trim() || selectedSpecialties.length === 0) && (
                          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-border bg-popover shadow-lg">
                            {filteredSpecialties.slice(0, 8).map(s => (
                              <button
                                key={s}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                onMouseDown={(e) => { e.preventDefault(); addSpecialty(s); }}
                              >
                                {s}
                              </button>
                            ))}
                            {specialtySearch.trim() && !PREDEFINED_SPECIALTIES.some(s => s.toLowerCase() === specialtySearch.toLowerCase().trim()) && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 border-t border-border/50"
                                onMouseDown={(e) => { e.preventDefault(); addSpecialty(specialtySearch); }}
                              >
                                + Adicionar "{specialtySearch.trim()}"
                              </button>
                            )}
                            {filteredSpecialties.length === 0 && !specialtySearch.trim() && (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Todas as especialidades já foram selecionadas</p>
                            )}
                          </div>
                        )}
                      </div>
                      {showSpecialtyDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowSpecialtyDropdown(false)} />}
                    </div>

                    {/* Care Areas */}
                    <div className="relative">
                      <Label>Áreas de atendimento (ex: Infecção Urinária, Enxaqueca)</Label>
                      <p className="text-xs text-muted-foreground mb-1">Condições e queixas que você mais atende</p>
                      {selectedCareAreas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                          {selectedCareAreas.map(s => (
                            <Badge key={s} className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs py-1 px-2.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors" onClick={() => removeCareArea(s)}>
                              {s} ✕
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Input
                          ref={careAreaInputRef}
                          value={careAreaSearch}
                          onChange={e => { setCareAreaSearch(e.target.value); setShowCareAreaDropdown(true); }}
                          onFocus={() => setShowCareAreaDropdown(true)}
                          onKeyDown={e => { if (e.key === "Enter" && careAreaSearch.trim()) { e.preventDefault(); addCareArea(careAreaSearch); } }}
                          placeholder={selectedCareAreas.length ? "Adicionar outra..." : "Buscar ou digitar área de atendimento..."}
                          className="mt-1 h-11"
                        />
                        {showCareAreaDropdown && (careAreaSearch.trim() || selectedCareAreas.length === 0) && (
                          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-border bg-popover shadow-lg">
                            {filteredCareAreas.slice(0, 8).map(s => (
                              <button key={s} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onMouseDown={(e) => { e.preventDefault(); addCareArea(s); }}>
                                {s}
                              </button>
                            ))}
                            {careAreaSearch.trim() && !PREDEFINED_CARE_AREAS.some(s => s.toLowerCase() === careAreaSearch.toLowerCase().trim()) && (
                              <button type="button" className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 border-t border-border/50" onMouseDown={(e) => { e.preventDefault(); addCareArea(careAreaSearch); }}>
                                + Adicionar "{careAreaSearch.trim()}"
                              </button>
                            )}
                            {filteredCareAreas.length === 0 && !careAreaSearch.trim() && (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Todas as áreas já foram selecionadas</p>
                            )}
                          </div>
                        )}
                      </div>
                      {showCareAreaDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowCareAreaDropdown(false)} />}
                    </div>
                    <div><Label>Anos de experiência</Label><Input type="number" min="0" max="60" value={experienceYears} onChange={e => setExperienceYears(e.target.value)} placeholder="Ex: 5" className="mt-1 h-11" /></div>
                    <div>
                      <Label>Tipo de atendimento pretendido *</Label>
                      <select value={consultationType} onChange={e => setConsultationType(e.target.value)} className="mt-1 w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" required>
                        <option value="">Selecione</option>
                        <option value="Teleconsulta">Teleconsulta</option>
                        <option value="Presencial">Presencial</option>
                        <option value="Ambos">Ambos</option>
                      </select>
                    </div>
                    <div>
                      <Label>Como conheceu a AloClinica?</Label>
                      <select value={howFound} onChange={e => setHowFound(e.target.value)} className="mt-1 w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option value="">Selecione</option>
                        <option value="Google">Google</option>
                        <option value="Indicação de colega">Indicação de colega</option>
                        <option value="Redes sociais">Redes sociais</option>
                        <option value="Congresso/Evento">Congresso/Evento</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <Button className="w-full bg-gradient-to-r from-secondary to-primary text-primary-foreground h-12 shadow-lg" size="lg" disabled={selectedSpecialties.length === 0 || !consultationType} onClick={() => setStep("apply")}>
                      Continuar para Cadastro <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      <button type="button" onClick={() => setStep("welcome")} className="text-primary font-semibold hover:underline">← Voltar</button>
                      <span className="text-border">|</span>
                      <button type="button" onClick={() => setStep("login")} className="text-primary font-semibold hover:underline">Já tenho conta</button>
                    </div>
                  </div>
                )}

                {/* Apply - Pre-registration form */}
                {step === "apply" && (
                  <form onSubmit={handleSubmitApplication} className="space-y-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 text-sm text-foreground mb-1"><Stethoscope className="w-4 h-4 text-primary" /><span className="font-medium">Solicitar cadastro</span></div>
                      <p className="text-xs text-muted-foreground">Preencha seus dados. Nossa equipe analisará e enviará o código de acesso por email.</p>
                    </div>
                    {selectedSpecialties.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-secondary/10 text-secondary text-sm border border-secondary/20">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="font-medium">{selectedSpecialties.join(", ")}</span>
                        {consultationType && <Badge variant="outline" className="ml-auto text-xs">{consultationType}</Badge>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Nome</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nome" required className="mt-1 h-11" /></div>
                      <div><Label>Sobrenome</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Sobrenome" required className="mt-1 h-11" /></div>
                    </div>
                    <div><Label>Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10 h-11" required /></div></div>
                    <div><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="mt-1 h-11" /></div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2"><Label>CRM</Label><Input value={crm} onChange={e => setCrm(e.target.value)} placeholder="123456" required className="mt-1 h-11" /></div>
                      <div><Label>UF</Label><Input value={crmState} onChange={e => setCrmState(e.target.value.toUpperCase())} placeholder="SP" required className="mt-1 h-11" maxLength={2} /></div>
                    </div>
                    <div><Label>Sobre você (opcional)</Label><textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Breve descrição da sua experiência..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={500} /></div>
                    <Button type="submit" className="w-full bg-gradient-to-r from-secondary to-primary text-primary-foreground h-12 shadow-lg" size="lg" disabled={submittingApplication}>
                      {submittingApplication ? <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin" /> Enviando...</motion.span> : "Enviar Solicitação"}
                    </Button>
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      <button type="button" onClick={() => setStep("quiz")} className="text-primary font-semibold hover:underline">← Voltar</button>
                      <span className="text-border">|</span>
                      <button type="button" onClick={() => setStep("login")} className="text-primary font-semibold hover:underline">Já tenho conta</button>
                    </div>
                  </form>
                )}

                {/* Applied - Success */}
                {step === "applied" && (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-success to-success/70 flex items-center justify-center mx-auto shadow-lg">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">Solicitação Enviada!</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                      Recebemos seus dados. Nossa equipe analisará sua solicitação e enviará o <strong>código de acesso por email</strong> em até 48 horas úteis.
                    </p>
                    <div className="pt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">Quando aprovado, você receberá por email o link exclusivo e o código de acesso para criar sua conta.</p>
                    </div>
                  </motion.div>
                )}

                {step === "register" && (
                  <form onSubmit={handleRegister} className="space-y-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 p-3 rounded-xl bg-secondary/10 text-secondary text-sm border border-secondary/20">
                      <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></div>
                      <span className="font-medium">Código validado com sucesso</span>
                    </motion.div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Nome</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nome" required className="mt-1 h-11" /></div>
                      <div><Label>Sobrenome</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Sobrenome" required className="mt-1 h-11" /></div>
                    </div>
                    <div>
                      <Label>Nome de exibição (como quer ser chamado)</Label>
                      <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: Dr. João, Dra. Maria" className="mt-1 h-11" />
                      <p className="text-[11px] text-muted-foreground mt-0.5">Este nome será exibido para os pacientes.</p>
                    </div>
                    <div><Label>Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10 h-11" required /></div></div>
                    <div><Label>Senha</Label><div className="relative mt-1"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 h-11" required minLength={6} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>{password && <PasswordStrength password={password} />}</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2"><Label>CRM</Label><Input value={crm} onChange={e => setCrm(e.target.value)} placeholder="123456" required className="mt-1 h-11" /></div>
                      <div><Label>UF</Label><Input value={crmState} onChange={e => setCrmState(e.target.value.toUpperCase())} placeholder="SP" required className="mt-1 h-11" maxLength={2} /></div>
                    </div>
                    {crm && crmState.length === 2 && (
                      <Button type="button" variant="outline" size="sm" className="w-full text-primary border-primary/30 hover:bg-primary/10" onClick={() => window.open(`https://portal.cfm.org.br/busca-medicos/?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(crmState)}`, "_blank")}>🔍 Validar CRM no Portal CFM</Button>
                    )}

                    {/* Photo upload / capture */}
                    <div>
                      <Label className="flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-primary" /> Foto Profissional *
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                        Esta foto será visível para os pacientes ao buscar médicos.
                      </p>
                      {photoPreview ? (
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 rounded-2xl overflow-hidden ring-2 ring-primary/20 shrink-0">
                            <img src={photoPreview} alt="Prévia" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <p className="text-xs text-muted-foreground">Foto selecionada ✓</p>
                            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                              Trocar foto
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all text-center">
                            <Camera className="w-6 h-6 text-primary" />
                            <span className="text-xs font-medium text-foreground">Tirar foto</span>
                            <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoSelect} />
                          </label>
                          <label className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all text-center">
                            <Upload className="w-6 h-6 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Enviar arquivo</span>
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoSelect} />
                          </label>
                        </div>
                      )}
                    </div>

                    <TermsConsentCheckbox checked={termsAccepted} onCheckedChange={setTermsAccepted} />
                    <Button type="submit" className="w-full bg-gradient-to-r from-secondary to-primary text-primary-foreground h-12 shadow-lg" size="lg" disabled={loading || !termsAccepted}>
                      {loading ? <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin" /> Criando conta...</motion.span> : "Cadastrar como Médico"}
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">Já tem conta? <button type="button" onClick={() => setStep("login")} className="text-primary font-semibold hover:underline">Entrar</button></p>
                  </form>
                )}

                {/* Login */}
                {step === "login" && (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div><Label>Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10 h-11" required /></div></div>
                    <div><Label>Senha</Label><div className="relative mt-1"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 pr-10 h-11" required /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
                    <Button type="submit" className="w-full bg-gradient-to-r from-secondary to-primary text-primary-foreground h-12 shadow-lg" size="lg" disabled={loading}>
                      {loading ? <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin" /> Entrando...</motion.span> : "Entrar"}
                    </Button>
                    <SocialAuthButtons redirectTo="/dashboard?role=doctor" compact />
                    <p className="text-center text-sm text-muted-foreground"><Link to="/forgot-password" className="text-primary hover:underline">Esqueci minha senha</Link></p>
                    <p className="text-center text-sm text-muted-foreground"><button type="button" onClick={() => setStep("welcome")} className="text-primary font-semibold hover:underline">← Voltar</button></p>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-4 flex items-center justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-secondary" /> CFM Verificado</span>
              <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-warning" /> 4.9/5</span>
              <span>500+ médicos</span>
            </div>
          </div>
        </section>

        {/* ==================== IMAGE BANNER CTA ==================== */}
        <section className="relative overflow-hidden" style={{ minHeight: "280px" }}>
          <img src={bannerMedicoCta} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
          <div className="container mx-auto px-4 relative z-10 flex items-center" style={{ minHeight: "280px" }}>
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="max-w-lg">
              <Badge className="mb-3 text-xs px-3 py-1 bg-white/15 text-white border-white/20 backdrop-blur-sm">
                <BarChart3 className="w-3 h-3 mr-1" /> Dados reais
              </Badge>
              <h2 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight leading-tight">
                Médicos que usam a AloClinica<br />aumentam sua base em até <span className="text-white/90">40%</span>
              </h2>
              <p className="text-sm text-white/70 mb-5 max-w-md">
                Alcance pacientes de todo o Brasil sem sair de casa. Defina seus horários e preços.
              </p>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: "500+", desc: "Médicos ativos" },
                  { label: "30+", desc: "Especialidades" },
                  { label: "4.9★", desc: "Avaliação média" },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <p className="text-xl font-black text-white">{s.label}</p>
                    <p className="text-[10px] text-white/60 uppercase tracking-wider">{s.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features checklist */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.h2 variants={fadeUp} className="text-3xl font-black text-foreground text-center mb-3 tracking-tight">Recursos da Plataforma</motion.h2>
              <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10">Tudo incluso, sem custos adicionais</motion.p>
              <div className="grid sm:grid-cols-2 gap-3">
                {features.map((f, i) => (
                  <motion.div key={i} variants={fadeUp} className="card-interactive flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50 hover:shadow-lg hover:border-primary/20 transition-all group">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-success to-success/70 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform"><CheckCircle2 className="w-4 h-4 text-white" /></div>
                    <span className="text-sm text-foreground font-medium">{f}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <motion.h2 variants={fadeUp} className="text-3xl font-black text-foreground text-center mb-12 tracking-tight">Perguntas Frequentes</motion.h2>
              <div className="space-y-4">
                {faqItems.map((faq, i) => (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="border-border/50 hover:shadow-lg transition-all">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center shrink-0 text-primary"><HelpCircle className="w-5 h-5" /></div>
                          <div><h3 className="font-bold text-foreground mb-2">{faq.question}</h3><p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p></div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-2xl text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary mx-auto mb-5 shadow-xl"><Smartphone className="w-8 h-8 text-white" /></div>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground mb-3 tracking-tight">Transforme sua prática médica</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">Junte-se a mais de 500 médicos que já atendem pela AloClinica.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button variant="rainbow" size="lg" className="rounded-2xl h-14 px-10 text-base font-bold" onClick={scrollToForm}>Criar Minha Conta <ArrowRight className="w-5 h-5 ml-2" /></Button>
                <Button size="lg" variant="outline" className="rounded-2xl h-14 px-8 text-base font-semibold" asChild>
                  <a href="https://wa.me/5511999999999?text=Olá! Sou médico e gostaria de saber mais." target="_blank" rel="noopener noreferrer">Falar pelo WhatsApp</a>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <Suspense fallback={null}><Footer /></Suspense>
      </div>
    </>
  );
};

export default AuthMedico;
