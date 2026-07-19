/**
 * SignupDoctor — Wizard de 2 etapas: dados + validação de CRM e upload de documentos.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CPFInput, CRMInput, PhoneInput } from "@/components/ui/masked-inputs";
import {
  validarNome,
  validarEmail,
  validarTelefone,
  validarCPF,
  validarSenha,
  validarEspecialidade,
  VALID_SPECIALTIES,
  validarCRM,
} from "@/lib/form-validators";
import {
  ArrowLeft, ArrowRight, Eye, EyeSlash, Stethoscope, IdentificationCard,
  Lock, ShieldCheck, CheckCircle, Clock, CurrencyDollar, Sparkle,
  UploadSimple, FileImage, XCircle, CircleNotch,
} from "@phosphor-icons/react";
import { toastError } from "@/lib/errorMessages";
import { suggestEmailFix } from "@/lib/brValidators";
import doctorSignup from "@/assets/doctor-signup-1.png";

interface FormData {
  email: string;
  full_name: string;
  phone: string;
  cpf: string;
  council_type: string;
  crm: string;
  crm_state: string;
  specialty: string;
  password: string;
  password_confirm: string;
}

type DocKey = "crm_doc" | "id_doc" | "selfie_doc";

interface DocsState {
  crm_doc: File | null;
  id_doc: File | null;
  selfie_doc: File | null;
}

const DOC_LABELS: Record<DocKey, { label: string; hint: string }> = {
  crm_doc:    { label: "Foto da carteira do CRM",      hint: "JPG ou PNG, máx. 5MB" },
  id_doc:     { label: "RG ou CNH (frente)",           hint: "Documento legível com foto" },
  selfie_doc: { label: "Selfie segurando o documento", hint: "Rosto e documento visíveis" },
};

const MAX_FILE_MB = 5;

const STEPS = [
  { id: 1, label: "Dados",      icon: IdentificationCard },
  { id: 2, label: "Documentos", icon: ShieldCheck },
] as const;

const COUNCILS: { value: string; label: string; description: string; specialties: string[] }[] = [
  { value: "CRM",     label: "Médico (CRM)",                description: "Conselho Federal de Medicina",
    specialties: [] },
  { value: "CRP",     label: "Psicólogo (CRP)",             description: "Conselho Federal de Psicologia",
    specialties: ["psicologia-clinica","psicanalise","neuropsicologia","psicologia-infantil","terapia-cognitivo-comportamental","psicologia-organizacional"] },
  { value: "CRN",     label: "Nutricionista (CRN)",         description: "Conselho Federal de Nutricionistas",
    specialties: ["nutricao-clinica","nutricao-esportiva","nutricao-materno-infantil","nutricao-comportamental"] },
  { value: "CRFa",    label: "Fonoaudiólogo (CRFa)",        description: "Conselho Federal de Fonoaudiologia",
    specialties: ["audiologia","linguagem","motricidade-orofacial","voz","disfagia"] },
  { value: "CREFITO", label: "Fisioterapeuta / TO (CREFITO)", description: "Fisioterapia e Terapia Ocupacional",
    specialties: ["fisioterapia-traumato-ortopedica","fisioterapia-respiratoria","fisioterapia-neurofuncional","fisioterapia-pelvica","terapia-ocupacional"] },
  { value: "COREN",   label: "Enfermagem (COREN)",          description: "Conselho Federal de Enfermagem",
    specialties: ["enfermagem-obstetrica","enfermagem-pediatrica","saude-mental","estomaterapia","enfermagem-do-trabalho"] },
  { value: "CRO",     label: "Odontologia (CRO)",           description: "Conselho Federal de Odontologia",
    specialties: ["clinico-geral","ortodontia","endodontia","periodontia","implantodontia","odontopediatria"] },
  { value: "CRBM",    label: "Biomédico (CRBM)",            description: "Conselho Federal de Biomedicina",
    specialties: ["analises-clinicas","imagenologia","genetica","reproducao-humana"] },
  { value: "CRF",     label: "Farmacêutico (CRF)",          description: "Conselho Federal de Farmácia",
    specialties: ["farmacia-clinica","farmacia-hospitalar","manipulacao","oncologia"] },
  { value: "CREF",    label: "Educação Física (CREF)",      description: "Conselho Federal de Educação Física",
    specialties: ["treinamento-fisico","reabilitacao","esportiva","saude-coletiva"] },
  { value: "CRESS",   label: "Assistente Social (CRESS)",   description: "Conselho Federal de Serviço Social",
    specialties: ["saude","familia","gerontologia"] },
];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 mb-8" aria-label="Progresso do cadastro">
      {STEPS.map((s, i) => {
        const active = step === s.id;
        const done = step > s.id;
        return (
          <li key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={[
                "flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition",
                done   ? "bg-primary text-primary-foreground border-primary"
                : active ? "bg-primary/10 text-primary border-primary/40"
                       : "bg-muted text-muted-foreground border-transparent",
              ].join(" ")}
            >
              {done ? <CheckCircle weight="fill" className="w-4 h-4" />
                    : <s.icon weight={active ? "fill" : "regular"} className="w-4 h-4" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.id}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span className={`h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function SignupDoctor() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    email: "",
    full_name: "", phone: "", cpf: "",
    council_type: "CRM", crm: "", crm_state: "", specialty: "",
    password: "", password_confirm: "",
  });

  const [docs, setDocs] = useState<DocsState>({ crm_doc: null, id_doc: null, selfie_doc: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [specialtyOther, setSpecialtyOther] = useState(false);

  type CrmStatus = "idle" | "checking" | "ok" | "warn" | "fail";
  const [crmStatus, setCrmStatus] = useState<CrmStatus>("idle");
  const [crmInfo, setCrmInfo] = useState<{ nome?: string | null; situacao?: string | null } | null>(null);

  const updateField = (name: keyof FormData, value: string) => {
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
    if (name === "crm" || name === "crm_state") {
      setCrmStatus("idle");
      setCrmInfo(null);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    updateField(e.target.name as keyof FormData, e.target.value);

  const strength = (() => {
    const p = formData.password; let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();
  const strengthLabels = ["Muito fraca", "Fraca", "Média", "Forte", "Excelente"];
  const strengthColors = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-primary", "bg-emerald-500"];

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (!validarEmail(formData.email)) e.email = "Email inválido";
    if (!validarNome(formData.full_name)) e.full_name = "Informe nome e sobrenome";
    if (!validarTelefone(formData.phone)) e.phone = "Telefone inválido (11) 9XXXX-XXXX";
    if (!validarCPF(formData.cpf)) e.cpf = "CPF inválido";
    if (!formData.council_type) e.council_type = "Selecione o tipo de profissional";
    if (!formData.crm_state) e.crm_state = "Selecione a UF";
    if (!formData.crm) e.crm = "Número do conselho é obrigatório";
    else if (formData.council_type === "CRM" && !validarCRM(formData.crm, formData.crm_state || undefined))
      e.crm = "CRM inválido (4 a 6 dígitos)";
    else if (formData.council_type !== "CRM" && !/^\d{3,8}$/.test(formData.crm.replace(/\D/g, "")))
      e.crm = "Número inválido (3 a 8 dígitos)";
    if (!formData.specialty.trim()) e.specialty = "Informe a especialidade";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const verifyCrm = async () => {
    if (!formData.crm || !formData.crm_state) {
      toast.error("Preencha CRM e UF antes de verificar");
      return;
    }
    setCrmStatus("checking");
    setCrmInfo(null);
    try {
      const { data, error } = await (db as any).functions.invoke("verify-crm", {
        body: { crm: formData.crm.replace(/\D/g, ""), uf: formData.crm_state },
      });
      if (error) throw error;
      if (data?.valid) {
        setCrmStatus("ok");
        setCrmInfo({ nome: data?.doctor?.nome, situacao: data?.doctor?.situacao });
        toast.success("CRM verificado com sucesso");
      } else if (data?.found) {
        setCrmStatus("warn");
        setCrmInfo({ nome: data?.doctor?.nome, situacao: data?.doctor?.situacao });
        toast.warning("CRM encontrado, mas situação não está regular");
      } else {
        setCrmStatus("fail");
        toast.error("CRM não encontrado. Você pode prosseguir; será revisado manualmente.");
      }
    } catch (err: any) {
      setCrmStatus("fail");
      toast.warning("Não foi possível consultar o CRM agora — análise manual.");
    }
  };

  const handleFile = (key: DocKey, file: File | null) => {
    if (!file) { setDocs((p) => ({ ...p, [key]: null })); return; }
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      toast.error("Use JPG, PNG ou WEBP");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Arquivo maior que ${MAX_FILE_MB}MB`);
      return;
    }
    setDocs((p) => ({ ...p, [key]: file }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string> = {};
    (Object.keys(DOC_LABELS) as DocKey[]).forEach((k) => {
      if (!docs[k]) e[k] = "Documento obrigatório";
    });
    const pw = validarSenha(formData.password);
    if (!pw.isValid) e.password = pw.feedback.join(", ");
    if (formData.password !== formData.password_confirm) e.password_confirm = "As senhas não conferem";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFinalSubmit = async () => {
    if (!validateStep2()) {
      toast.error("Revise os campos do passo 2");
      return;
    }
    setLoading(true);
    try {
      const parts = formData.full_name.trim().split(/\s+/);

      const { data: authData, error: authError } = await db.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            role: "doctor",
            first_name: parts[0] || "",
            last_name: parts.slice(1).join(" ") || "",
            cpf: formData.cpf.replace(/\D/g, ""),
            phone: formData.phone.replace(/\D/g, ""),
          },
        },
      });
      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error("Falha ao criar usuário");

      if (!authData.session) {
        await db.auth.signInWithPassword({ email: formData.email.trim(), password: formData.password });
      }
      const { data: sessionData } = await db.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid || uid !== user.id) {
        throw new Error("Sessão não confirmada. Confirme seu email e faça login para completar o cadastro.");
      }

      // doctor_type tem CHECK constraint (telemedicina).
      // A especialidade clínica vai para doctor_specialties (linkada à tabela specialties).
      const docType = "telemedicina";

      const { data: dpRow, error: dpErr } = await (db as any)
        .from("doctor_profiles")
        .insert({
          user_id: uid,
          council_type: formData.council_type,
          council_number: formData.crm.replace(/\D/g, ""),
          council_state: formData.crm_state,
          crm: formData.crm.replace(/\D/g, ""),
          crm_state: formData.crm_state,
          doctor_type: docType,
          is_approved: false,
          crm_verified: formData.council_type === "CRM" && crmStatus === "ok",
        })
        .select("id")
        .single();
      if (dpErr && !String(dpErr.message || "").includes("duplicate")) throw dpErr;

      // Vincula especialidade real (best-effort): match por nome em public.specialties
      try {
        const doctorProfileId = (dpRow as any)?.id;
        if (doctorProfileId && formData.specialty) {
          const { data: spec } = await (db as any)
            .from("specialties").select("id").ilike("name", formData.specialty.trim()).maybeSingle();
          if ((spec as any)?.id) {
            await (db as any).from("doctor_specialties")
              .insert({ doctor_id: doctorProfileId, specialty_id: (spec as any).id });
          }
        }
      } catch (e) { /* não bloqueia o cadastro */ console.warn("specialty link", e); }

      const uploaded: Record<string, string> = {};
      for (const key of Object.keys(DOC_LABELS) as DocKey[]) {
        const file = docs[key];
        if (!file) continue;
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${uid}/${key}.${ext}`;
        const { error: upErr } = await (db as any).storage
          .from("doctor-documents")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw new Error(`Falha ao enviar ${DOC_LABELS[key].label}: ${upErr.message}`);
        uploaded[key] = path;
      }

      await (db as any).from("doctor_profiles")
        .update({ documents: uploaded })
        .eq("user_id", uid);

      toast.success("Cadastro enviado! Sua conta está em análise.");
      navigate("/aguardando-aprovacao?role=doctor");
    } catch (err) {
      const msg = String((err as any)?.message || err || "");
      const isEmailExists = /already.*registered|user.*already|email_exists|already_exists/i.test(msg);
      if (isEmailExists) {
        toast.error("E-mail já cadastrado", {
          description: "Esse e-mail já tem conta. Vamos te levar para o login.",
          action: { label: "Ir para login", onClick: () => navigate(`/medico?email=${encodeURIComponent(formData.email)}`) },
        });
      } else {
        toastError(toast, err, "signup");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 1) { navigate(-1); return; }
    setStep((s) => (s - 1) as 1 | 2);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] min-h-screen">
        <aside className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-12 overflow-hidden">
          <div aria-hidden className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary-foreground)/0.25),transparent_50%),radial-gradient(circle_at_bottom_left,hsl(var(--primary-foreground)/0.18),transparent_45%)]" />

          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="relative z-10 inline-flex items-center gap-2 text-sm font-semibold text-primary-foreground/85 hover:text-primary-foreground transition w-fit"
          >
            <ArrowLeft className="h-4 w-4" weight="bold" /> Voltar
          </motion.button>

          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-primary-foreground/15 backdrop-blur px-3 py-1.5 rounded-full mb-6">
              <Sparkle className="w-3.5 h-3.5" weight="fill" /> Cadastro de médicos
            </span>
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-[1.05] mb-5">
              Atenda mais,<br />
              <span className="text-primary-foreground/85">trabalhe de onde quiser.</span>
            </h1>
            <p className="text-primary-foreground/80 text-base leading-relaxed max-w-md mb-10">
              Cadastre-se gratuitamente. Validação automática de CRM, upload de documentos
              e análise da equipe AloClínica em até 24h.
            </p>

            <ul className="space-y-3.5 max-w-md">
              {[
                { icon: CurrencyDollar, label: "Repasse de R$ 30–80 por consulta, PIX em 48h" },
                { icon: Clock,          label: "Agenda 100% sua: dias e horários livres" },
                { icon: ShieldCheck,    label: "100% CFM, LGPD e KYC compliant" },
                { icon: CheckCircle,    label: "Prontuário, receita digital e atestado inclusos" },
              ].map((b) => (
                <li key={b.label} className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
                    <b.icon className="w-5 h-5" weight="fill" />
                  </span>
                  <span className="text-sm text-primary-foreground/90 leading-relaxed pt-1.5">{b.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-4 pt-8 border-t border-primary-foreground/15">
            <img src={doctorSignup} alt="" aria-hidden className="w-16 h-16 object-contain drop-shadow-lg" />
            <div className="text-xs text-primary-foreground/75">
              <p className="font-bold text-primary-foreground">+500 médicos parceiros</p>
              <p>4.9★ de satisfação na plataforma</p>
            </div>
          </div>
        </aside>

        <main className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-14 lg:py-14">
          <div className="w-full max-w-xl mx-auto">
            <button
              onClick={handleBack}
              className="lg:hidden inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 1 ? "Voltar" : "Etapa anterior"}
            </button>

            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                Crie sua conta de médico
              </h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Etapa {step} de 2 — análise da documentação em até 24h após o envio.
              </p>
            </motion.div>

            <Stepper step={step} />

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  <section className="space-y-4 p-5 sm:p-6 rounded-2xl border border-border bg-card">
                    <header className="flex items-center gap-2.5 pb-1">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IdentificationCard className="w-4 h-4 text-primary" weight="fill" />
                      </span>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Dados pessoais</h3>
                    </header>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                      <Input
                        id="email" name="email" type="email"
                        placeholder="seu@email.com"
                        value={formData.email} onChange={handleInput}
                        className={errors.email ? "border-destructive" : ""}
                        autoComplete="email"
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                      {(() => {
                        const fix = suggestEmailFix(formData.email);
                        if (!fix || errors.email) return null;
                        return (
                          <button type="button" onClick={() => setFormData((p) => ({ ...p, email: fix }))}
                            className="text-xs text-primary hover:underline mt-0.5">
                            Quis dizer <strong>{fix}</strong>?
                          </button>
                        );
                      })()}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="full_name">Nome completo <span className="text-destructive">*</span></Label>
                      <Input
                        id="full_name" name="full_name" placeholder="Dr. João Silva"
                        value={formData.full_name} onChange={handleInput}
                        className={errors.full_name ? "border-destructive" : ""}
                      />
                      {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <PhoneInput
                        value={formData.phone}
                        onChange={(phone) => setFormData((p) => ({ ...p, phone }))}
                        required error={errors.phone}
                      />
                      <CPFInput
                        value={formData.cpf}
                        onChange={(cpf) => setFormData((p) => ({ ...p, cpf }))}
                        required error={errors.cpf}
                      />
                    </div>
                  </section>

                  <section className="space-y-4 p-5 sm:p-6 rounded-2xl border border-border bg-card">
                    <header className="flex items-center gap-2.5 pb-1">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Stethoscope className="w-4 h-4 text-primary" weight="fill" />
                      </span>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Dados profissionais</h3>
                    </header>

                    <div className="space-y-2">
                      <Label htmlFor="council_type">Tipo de profissional <span className="text-destructive">*</span></Label>
                      <select
                        id="council_type" name="council_type"
                        value={formData.council_type}
                        onChange={(e) => {
                          updateField("council_type", e.target.value);
                          setFormData((p) => ({ ...p, specialty: "" }));
                          setSpecialtyOther(false);
                        }}
                        className={`w-full h-10 px-3 rounded-md bg-background border text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                          errors.council_type ? "border-destructive" : "border-input"
                        }`}
                      >
                        {COUNCILS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        {COUNCILS.find((c) => c.value === formData.council_type)?.description}
                      </p>
                    </div>

                    {formData.council_type === "CRM" ? (
                      <CRMInput
                        value={formData.crm}
                        onCRMChange={(crm) => updateField("crm", crm)}
                        state={formData.crm_state}
                        onStateChange={(state) => updateField("crm_state", state)}
                        required error={errors.crm || errors.crm_state}
                      />
                    ) : (
                      <div className="grid sm:grid-cols-[1fr_120px] gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="council_number">
                            Número do {formData.council_type} <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="council_number" name="crm"
                            placeholder="Apenas números"
                            inputMode="numeric"
                            value={formData.crm}
                            onChange={(e) => updateField("crm", e.target.value.replace(/\D/g, ""))}
                            className={errors.crm ? "border-destructive" : ""}
                          />
                          {errors.crm && <p className="text-xs text-destructive">{errors.crm}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="crm_state">UF <span className="text-destructive">*</span></Label>
                          <select
                            id="crm_state" name="crm_state"
                            value={formData.crm_state} onChange={handleInput}
                            className={`w-full h-10 px-3 rounded-md bg-background border text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                              errors.crm_state ? "border-destructive" : "border-input"
                            }`}
                          >
                            <option value="">UF</option>
                            {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-3 -mt-1">
                      {formData.council_type === "CRM" ? (
                        <Button
                          type="button" variant="outline" size="sm"
                          onClick={verifyCrm}
                          disabled={crmStatus === "checking" || !formData.crm || !formData.crm_state}
                          className="gap-2"
                        >
                          {crmStatus === "checking"
                            ? <CircleNotch className="w-4 h-4 animate-spin" />
                            : <ShieldCheck className="w-4 h-4" />}
                          Verificar CRM no portal
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <ShieldCheck className="w-4 h-4" />
                          Validação manual pela equipe AloClínica em até 24h
                        </span>
                      )}

                      {formData.council_type === "CRM" && crmStatus === "ok" && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                          <CheckCircle weight="fill" className="w-4 h-4" />
                          {crmInfo?.nome ? `Verificado — ${crmInfo.nome}` : "CRM regular"}
                        </span>
                      )}
                      {formData.council_type === "CRM" && crmStatus === "warn" && (
                        <span className="text-xs font-semibold text-amber-600">
                          Situação: {crmInfo?.situacao ?? "irregular"}
                        </span>
                      )}
                      {formData.council_type === "CRM" && crmStatus === "fail" && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          Verificação manual será feita pela equipe
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="specialty">Especialidade <span className="text-destructive">*</span></Label>
                      {(() => {
                        const list = formData.council_type === "CRM"
                          ? VALID_SPECIALTIES
                          : (COUNCILS.find((c) => c.value === formData.council_type)?.specialties ?? []);
                        return (
                          <select
                            id="specialty" name="specialty"
                            value={
                              specialtyOther
                                ? "outras"
                                : list.includes(formData.specialty.toLowerCase())
                                ? formData.specialty
                                : ""
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "outras") {
                                setSpecialtyOther(true);
                                setFormData((p) => ({ ...p, specialty: "" }));
                              } else {
                                setSpecialtyOther(false);
                                setFormData((p) => ({ ...p, specialty: v }));
                              }
                            }}
                            className={`w-full h-10 px-3 rounded-md bg-background border text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                              errors.specialty ? "border-destructive" : "border-input"
                            }`}
                          >
                            <option value="">Selecione uma especialidade</option>
                            {list.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")}
                              </option>
                            ))}
                            <option value="outras">Outras (digitar)</option>
                          </select>
                        );
                      })()}
                      {specialtyOther && (
                        <Input
                          name="specialty"
                          placeholder="Digite sua especialidade"
                          value={formData.specialty}
                          onChange={handleInput}
                          className="mt-2"
                        />
                      )}
                      {errors.specialty && <p className="text-xs text-destructive">{errors.specialty}</p>}
                    </div>
                  </section>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="s3"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  <section className="space-y-4 p-5 sm:p-6 rounded-2xl border border-border bg-card">
                    <header className="flex items-center gap-2.5 pb-1">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-primary" weight="fill" />
                      </span>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Documentos</h3>
                    </header>

                    <p className="text-xs text-muted-foreground">
                      Anexe fotos legíveis. Tudo é armazenado de forma privada e usado apenas para análise.
                    </p>

                    <div className="grid gap-3">
                      {(Object.keys(DOC_LABELS) as DocKey[]).map((key) => (
                        <DocDropzone
                          key={key}
                          label={DOC_LABELS[key].label}
                          hint={DOC_LABELS[key].hint}
                          file={docs[key]}
                          error={errors[key]}
                          onChange={(f) => handleFile(key, f)}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4 p-5 sm:p-6 rounded-2xl border border-border bg-card">
                    <header className="flex items-center gap-2.5 pb-1">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-primary" weight="fill" />
                      </span>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Senha de acesso</h3>
                    </header>

                    <div className="space-y-2">
                      <Label htmlFor="password">Senha <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Input
                          id="password" name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 8 caracteres, com maiúscula e número"
                          value={formData.password} onChange={handleInput}
                          className={`pr-10 ${errors.password ? "border-destructive" : ""}`}
                          autoComplete="new-password"
                        />
                        <button
                          type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Alternar visibilidade"
                        >
                          {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {formData.password && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex gap-1">
                            {[0, 1, 2, 3].map((i) => (
                              <div key={i}
                                className={`h-1 flex-1 rounded-full transition-all ${
                                  i < strength ? strengthColors[strength] : "bg-muted"
                                }`} />
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Força: <span className="font-semibold text-foreground">{strengthLabels[strength]}</span>
                          </p>
                        </div>
                      )}
                      {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password_confirm">Confirmar senha <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Input
                          id="password_confirm" name="password_confirm"
                          type={showPasswordConfirm ? "text" : "password"}
                          placeholder="Repita a senha"
                          value={formData.password_confirm} onChange={handleInput}
                          className={`pr-10 ${errors.password_confirm ? "border-destructive" : ""}`}
                          autoComplete="new-password"
                        />
                        <button
                          type="button" onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Alternar visibilidade"
                        >
                          {showPasswordConfirm ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password_confirm && <p className="text-xs text-destructive">{errors.password_confirm}</p>}
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    type="button" variant="outline" size="lg"
                    onClick={handleBack} disabled={loading}
                    className="flex-1 h-12 rounded-xl gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </Button>
                )}

                {step < 2 ? (
                  <Button
                    type="button" size="lg"
                    onClick={handleNext}
                    disabled={loading}
                    className="flex-1 h-12 rounded-xl gap-2 text-sm font-bold shadow-lg shadow-primary/20"
                  >
                    Continuar <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button" size="lg"
                    onClick={handleFinalSubmit} disabled={loading}
                    className="flex-1 h-12 rounded-xl text-sm font-bold shadow-lg shadow-primary/20"
                  >
                    {loading ? "Enviando cadastro…" : "Finalizar e enviar para análise"}
                  </Button>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Ao se cadastrar, você concorda com nossos{" "}
                <button type="button" onClick={() => navigate("/termos")} className="underline hover:text-foreground">Termos</button>{" "}
                e{" "}
                <button type="button" onClick={() => navigate("/privacidade")} className="underline hover:text-foreground">Política de Privacidade</button>.
              </p>

              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <button type="button" onClick={() => navigate("/medico")} className="text-primary hover:underline font-semibold">
                  Fazer login
                </button>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function DocDropzone({
  label, hint, file, error, onChange,
}: {
  label: string; hint: string; file: File | null; error?: string;
  onChange: (f: File | null) => void;
}) {
  const inputId = `file-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={[
          "flex items-center gap-3 p-3 rounded-xl border border-dashed cursor-pointer transition",
          file ? "border-primary/40 bg-primary/5" :
          error ? "border-destructive bg-destructive/5" :
          "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5",
        ].join(" ")}
      >
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          file ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"
        }`}>
          {file ? <FileImage weight="fill" className="w-5 h-5" /> : <UploadSimple className="w-5 h-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground truncate">{label}</span>
          <span className="block text-[11px] text-muted-foreground truncate">
            {file ? `${file.name} — ${(file.size / 1024).toFixed(0)} KB` : hint}
          </span>
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(null); }}
            className="text-muted-foreground hover:text-destructive p-1"
            aria-label="Remover arquivo"
          >
            <XCircle weight="fill" className="w-5 h-5" />
          </button>
        )}
        <input
          id={inputId} type="file" className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
