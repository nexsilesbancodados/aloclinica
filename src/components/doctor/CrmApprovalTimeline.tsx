/**
 * CrmApprovalTimeline — mostra ao médico em qual etapa da aprovação ele está.
 *
 * 4 etapas:
 *   1. Cadastro recebido      (sempre done assim que chega aqui)
 *   2. Verificação CRM/CFM    (cfm_verified)
 *   3. KYC biométrico         (kyc_status === approved)
 *   4. Aprovação compliance   (is_approved)
 *
 * Quando algum step trava por mais de 48h, mostramos o atalho pra falar com suporte.
 */
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, ShieldCheck, FileText, UserCheck, Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type DoctorApproval = {
  created_at?: string | null;
  cfm_verified?: boolean | null;
  cfm_verified_at?: string | null;
  kyc_status?: string | null;
  kyc_verified_at?: string | null;
  is_approved?: boolean | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
};

type Step = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  done: boolean;
  doneAt?: string | null;
  failed?: boolean;
  reason?: string | null;
};

function buildSteps(d: DoctorApproval): Step[] {
  return [
    {
      id: "received",
      label: "Cadastro recebido",
      description: "Recebemos seus dados profissionais.",
      icon: FileText,
      done: true,
      doneAt: d.created_at,
    },
    {
      id: "crm",
      label: "Verificação no CFM",
      description: "Confirmamos seu CRM ativo no Conselho Federal de Medicina.",
      icon: ShieldCheck,
      done: !!d.cfm_verified,
      doneAt: d.cfm_verified_at,
    },
    {
      id: "kyc",
      label: "Verificação biométrica",
      description: "Confirmamos sua identidade comparando documento e selfie.",
      icon: UserCheck,
      done: d.kyc_status === "approved" || d.kyc_status === "verified",
      doneAt: d.kyc_verified_at,
      failed: d.kyc_status === "rejected" || d.kyc_status === "reprovado",
    },
    {
      id: "approval",
      label: "Aprovação final",
      description: "Time de compliance valida seu perfil. Costumam levar até 24h úteis.",
      icon: CheckCircle2,
      done: !!d.is_approved,
      doneAt: d.approved_at,
      failed: d.rejection_reason ? true : false,
      reason: d.rejection_reason,
    },
  ];
}

type Props = {
  doctor: DoctorApproval | null | undefined;
  /** Quando true, mostra mesmo já aprovado (útil pra histórico). Default: esconde. */
  alwaysShow?: boolean;
};

export default function CrmApprovalTimeline({ doctor, alwaysShow = false }: Props) {
  if (!doctor) return null;
  if (!alwaysShow && doctor.is_approved) return null;

  const steps = buildSteps(doctor);
  const currentIndex = steps.findIndex(s => !s.done && !s.failed);
  const failedStep = steps.find(s => s.failed);
  const fullyApproved = steps.every(s => s.done);

  // Detecta travas: cadastro >48h sem aprovação final
  const hoursWaiting = doctor.created_at
    ? differenceInHours(new Date(), new Date(doctor.created_at))
    : 0;
  const stuckTooLong = hoursWaiting > 48 && !fullyApproved && !failedStep;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {failedStep ? (
            <AlertCircle className="w-4 h-4 text-destructive" />
          ) : fullyApproved ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Clock className="w-4 h-4 text-blue-500" />
          )}
          Status da sua aprovação
        </CardTitle>
        {!fullyApproved && !failedStep && (
          <p className="text-xs text-muted-foreground">
            Tempo médio de aprovação: <span className="font-semibold text-foreground">24h úteis</span>
          </p>
        )}
        {fullyApproved && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Tudo certo! Você está visível para pacientes.
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <ol className="relative space-y-4 ml-2">
          {/* Linha vertical */}
          <span aria-hidden className="absolute left-[14px] top-3 bottom-3 w-px bg-border" />

          {steps.map((step, i) => {
            const Icon = step.icon;
            const isCurrent = i === currentIndex;
            return (
              <li key={step.id} className="relative pl-10">
                {/* Bolinha */}
                <span
                  className={cn(
                    "absolute left-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center border-2",
                    step.done && "bg-emerald-500 border-emerald-500 text-white",
                    step.failed && "bg-destructive border-destructive text-white",
                    !step.done && !step.failed && isCurrent && "bg-blue-500/15 border-blue-500 text-blue-500 animate-pulse",
                    !step.done && !step.failed && !isCurrent && "bg-card border-border text-muted-foreground/40"
                  )}
                >
                  {step.done ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : step.failed ? <AlertCircle className="w-3.5 h-3.5" />
                    : <Icon className="w-3.5 h-3.5" />}
                </span>

                <div className="min-h-[42px]">
                  <p className={cn(
                    "text-sm font-semibold",
                    step.done && "text-foreground",
                    step.failed && "text-destructive",
                    !step.done && !step.failed && "text-muted-foreground"
                  )}>
                    {step.label}
                    {isCurrent && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-500">Em análise</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                  {step.doneAt && step.done && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {format(new Date(step.doneAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                  {step.failed && step.reason && (
                    <p className="text-xs text-destructive mt-1.5 p-2 rounded-md bg-destructive/5 border border-destructive/15">
                      <strong>Motivo:</strong> {step.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {(stuckTooLong || failedStep) && (
          <div className="mt-5 pt-4 border-t border-border/40 space-y-2">
            <p className="text-xs text-muted-foreground">
              {failedStep
                ? "Algo travou. Fale com nosso time pra reabrir o processo:"
                : `Sua aprovação está parada há ${formatDistanceToNow(new Date(doctor.created_at!), { locale: ptBR })}. Quer um empurrão?`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="mailto:medicos@aloclinica.com.br?subject=Status%20da%20minha%20aprova%C3%A7%C3%A3o%20CRM">
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20o%20status%20da%20minha%20aprova%C3%A7%C3%A3o%20m%C3%A9dica%20na%20AloCl%C3%ADnica"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
                </a>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
