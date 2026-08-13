import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { SUPABASE_FUNCTIONS_URL } from "@/lib/supabase-config";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Camera, Save, Trash2, AlertTriangle, ChevronRight, User, Clock, Bell, HelpCircle, LogOut, Shield, Heart, Pencil, ShieldCheck, Upload } from "lucide-react";
import KycCrossDevice from "@/components/kyc/KycCrossDevice";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getDoctorNav } from "@/components/doctor/doctorNav";
import { getPatientNav } from "@/components/patient/patientNav";
import { getAdminNav } from "@/components/admin/adminNav";
import { getReceptionNav } from "@/components/reception/receptionNav";
import { motion } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

const roleLabels: Record<string, string> = {
  patient: "Paciente", doctor: "Médico", admin: "Administração",
  receptionist: "Recepção", support: "Suporte", clinic: "Clínica", partner: "Parceiro",
};

function getNavForRole(role: string) {
  switch (role) {
    case "doctor": return getDoctorNav("profile");
    case "patient": return getPatientNav("profile");
    case "admin": return getAdminNav("profile");
    case "receptionist": return getReceptionNav("profile");
    default: return [];
  }
}

const KYC_PENDING_KEY = "aloclinica_kyc_pending";

const UserProfile = () => {
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const forceRole = searchParams.get("role");
  const openKyc = searchParams.get("kyc") === "open";
  // Feedback do callback OAuth do Mercado Pago
  useEffect(() => {
    const mp = searchParams.get("mp");
    if (mp === "ok") toast.success("Conta Mercado Pago conectada ✅");
    if (mp === "err") toast.error("Falha ao conectar o Mercado Pago", { description: searchParams.get("reason") || undefined });
  }, [searchParams]);
  const isAdmin = roles.includes("admin");
  const activeRole = isAdmin ? (forceRole || "admin")
    : roles.includes("doctor") ? "doctor"
    : roles.includes("receptionist") ? "receptionist"
    : roles.includes("support") ? "support"
    : roles.includes("clinic") ? "clinic"
    : roles.includes("partner") ? "partner"
    : "patient";
  const nav = getNavForRole(activeRole);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [allergies, setAllergies] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [chronicConditions, setChronicConditions] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showKyc, setShowKyc] = useState(openKyc);
  const [kycPending, setKycPending] = useState(localStorage.getItem(KYC_PENDING_KEY) === "true");
  const [kycSaving, setKycSaving] = useState(false);
  const [kycVerified, setKycVerified] = useState(false);

  // Doctor fields
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [education, setEducation] = useState("");
  const [experienceYears, setExperienceYears] = useState(0);
  const [consultationPrice, setConsultationPrice] = useState(89);
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [doctorCareAreas, setDoctorCareAreas] = useState<string[]>([]);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [mpUserId, setMpUserId] = useState<string | null>(null);
  const [mpConnectedAt, setMpConnectedAt] = useState<string | null>(null);
  const [disconnectingMp, setDisconnectingMp] = useState(false);
  const isDoctor = roles.includes("doctor");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setPhone(profile.phone || "");
      setCpf(profile.cpf || "");
      setDateOfBirth(profile.date_of_birth || "");
      setState((profile as { state?: string }).state ?? "");
      setCity((profile as { city?: string }).city ?? "");
      setAvatarUrl(profile.avatar_url);
      setAllergies(((profile as { allergies?: string[] }).allergies ?? []).join(", "));
      setBloodType((profile as { blood_type?: string }).blood_type ?? "");
      setChronicConditions(((profile as { chronic_conditions?: string[] }).chronic_conditions ?? []).join(", "));
    }
    if (isDoctor && user) fetchDoctorProfile();
  }, [profile, user]);

  // Check KYC verification status
  useEffect(() => {
    if (!user) return;
    db
      .from("kyc_verificacoes")
      .select("status")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .limit(1)
      .then(({ data }) => {
        setKycVerified(!!data?.length);
      });
  }, [user]);

  const fetchDoctorProfile = async () => {
    const { data } = await db.from("doctor_profiles").select("id, bio, education, experience_years, consultation_price, display_name, mp_user_id, mp_connected_at").eq("user_id", user!.id).single();
    if (data) {
      setDoctorProfileId(data.id);
      setMpUserId((data as any).mp_user_id ?? null);
      setMpConnectedAt((data as any).mp_connected_at ?? null);
      setBio(data.bio || ""); setEducation(data.education || "");
      setDisplayName((data as any).display_name || "");
      setExperienceYears(data.experience_years || 0); setConsultationPrice(Number(data.consultation_price) || 89);
      const [specRes, careRes] = await Promise.all([
        db.from("doctor_specialties").select("specialty_id").eq("doctor_id", data.id),
        db.from("doctor_care_areas" as any).select("area_name").eq("doctor_id", data.id),
      ]);
      if (specRes.data?.length) {
        const specIds = specRes.data.map((s: any) => s.specialty_id);
        const { data: specs } = await db.from("specialties").select("price_min, price_max").in("id", specIds);
        if (specs?.length) {
          const mins = (specs as any[]).map(s => s.price_min).filter((v: any) => v != null);
          const maxs = (specs as any[]).map(s => s.price_max).filter((v: any) => v != null);
          setPriceMin(mins.length > 0 ? Math.min(...mins) : null);
          setPriceMax(maxs.length > 0 ? Math.max(...maxs) : null);
        }
      }
      setDoctorCareAreas((careRes.data as any[])?.map((c: any) => c.area_name) ?? []);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await db.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro no upload", { description: error.message }); setUploading(false); return; }
    const { data: { publicUrl } } = db.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(publicUrl);
    await db.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
    toast.success("Foto atualizada!"); setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const allergyArr = allergies.split(",").map(s => s.trim()).filter(Boolean);
    const conditionArr = chronicConditions.split(",").map(s => s.trim()).filter(Boolean);
    const { error } = await db.from("profiles").update({
      first_name: firstName, last_name: lastName, phone, cpf, date_of_birth: dateOfBirth || null,
      state: state ? state.toUpperCase().slice(0, 2) : null,
      city: city.trim() || null,
      allergies: allergyArr, blood_type: bloodType || null, chronic_conditions: conditionArr,
    }).eq("user_id", user.id);
    if (isDoctor) {
      if (priceMin !== null && consultationPrice < priceMin) { toast.error(`Preço mínimo: R$ ${priceMin.toFixed(0)}`); setSaving(false); return; }
      if (priceMax !== null && consultationPrice > priceMax) { toast.error(`Preço máximo: R$ ${priceMax.toFixed(0)}`); setSaving(false); return; }
      // `price` é o nome na TABELA; `consultation_price` só existe na view
      // `doctor_profiles_public`. Gravar o nome da view aqui fazia o UPDATE
      // inteiro falhar (42703) — o médico salvava o perfil e o preço não mudava.
      const { error: docError } = await db.from("doctor_profiles").update({ bio, education, experience_years: experienceYears, price: consultationPrice, display_name: displayName.trim() || null } as any).eq("user_id", user.id);
      if (docError) { toast.error("Erro ao salvar dados do médico", { description: docError.message }); setSaving(false); return; }
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else { toast.success("Perfil atualizado!"); setEditMode(false); }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await db.from("activity_logs").insert({ action: "account_deletion_request", entity_type: "user", entity_id: user.id, user_id: user.id, details: { email: user.email, requested_at: new Date().toISOString() } });
      await db.from("profiles").update({ first_name: "Usuário", last_name: "Removido", phone: null, cpf: null, date_of_birth: null, avatar_url: null, allergies: null, blood_type: null, chronic_conditions: null }).eq("user_id", user.id);
      await db.auth.signOut();
      toast.success("Conta excluída", { description: "Seus dados foram anonimizados conforme a LGPD." });
      navigate("/");
    } catch (err: unknown) { toast.error("Erro", { description: err instanceof Error ? err.message : "Erro desconhecido" }); }
    finally { setDeleting(false); }
  };

  const handleLogout = async () => {
    await db.auth.signOut();
    navigate("/");
  };

  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
  const isPatient = activeRole === "patient";

  const handleKycSessionCreated = () => {
    localStorage.removeItem(KYC_PENDING_KEY);
    setKycPending(false);
    setShowKyc(false);
    toast.success("Verificação iniciada!", { description: "Complete o processo na aba aberta." });
  };

  const menuItems = [
    { icon: Pencil, label: "Editar Perfil", desc: "Altere seus dados pessoais e fotos", action: () => setEditMode(true) },
    ...(isPatient && kycPending ? [{ icon: ShieldCheck, label: "Verificação de Identidade", desc: "⚠️ Pendente — Complete para agendar consultas", action: () => setShowKyc(true) }] : []),
    { icon: Bell, label: "Notificações", desc: "Gerencie alertas de consultas e exames", action: () => navigate(`/dashboard/settings?role=${activeRole}&tab=notifications`) },
    { icon: Shield, label: "Segurança", desc: "Alterar senha e biometria", action: () => navigate(`/dashboard/settings?role=${activeRole}&tab=security`) },
    ...(activeRole !== "admin" ? [{ icon: HelpCircle, label: "Ajuda", desc: "Central de suporte e FAQ", action: () => navigate("/dashboard/patient/support?role=patient") }] : []),
  ];

  // Profile view (not editing)
  if (!editMode) {
    return (
      <DashboardLayout title={roleLabels[activeRole] ?? "Perfil"} nav={nav} role={activeRole}>
        <div className="max-w-2xl mx-auto pb-24 md:pb-6">
          <button onClick={() => navigate(`/dashboard?role=${activeRole}`)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          {/* Profile Header Card */}
          <div className="rounded-2xl bg-gradient-to-b from-primary/5 to-transparent p-6 pb-8 text-center mb-6">
            <div className="relative inline-block mb-4">
              <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">{initials}</AvatarFallback>
              </Avatar>
              <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:opacity-90 transition active:scale-95 shadow-md">
                <Camera className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
            </div>
          <h2 className="text-xl font-extrabold text-foreground font-[Manrope] flex items-center justify-center gap-2">
              {firstName} {lastName}
            </h2>
            <p className="text-sm text-muted-foreground mb-2">{user?.email}</p>
            {isPatient && kycVerified && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Identidade Verificada</span>
              </motion.div>
            )}
            {isPatient && !kycVerified && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowKyc(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors shadow-[0_0_12px_rgba(245,158,11,0.1)]"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Verificar Identidade</span>
              </motion.button>
            )}
            {isPatient && (
              <div className="flex justify-center gap-3 mt-4">
                {bloodType && (
                  <div className="px-4 py-2 rounded-xl bg-card border border-border/30 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo Sanguíneo</p>
                    <p className="text-lg font-extrabold text-foreground">{bloodType}</p>
                  </div>
                )}
                <div className="px-4 py-2 rounded-xl bg-card border border-border/30 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Próxima Consulta</p>
                  <p className="text-lg font-extrabold text-foreground">—</p>
                </div>
              </div>
            )}
          </div>

          {/* KYC via Didit */}
          {showKyc && isPatient && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/20 bg-card p-5 mb-6">
              <KycCrossDevice
                onComplete={() => setShowKyc(false)}
                variant="full"
              />
              <button onClick={() => setShowKyc(false)} className="w-full text-center text-xs text-muted-foreground mt-3 hover:text-foreground transition-colors">
                Cancelar
              </button>
            </motion.div>
          )}

          {/* Menu Items */}
          <div className="rounded-2xl bg-card border border-border/30 overflow-hidden mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-5 pt-4 pb-2">
              {isPatient ? "Configurações e Segurança" : "Minha Conta"}
            </h3>
            {menuItems.map((item, i) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={item.action}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
              </motion.button>
            ))}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors text-left mb-6"
          >
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-destructive">Sair</p>
              <p className="text-xs text-destructive/60">Encerrar sessão no dispositivo</p>
            </div>
          </button>

          {/* Account Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/30 bg-card p-5 mb-6"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
              Informações da Conta
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Membro desde</span>
                <span className="text-xs font-semibold text-foreground">{user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tipo de perfil</span>
                <span className="text-xs font-semibold text-foreground">{roleLabels[activeRole] ?? activeRole}</span>
              </div>
              {cpf && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">CPF</span>
                  <span className="text-xs font-semibold text-foreground font-mono">***.***.***-{cpf.replace(/\D/g, "").slice(-2)}</span>
                </div>
              )}
               <div className="flex items-center justify-between">
                 <span className="text-xs text-muted-foreground">Status KYC</span>
                 <span className={`text-xs font-bold ${kycVerified ? "text-emerald-500" : "text-amber-500"}`}>
                   {kycVerified ? "✓ Verificado" : "⚠ Pendente"}
                 </span>
               </div>
               {isDoctor && (
                 <div className="flex items-center justify-between border-t border-border/10 pt-3 mt-1">
                   <span className="text-xs text-muted-foreground">Assinatura Digital</span>
                   <div className="flex items-center gap-1.5">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-xs font-bold text-emerald-500">e-CPF Ativo</span>
                   </div>
                 </div>
               )}
            </div>
          </motion.div>

          {/* Saúde em Foco Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl bg-gradient-to-br from-primary via-primary to-[hsl(215,75%,35%)] p-5 text-primary-foreground mb-6 shadow-xl shadow-primary/20"
          >
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-primary-foreground/60" />
              <h4 className="font-[Manrope] font-bold text-lg">Saúde em Foco</h4>
            </div>
            <p className="text-sm text-primary-foreground/60 mt-0.5">Acompanhe sua jornada de bem-estar</p>
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-foreground/40">Score Vital</p>
              </div>
              <p className="font-[Manrope] text-[32px] font-extrabold leading-none">9.2</p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-primary-foreground/20 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "92%" }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                className="h-full rounded-full bg-primary-foreground"
              />
            </div>
          </motion.div>

          {/* Version footer */}
          <p className="text-center text-[10px] font-medium text-muted-foreground/30 tracking-[0.2em] uppercase mb-2">
            AloClínica v2.5.0 · Clinical Sanctuary
          </p>
        </div>
      </DashboardLayout>
    );
  }

  // Edit mode
  return (
    <DashboardLayout title={roleLabels[activeRole] ?? "Perfil"} nav={nav} role={activeRole}>
      <div className="max-w-2xl mx-auto pb-24 md:pb-6">
        <button onClick={() => setEditMode(false)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-2xl font-extrabold text-primary font-[Manrope] mb-1">Editar Perfil</h1>
        <p className="text-sm text-muted-foreground mb-6">Mantenha suas informações de saúde atualizadas.</p>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <Avatar className="w-28 h-28 border-4 border-background shadow-lg">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <label className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:opacity-90 transition active:scale-95 shadow-lg">
              <Camera className="w-4 h-4" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
          <p className="text-sm text-primary font-medium mt-2">Alterar foto de perfil</p>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          <div>
            <Label className="text-sm">Nome completo</Label>
            <div className="relative mt-1">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <Input value={`${firstName} ${lastName}`} onChange={e => { const parts = e.target.value.split(" "); setFirstName(parts[0] || ""); setLastName(parts.slice(1).join(" ") || ""); }} className="pl-11 h-12 rounded-xl bg-muted/30 border-transparent" />
            </div>
          </div>
          <div>
            <Label className="text-sm">E-mail</Label>
            <Input value={user?.email ?? ""} disabled className="h-12 rounded-xl bg-muted/30 border-transparent mt-1" />
          </div>
          <div>
            <Label className="text-sm">Telefone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="h-12 rounded-xl bg-muted/30 border-transparent mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label className="text-sm">Estado</Label>
              <Input value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} className="h-12 rounded-xl bg-muted/30 border-transparent mt-1 uppercase" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">Cidade</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="São Paulo" className="h-12 rounded-xl bg-muted/30 border-transparent mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-sm">Senha</Label>
            <Input type="password" value="••••••••" disabled className="h-12 rounded-xl bg-muted/30 border-transparent mt-1" />
          </div>
        </div>

        {/* Mercado Pago Marketplace (médico) */}
        {isDoctor && (() => {
          const appId = (import.meta as any).env?.VITE_MP_APP_ID;
          const userId = user?.id ?? "";
          const redirect = encodeURIComponent(`${SUPABASE_FUNCTIONS_URL}/mp-oauth-callback`);
          const oauthUrl = appId
            ? `https://auth.mercadopago.com.br/authorization?client_id=${appId}&response_type=code&platform_id=mp&state=${userId}&redirect_uri=${redirect}`
            : null;
          const disconnect = async () => {
            if (!confirm("Desconectar sua conta Mercado Pago? Os próximos pagamentos voltam a cair na conta da plataforma.")) return;
            setDisconnectingMp(true);
            try {
              const { error } = await db.from("doctor_profiles").update({
                mp_user_id: null, mp_access_token: null, mp_refresh_token: null,
                mp_token_expires_at: null, mp_connected_at: null,
              } as any).eq("user_id", user!.id);
              if (error) throw error;
              setMpUserId(null); setMpConnectedAt(null);
              toast.success("Conta Mercado Pago desconectada");
            } catch (e: any) {
              toast.error("Erro ao desconectar", { description: e?.message });
            } finally { setDisconnectingMp(false); }
          };
          return (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Recebimento Mercado Pago</CardTitle>
              </CardHeader>
              <CardContent>
                {mpUserId ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center"><Shield className="w-5 h-5 text-success" /></div>
                      <div>
                        <p className="font-semibold text-foreground">Conta conectada</p>
                        <p className="text-xs text-muted-foreground">
                          ID MP {mpUserId}{mpConnectedAt ? ` · desde ${new Date(mpConnectedAt).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={disconnect} disabled={disconnectingMp}>
                      {disconnectingMp ? "Desconectando…" : "Desconectar"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Conecte sua conta Mercado Pago para receber 90% do valor de cada consulta diretamente, sem espera de repasse.
                    </p>
                    {oauthUrl ? (
                      <Button asChild className="rounded-xl gap-2 h-11">
                        <a href={oauthUrl}>Conectar Mercado Pago</a>
                      </Button>
                    ) : (
                      <p className="text-xs text-amber-600">
                        ⚠️ O administrador da plataforma precisa configurar <code>VITE_MP_APP_ID</code> (build) e <code>MERCADOPAGO_APP_ID</code>/<code>MERCADOPAGO_CLIENT_SECRET</code> (edge functions) antes de habilitar a conexão.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Doctor fields */}
        {isDoctor && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Perfil Profissional</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome de exibição</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: Dr. João, Dra. Maria" className="mt-1 h-11 rounded-xl" />
                <p className="text-[11px] text-muted-foreground mt-0.5">Nome que pacientes verão ao buscar médicos.</p>
              </div>
              <div><Label>Bio</Label><textarea value={bio} onChange={e => setBio(e.target.value)} className="mt-1 w-full rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm" rows={3} /></div>
              <div><Label>Formação</Label><Input value={education} onChange={e => setEducation(e.target.value)} className="mt-1 h-11 rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Anos de Experiência</Label><Input type="number" value={experienceYears} onChange={e => setExperienceYears(Number(e.target.value))} className="mt-1 h-11 rounded-xl" min={0} /></div>
                <div>
                  <Label>Preço (R$)</Label>
                  <Input type="number" value={consultationPrice} onChange={e => setConsultationPrice(Number(e.target.value))} className="mt-1 h-11 rounded-xl" min={priceMin ?? 0} max={priceMax ?? undefined} />
                  {(priceMin !== null || priceMax !== null) && <p className="text-xs text-muted-foreground mt-1">R$ {priceMin?.toFixed(0) ?? "—"} ~ R$ {priceMax?.toFixed(0) ?? "—"}</p>}
                </div>
              </div>
              {/* Care Areas */}
              <div>
                <Label>Áreas de Atendimento</Label>
                <p className="text-xs text-muted-foreground mb-2">Condições que você mais atende (ex: Infecção Urinária, Enxaqueca)</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {doctorCareAreas.map(a => (
                    <Badge key={a} className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs py-1 px-2.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={async () => {
                      if (!doctorProfileId) return;
                      await db.from("doctor_care_areas" as any).delete().eq("doctor_id", doctorProfileId).eq("area_name", a);
                      setDoctorCareAreas(prev => prev.filter(x => x !== a));
                      toast.success("Área removida");
                    }}>
                      {a} ✕
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar área de atendimento..."
                    className="h-10 rounded-xl flex-1"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val || !doctorProfileId || doctorCareAreas.includes(val)) return;
                        await db.from("doctor_care_areas" as any).insert({ doctor_id: doctorProfileId, area_name: val });
                        setDoctorCareAreas(prev => [...prev, val]);
                        (e.target as HTMLInputElement).value = "";
                        toast.success("Área adicionada");
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save */}
        <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-full bg-gradient-to-r from-primary to-[hsl(215,75%,40%)] text-primary-foreground font-bold shadow-lg" size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
        <button onClick={() => setEditMode(false)} className="w-full text-center text-sm text-primary font-semibold mt-3 hover:underline">Cancelar</button>

        {/* Delete Account */}
        <Card className="border-destructive/30 mt-8">
          <CardHeader><CardTitle className="text-lg text-destructive flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Zona de Perigo</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Conforme a LGPD, você pode solicitar a exclusão dos seus dados pessoais.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="rounded-xl"><Trash2 className="w-4 h-4 mr-2" /> Excluir minha conta</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação é irreversível. Seus dados serão anonimizados conforme a LGPD.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleting ? "Excluindo..." : "Sim, excluir minha conta"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UserProfile;
