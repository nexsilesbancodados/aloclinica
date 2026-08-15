import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  User, Stethoscope, DollarSign, CalendarDays, Video, ShieldCheck,
  CheckCircle2, ChevronRight, Sparkles, ArrowRight, Trophy, Clock
} from "lucide-react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import type { SpecialtyRow } from "@/types/domain";
import { Skeleton } from "@/components/ui/skeleton";

import KycCrossDevice from "@/components/kyc/KycCrossDevice";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  path: string;
  check: (data: any) => boolean;
  estimatedMin: number;
}

const steps: OnboardingStep[] = [
  {
    id: "photo", label: "Adicionar foto profissional", description: "Foto que pacientes verão ao buscar médicos",
    icon: User, path: "/dashboard/profile", check: (d) => !!d.avatarUrl, estimatedMin: 1,
  },
  {
    id: "profile", label: "Completar perfil", description: "Bio, experiência e formação",
    icon: Stethoscope, path: "/dashboard/profile", check: (d) => !!d.docProfile?.bio && d.docProfile.bio.length > 10, estimatedMin: 3,
  },
  {
    id: "specialties", label: "Adicionar especialidades", description: "Selecione suas áreas de atuação",
    icon: Stethoscope, path: "/dashboard/profile", check: (d) => (d.specialtyCount ?? 0) > 0, estimatedMin: 1,
  },
  {
    id: "price", label: "Definir preço da consulta", description: "Valor que pacientes vão ver",
    icon: DollarSign, path: "/dashboard/profile", check: (d) => !!d.docProfile?.price && Number(d.docProfile.price) > 0, estimatedMin: 1,
  },
  {
    id: "availability", label: "Configurar disponibilidade", description: "Defina pelo menos 1 horário semanal",
    icon: CalendarDays, path: "/dashboard/availability", check: (d) => (d.slotCount ?? 0) > 0, estimatedMin: 2,
  },
  {
    id: "camera", label: "Testar câmera e microfone", description: "Garanta que tudo funciona para consultas",
    icon: Video, path: "/dashboard/doctor/waiting-room", check: (d) => d.cameraChecked, estimatedMin: 1,
  },
  {
    id: "kyc", label: "Verificação KYC", description: "Validação facial e do documento",
    icon: ShieldCheck, path: "#kyc", check: (d) => d.docProfile?.kyc_status === "approved" || d.docProfile?.kyc_status === "verified", estimatedMin: 3,
  },
  {
    id: "approval", label: "Aprovação do CRM", description: "Verificação administrativa obrigatória",
    icon: ShieldCheck, path: "/dashboard/profile", check: (d) => !!d.docProfile?.is_approved, estimatedMin: 0,
  },
];

const CAMERA_CHECK_KEY = "doctor-camera-checked";

const motivationalMessages = [
  "Você está quase lá! 🚀",
  "Pacientes já estão buscando médicos como você! 💚",
  "Cada passo conta para sua presença online! ✨",
  "Falta pouco para começar a atender! 🩺",
];

const DoctorOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showKYC, setShowKYC] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const docRes = await db.from("doctor_profiles").select("id, bio, price, is_approved, crm_verified, crm").eq("user_id", user.id).single();

      const docProfile = docRes.data as any;
      if (!docProfile) return;

      // Fetch kyc_status separately since it may not be in generated types yet
      const { data: kycData } = await db.from("doctor_profiles").select("kyc_status" as any).eq("id", docProfile.id).single();
      if (kycData) docProfile.kyc_status = (kycData as any).kyc_status;

      const [specRes, slotRes, profileRes] = await Promise.all([
        db.from("doctor_specialties").select("id", { count: "exact", head: true }).eq("doctor_id", docProfile.id),
        db.from("availability_slots").select("id", { count: "exact", head: true }).eq("doctor_id", docProfile.id),
        db.from("profiles").select("avatar_url").eq("user_id", user.id).single(),
      ]);

      setData({
        docProfile,
        specialtyCount: specRes.count ?? 0,
        slotCount: slotRes.count ?? 0,
        avatarUrl: profileRes.data?.avatar_url ?? null,
        cameraChecked: localStorage.getItem(CAMERA_CHECK_KEY) === "true",
      });
    };
    fetchData();
  }, [user]);

  if (!data || dismissed) return null;

  const completedSteps = steps.filter(s => s.check(data));
  const pendingSteps = steps.filter(s => !s.check(data));
  const percentage = Math.round((completedSteps.length / steps.length) * 100);
  const remainingMinutes = pendingSteps.reduce((acc, s) => acc + s.estimatedMin, 0);
  const nextStep = pendingSteps[0];

  if (percentage === 100) return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-5">
      <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-primary/5 overflow-hidden">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-foreground">Perfil completo! 🎉</p>
            <p className="text-xs text-muted-foreground mt-0.5">Você está visível para pacientes e pronto para atender.</p>
          </div>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setDismissed(true)}>Fechar</Button>
        </CardContent>
      </Card>
    </motion.div>
  );

  const motivational = motivationalMessages[completedSteps.length % motivationalMessages.length];

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">Complete seu perfil</p>
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{percentage}%</Badge>
            </div>
            <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6" onClick={() => setDismissed(true)}>
              Fechar
            </Button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11px] text-muted-foreground flex-1">{motivational}</p>
            {remainingMinutes > 0 && (
              <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                <Clock className="w-3 h-3" />
                ~{remainingMinutes} min restantes
              </Badge>
            )}
          </div>

          <Progress value={percentage} className="h-1.5 mb-4" />

          {/* Motivational stats strip */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Pacientes/mês</p>
              <p className="text-sm font-extrabold text-foreground mt-0.5">+50</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2 text-center">
              <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Receita estim.</p>
              <p className="text-sm font-extrabold text-foreground mt-0.5">R$ 8k+</p>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2 text-center">
              <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide">Tempo médio</p>
              <p className="text-sm font-extrabold text-foreground mt-0.5">24h</p>
            </div>
          </div>

          {/* Next step highlight */}
          {nextStep && (
            <button
              onClick={() => nextStep.id === "kyc" ? setShowKYC(true) : navigate(nextStep.path)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all mb-3 text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <nextStep.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary">Próximo passo</p>
                <p className="text-sm font-semibold text-foreground">{nextStep.label}</p>
                <p className="text-[10px] text-muted-foreground">{nextStep.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-primary shrink-0" />
            </button>
          )}

          <div className="space-y-1">
            {steps.map((step) => {
              const done = step.check(data);
              if (step.id === nextStep?.id) return null;
              return (
                <button
                  key={step.id}
                  onClick={() => {
                    if (done) return;
                    if (step.id === "kyc") { setShowKYC(true); return; }
                    navigate(step.path);
                  }}
                  disabled={done}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all ${
                    done
                      ? "bg-emerald-500/5 border border-emerald-500/15 opacity-70"
                      : "bg-card border border-border/40 hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/15" : "bg-muted/60"}`}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <step.icon className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold ${done ? "text-emerald-600 line-through" : "text-foreground"}`}>{step.label}</p>
                  </div>
                  {!done && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* KYC Verification via Didit */}
      {showKYC && data?.docProfile && (
        <div className="mt-4">
          <KycCrossDevice
            tipo="medico"
            onComplete={(result) => {
              setShowKYC(false);
              setData((prev: any) => ({
                ...prev,
                docProfile: { ...prev.docProfile, kyc_status: result.status === "aprovado" || result.match ? "approved" : "pending" },
              }));
            }}
            variant="full"
          />
        </div>
      )}
    </motion.div>
  );
};

export default DoctorOnboarding;
