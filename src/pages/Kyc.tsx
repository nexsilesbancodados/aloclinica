/**
 * Página /kyc — verificação biométrica direta (same-device).
 *
 * Diferente de /kyc-mobile (cross-device com QR token), esta é a versão
 * simples para quando o usuário está no celular ou tem câmera no desktop.
 *
 * Aceita ?return=/caminho para voltar ao fluxo original após aprovação
 * (usado por KycRequiredGate em BookAppointment, VideoRoom etc).
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import BiometricKYC from "@/components/kyc/BiometricKYC";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, ShieldCheck, Lock, Sparkles, Zap, Eye, FileCheck2, ArrowRight, Home, ScrollText, UserCheck, Fingerprint } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import pingoSeguranca from "@/assets/pingo-seguranca.png";
import { db } from "@/integrations/supabase/untyped";

export default function Kyc() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("return") || "/dashboard";
  const [done, setDone] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [biometricAccepted, setBiometricAccepted] = useState(false);

  const allConsents = termsAccepted && privacyAccepted && biometricAccepted;

  // Decide tipo (paciente vs medico) com base nos roles
  const isDoctor = roles.includes("doctor");
  const tipo = isDoctor ? "medico" : "paciente";

  // Label contextual do botão "Voltar" baseado no fluxo de origem
  const returnContext = (() => {
    if (returnTo.includes("/agendar") || returnTo.includes("/book")) {
      return { label: "Voltar ao agendamento", icon: ArrowRight };
    }
    if (returnTo.includes("/teleconsulta") || returnTo.includes("/video")) {
      return { label: "Entrar na consulta", icon: ArrowRight };
    }
    if (returnTo === "/dashboard" || returnTo.includes("/dashboard")) {
      return { label: "Ir para o painel", icon: Home };
    }
    return { label: "Continuar", icon: ArrowRight };
  })();

  useEffect(() => {
    if (!loading && !user) {
      // Sem login → vai pra autenticação correspondente
      navigate(isDoctor ? "/medico" : "/paciente", { replace: true });
    }
  }, [user, loading, navigate, isDoctor]);

  // Dispara e-mail de confirmação quando KYC for aprovado
  const sendApprovalEmail = async (result: { match: boolean; score: number; nome?: string | null }) => {
    if (!user?.email) return;
    try {
      const name = result.nome || user.user_metadata?.full_name || user.email.split("@")[0];
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await db.functions.invoke("send-email", {
        body: {
          type: "kyc_approved",
          to: user.email,
          data: {
            name,
            score: String(Math.round(result.score)),
            verified_at: new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" }),
            return_url: `${origin}${returnTo}`,
            return_label: returnContext.label,
          },
        },
      });
    } catch (e) {
      // Falha de e-mail não bloqueia o fluxo
      console.warn("[KYC] Falha ao enviar e-mail de aprovação:", e);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (done) {
    const Icon = returnContext.icon;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-background to-emerald-50/50 dark:from-emerald-950/20 dark:to-background relative overflow-hidden">
        <SEOHead title="Verificação concluída — AloClínica" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <Card className="max-w-md w-full relative border-emerald-500/20 shadow-2xl shadow-emerald-500/10 rounded-3xl">
          <CardHeader className="text-center pt-8">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/40 ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <CardTitle className="text-2xl font-extrabold tracking-tight">Tudo certo, {' '}
              <span className="bg-gradient-to-r from-emerald-500 to-emerald-700 bg-clip-text text-transparent">verificado!</span>
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              Sua identidade foi confirmada com segurança. Enviamos um e-mail de confirmação para <strong>{user.email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8 space-y-3">
            <Button
              onClick={() => navigate(returnTo, { replace: true })}
              className="w-full h-12 rounded-2xl font-bold shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              size="lg"
            >
              <Icon className="w-4 h-4 mr-2" />
              {returnContext.label}
            </Button>
            {returnTo !== "/dashboard" && (
              <Button
                variant="ghost"
                onClick={() => navigate("/dashboard", { replace: true })}
                className="w-full h-11 rounded-2xl text-sm text-muted-foreground hover:text-foreground"
              >
                <Home className="w-4 h-4 mr-2" />
                Ir para o painel
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <SEOHead title="Verificação de identidade — AloClínica" />

      {/* Ambient glow */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/15 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-secondary/15 blur-3xl pointer-events-none" aria-hidden />

      <div className="relative max-w-6xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start">
          {/* LEFT — Brand & trust */}
          <aside className="lg:sticky lg:top-12 space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Verificação por IA · LGPD</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
                Confirme que é{' '}
                <span className="bg-gradient-to-br from-primary via-primary to-secondary bg-clip-text text-transparent">
                  você mesmo
                </span>{' '}
                em menos de 1 minuto.
              </h1>
              <p className="text-base text-muted-foreground mt-4 leading-relaxed max-w-lg">
                Uma etapa rápida que protege você e seu {isDoctor ? "paciente" : "médico"}. 
                Nossa IA compara o documento com sua selfie usando criptografia de ponta a ponta.
              </p>
            </div>

            {/* Pingo card */}
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-5">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/15 blur-2xl" aria-hidden />
              <div className="relative flex items-center gap-4">
                <img src={pingoSeguranca} alt="Pingo, mascote da AloClínica" className="w-24 h-24 object-contain drop-shadow-xl shrink-0" />
                <div>
                  <p className="text-sm font-bold text-foreground">Oi, eu sou o Pingo 🐧</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Vou te guiar passo a passo. Seus dados ficam <span className="font-semibold text-foreground">criptografados</span> e nunca são compartilhados com terceiros.
                  </p>
                </div>
              </div>
            </div>

            {/* Trust grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Lock, label: "Criptografia AES-256", sub: "Ponta a ponta" },
                { icon: Zap, label: "Análise em < 30s", sub: "IA em tempo real" },
                { icon: Eye, label: "LGPD compliant", sub: "Lei 13.709/2018" },
                { icon: FileCheck2, label: "Conforme CFM", sub: "Telemedicina segura" },
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-3.5 hover:border-primary/30 hover:-translate-y-0.5 transition-all">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-bold text-foreground leading-tight">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Tecnologia auditada · ISO 27001 ready · Dados hospedados no Brasil</span>
            </div>
          </aside>

          {/* RIGHT — Consent or Verification card */}
          <main className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 via-secondary/15 to-primary/20 rounded-[2rem] blur-xl opacity-60" aria-hidden />
            <div className="relative rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/10 p-5 sm:p-6">
              {!consentGiven ? (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                      <ScrollText className="w-7 h-7 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Consentimento para verificação</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Antes de iniciar a verificação biométrica, você precisa aceitar os termos abaixo. Seus dados são protegidos pela LGPD.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Termos de Uso */}
                    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 hover:border-primary/30 transition-colors">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(v) => setTermsAccepted(v === true)}
                        className="mt-0.5 shrink-1"
                      />
                      <div className="space-y-1">
                        <label htmlFor="terms" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Termos de Uso
                        </label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Declaro que li e aceito os{" "}
                          <Link to="/terms" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
                            Termos de Uso
                          </Link>{" "}
                          da plataforma.
                        </p>
                      </div>
                    </div>

                    {/* Política de Privacidade / LGPD */}
                    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 hover:border-primary/30 transition-colors">
                      <Checkbox
                        id="privacy"
                        checked={privacyAccepted}
                        onCheckedChange={(v) => setPrivacyAccepted(v === true)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="space-y-1">
                        <label htmlFor="privacy" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          Política de Privacidade (LGPD)
                        </label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Concordo com o tratamento dos meus dados pessoais conforme a{" "}
                          <Link to="/privacy" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
                            Política de Privacidade
                          </Link>{" "}
                          e a{" "}
                          <Link to="/lgpd" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
                            LGPD (Lei 13.709/2018)
                          </Link>.
                        </p>
                      </div>
                    </div>

                    {/* Consentimento biométrico específico */}
                    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 hover:border-primary/30 transition-colors">
                      <Checkbox
                        id="biometric"
                        checked={biometricAccepted}
                        onCheckedChange={(v) => setBiometricAccepted(v === true)}
                        className="mt-1 shrink-0"
                      />
                      <div className="space-y-1">
                        <label htmlFor="biometric" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                          <Fingerprint className="w-3.5 h-3.5 text-primary" />
                          Processamento de dados biométricos
                        </label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Autorizo o processamento da minha imagem facial e do documento de identidade para fins de verificação de identidade e segurança da teleconsulta, conforme art. 11 da LGPD. Seus dados biométricos são criptografados e excluídos automaticamente após a verificação.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => setConsentGiven(true)}
                    disabled={!allConsents}
                    className="w-full h-12 rounded-2xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    size="lg"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Iniciar verificação biométrica
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Você pode revogar seu consentimento a qualquer momento em{" "}
                    <Link to="/dashboard" className="text-primary underline underline-offset-2 hover:text-primary/80">
                      Configurações → Privacidade
                    </Link>.
                  </p>
                </div>
              ) : (
                <BiometricKYC
                  tipo={tipo}
                  onComplete={(result) => {
                    if (result?.match && result.score >= 80) {
                      setDone(true);
                      void sendApprovalEmail(result);
                    }
                  }}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
