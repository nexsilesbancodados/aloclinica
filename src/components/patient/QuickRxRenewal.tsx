/**
 * Renovação 1-clique de receita.
 *
 * Para receitas NÃO controladas emitidas pela plataforma (digital + assinada),
 * o paciente responde 3 perguntas rápidas e a equipe médica aprova em 1 clique.
 * Diferente do PrescriptionRenewalForm (que aceita upload de receita externa),
 * este fluxo já tem a Rx anterior cadastrada — basta confirmar continuidade.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logError } from "@/lib/logger";
import { logActivity } from "@/lib/activity";
import { Pill, Check, AlertCircle, CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";

const QuickRxRenewal = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rx, setRx] = useState<any>(null);
  const [stillTaking, setStillTaking] = useState<"yes" | "no" | null>(null);
  const [symptomsChanged, setSymptomsChanged] = useState<"yes" | "no" | null>(null);
  const [sideEffects, setSideEffects] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!prescriptionId || !user) return;
      try {
        const { data } = await db.from("prescriptions")
          .select("id, doctor_id, appointment_id, medications, diagnosis, created_at, is_continuous, valid_until")
          .eq("id", prescriptionId)
          .eq("patient_id", user.id)
          .maybeSingle();
        setRx(data);
        if (data?.id) logActivity({ action: "view", entity_type: "prescription", entity_id: data.id, reason: "patient_renewal" });
      } catch (e) {
        logError("QuickRxRenewal load", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [prescriptionId, user?.id]);

  const submit = async () => {
    if (!rx || !user) return;
    if (!stillTaking || !symptomsChanged) {
      toast.info("Responda as duas perguntas obrigatórias.");
      return;
    }
    setSubmitting(true);
    try {
      const notes = `Continua tomando: ${stillTaking === "yes" ? "sim" : "não"}\nSintomas mudaram: ${symptomsChanged === "yes" ? "sim" : "não"}${sideEffects.trim() ? `\nEfeitos colaterais: ${sideEffects.trim()}` : ""}`;
      const { error } = await db.from("prescription_renewals").insert({
        prescription_id: rx.id,
        patient_id: user.id,
        doctor_id: rx.doctor_id,
        status: "pending",
        notes,
      } as any);
      if (error) throw error;

      // Push notification ao médico (best-effort; trigger DB já criou a notification in-app)
      try {
        const { data: doc } = await db.from("doctor_profiles").select("user_id").eq("id", rx.doctor_id).maybeSingle();
        const docUserId = (doc as any)?.user_id;
        if (docUserId) {
          db.functions.invoke("send-push-notification", {
            body: {
              user_id: docUserId,
              title: "💊 Pedido de renovação de receita",
              message: "Um paciente solicitou renovação. Toque para revisar e aprovar.",
              link: "/dashboard/prescription-renewals",
            },
          }).catch(() => { /* push não bloqueia o fluxo */ });
        }
      } catch { /* tolerante */ }

      setDone(true);
      toast.success("Pedido de renovação enviado", { description: "O médico aprova em breve. Você é notificado quando estiver pronta." });
    } catch (e: any) {
      logError("QuickRxRenewal submit", e);
      toast.error("Erro ao enviar renovação", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const meds: string[] = Array.isArray(rx?.medications)
    ? rx.medications.map((m: any) => m?.name || m?.medication || "").filter(Boolean)
    : [];

  return (
    <DashboardLayout title="Renovar receita" nav={getPatientNav("history")} role="patient">
      <div className="max-w-xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Pill className="w-5 h-5 text-primary" /> Renovar receita</h1>
          <p className="text-sm text-muted-foreground">Responda 3 perguntas — sem precisar de consulta.</p>
        </div>

        {loading ? (
          <Card><CardContent className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full mt-2" />
          </CardContent></Card>
        ) : !rx ? (
          <EmptyState variant="error" icon={AlertCircle} title="Receita não encontrada"
            description="Verifique o link ou acesse o histórico para escolher uma receita."
            action={{ label: "Ver minhas receitas", onClick: () => navigate("/dashboard/history?role=patient") }} />
        ) : done ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-success/15 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <p className="font-semibold text-foreground">Pedido enviado</p>
              <p className="text-sm text-muted-foreground">Você será notificado assim que o médico aprovar.</p>
              <Button onClick={() => navigate("/dashboard/history?role=patient")} className="rounded-xl">
                Ver minhas receitas <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita original</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rx.diagnosis && <p><span className="text-muted-foreground">Diagnóstico:</span> {rx.diagnosis}</p>}
                {meds.length > 0 && (
                  <div>
                    <p className="text-muted-foreground">Medicações:</p>
                    <ul className="list-disc pl-5 mt-1">{meds.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Emitida em {format(new Date(rx.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  {rx.valid_until ? ` · válida até ${format(new Date(rx.valid_until), "dd/MM/yyyy")}` : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold mb-2">1. Você continua tomando como prescrito? *</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={stillTaking === "yes" ? "default" : "outline"} className="rounded-xl gap-2" onClick={() => setStillTaking("yes")}>
                      <Check className="w-4 h-4" /> Sim
                    </Button>
                    <Button variant={stillTaking === "no" ? "default" : "outline"} className="rounded-xl" onClick={() => setStillTaking("no")}>
                      Não
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">2. Houve mudança nos sintomas? *</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={symptomsChanged === "no" ? "default" : "outline"} className="rounded-xl gap-2" onClick={() => setSymptomsChanged("no")}>
                      <Check className="w-4 h-4" /> Continuam iguais
                    </Button>
                    <Button variant={symptomsChanged === "yes" ? "default" : "outline"} className="rounded-xl" onClick={() => setSymptomsChanged("yes")}>
                      Mudaram
                    </Button>
                  </div>
                  {symptomsChanged === "yes" && (
                    <p className="text-xs text-amber-600 mt-2 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Se houve mudança importante, recomendamos agendar uma consulta de retorno em vez de renovar.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">3. Algum efeito colateral? (opcional)</p>
                  <Textarea rows={2} maxLength={500} value={sideEffects} onChange={(e) => setSideEffects(e.target.value)}
                    placeholder="Ex.: senti um pouco de tontura no início." className="resize-none text-sm" />
                </div>

                <Button onClick={submit} disabled={submitting || !stillTaking || !symptomsChanged}
                  size="lg" className="w-full h-12 rounded-2xl gap-2">
                  {submitting ? "Enviando…" : "Pedir renovação"}
                </Button>

                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" /> O médico revisa em até 24h. Você será notificado.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default QuickRxRenewal;
