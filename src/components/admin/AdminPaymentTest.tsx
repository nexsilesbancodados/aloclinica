import { useEffect, useRef, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, QrCode, CreditCard, Trash2, Copy, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "./AdminPageHeader";

/**
 * Real end-to-end PagBank payment tester.
 * - Creates a R$ 1,00 test appointment for the current admin user
 * - Generates a real PIX or CREDIT_CARD charge via pagbank-create-payment
 * - Polls appointments.payment_status every 3s — webhook should flip it to "approved"
 * - Lets admin clean up the test row
 */
export default function AdminPaymentTest() {
  const { user } = useAuth();
  const [doctorId, setDoctorId] = useState<string>("");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("—");
  const [apptStatus, setApptStatus] = useState<string>("—");
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixCopy, setPixCopy] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollLog, setPollLog] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  // Card form
  const [cardNumber, setCardNumber] = useState("4111111111111111");
  const [cardName, setCardName] = useState("TESTE PAGBANK");
  const [cardExp, setCardExp] = useState("12/30");
  const [cardCvv, setCardCvv] = useState("123");

  useEffect(() => {
    (async () => {
      // Pega o primeiro doctor_profile real (appointments.doctor_id → doctor_profiles.id)
      const { data, error } = await db
        .from("doctor_profiles")
        .select("id")
        .limit(1);
      if (data?.[0]?.id) setDoctorId(data[0].id);
      else if (error) toast.error("Erro buscando médico", { description: error.message });
    })();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const log = (s: string) => setPollLog((l) => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 30));

  const startPolling = (id: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data } = await db
        .from("appointments")
        .select("payment_status, status, payment_confirmed_at")
        .eq("id", id)
        .maybeSingle();
      if (!data) return;
      setPaymentStatus(data.payment_status || "pending");
      setApptStatus(data.status || "—");
      setConfirmedAt(data.payment_confirmed_at || null);
      if (data.payment_status === "approved") {
        log(`✅ Webhook confirmou pagamento (status=${data.status})`);
        if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
        toast.success("Pagamento aprovado pelo webhook!");
      }
    }, 3000) as unknown as number;
  };

  const createAppointment = async (): Promise<string | null> => {
    if (!user) { toast.error("Faça login como admin"); return null; }
    if (!doctorId) { toast.error("Nenhum doctor_id encontrado para teste"); return null; }
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: user.id,
        doctor_id: doctorId,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        status: "scheduled",
        payment_status: "pending",
        price: 1.0,
        notes: "PAYMENT_TEST_" + Date.now(),
      })
      .select("id")
      .single();
    if (error) { toast.error("Erro criando appointment", { description: error.message }); return null; }
    setAppointmentId(data.id);
    setPaymentStatus("pending");
    setApptStatus("scheduled");
    log(`📅 Appointment criado: ${data.id}`);
    return data.id;
  };

  // Helper para extrair mensagem REAL do erro retornado pela edge function
  // (db.functions.invoke esconde o body em erros 4xx/5xx)
  const invokeMpFn = async (fnName: string, body: any) => {
    try {
      const session = await db.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL || ""}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* não-JSON */ }
      return { ok: res.ok, status: res.status, data: json, raw: text };
    } catch (e) {
      return { ok: false, status: 0, data: null, raw: String(e) };
    }
  };

  // Mensagem amigável quando erro Mercado Pago
  const explainMpError = (msg: string): string => {
    if (!msg) return "Erro desconhecido";
    if (msg.toLowerCase().includes("access_token") || msg.toLowerCase().includes("unauthorized")) {
      return `${msg}\n→ Verifique se MERCADOPAGO_ACCESS_TOKEN está configurado em Supabase → Edge Functions → Secrets.`;
    }
    return msg;
  };

  const generatePix = async () => {
    setBusy(true); setPixQr(null); setPixCopy(null); setOrderId(null);
    try {
      const id = appointmentId || (await createAppointment());
      if (!id) return;
      const r = await invokeMpFn("mercadopago-create-payment", {
        amount: 1.0,
        payment_method: "pix",
        reference_id: `appointment_${id}`,
        description: "Teste Mercado Pago R$1",
      });
      if (!r.ok || !r.data?.payment_id || r.data?.error) {
        const real = r.data?.error || r.raw?.slice(0, 200) || "Erro desconhecido";
        const explained = explainMpError(real);
        log(`❌ Erro PIX (HTTP ${r.status}): ${explained}`);
        toast.error("Erro PIX", { description: real });
        return;
      }
      const data = r.data;
      setPixQr(data.qr_code_base64 || null);
      setPixCopy(data.qr_code || null);
      setOrderId(data.payment_id || null);
      log(`💸 PIX gerado (payment_id=${data.payment_id}). Aguardando webhook…`);
      startPolling(id);
    } finally { setBusy(false); }
  };

  const chargeCard = async () => {
    setBusy(true);
    try {
      const id = appointmentId || (await createAppointment());
      if (!id) return;
      const { data: profile } = await db.from("profiles").select("cpf, phone").eq("id", user!.id).maybeSingle();
      const cpf = profile?.cpf || "12345678909";
      const [m, y] = cardExp.split("/");
      let token;
      try {
        const { createCardToken, detectCardBrand } = await import("@/lib/mercadopago");
        token = await createCardToken({
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardholderName: cardName,
          cardExpirationMonth: m,
          cardExpirationYear: y,
          securityCode: cardCvv,
          identificationType: "CPF",
          identificationNumber: cpf,
        });
        log(`🔐 Cartão tokenizado (${token.payment_method_id ?? detectCardBrand(cardNumber)})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`❌ Tokenização falhou: ${msg}`);
        toast.error("Erro tokenização", { description: msg });
        return;
      }
      const r = await invokeMpFn("mercadopago-create-payment", {
        amount: 1.0,
        payment_method: "credit_card",
        reference_id: `appointment_${id}`,
        description: "Teste cartão R$1",
        card_token: token.id,
        payment_method_id: token.payment_method_id,
        installments: 1,
      });
      if (!r.ok || !r.data?.payment_id || r.data?.error) {
        const real = r.data?.error || r.raw?.slice(0, 200) || "Erro desconhecido";
        log(`❌ Erro cartão (HTTP ${r.status}): ${explainMpError(real)}`);
        toast.error("Erro cartão", { description: real });
        return;
      }
      const data = r.data;
      setOrderId(data.payment_id || null);
      log(`💳 Cartão enviado (status=${data.status || "?"}). Aguardando webhook…`);
      startPolling(id);
    } finally { setBusy(false); }
  };

  const cleanup = async () => {
    if (!appointmentId) return;
    await db.from("appointments").delete().eq("id", appointmentId);
    log(`🗑️ Appointment ${appointmentId} removido`);
    setAppointmentId(null); setPixQr(null); setPixCopy(null); setOrderId(null);
    setPaymentStatus("—"); setApptStatus("—"); setConfirmedAt(null);
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  };

  const statusColor =
    paymentStatus === "approved" ? "default" :
    paymentStatus === "refused" || paymentStatus === "cancelled" ? "destructive" : "secondary";

  return (
    <div className="space-y-6 max-w-5xl">
      <AdminPageHeader
        icon={FlaskConical}
        title="Teste de Pagamento PagBank"
        description="Validação end-to-end: PIX e Cartão · R$ 1,00"
        eyebrow="Sistema"
      />

      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-6 text-sm">
          <strong>Como funciona:</strong> cria um agendamento de teste no seu usuário (R$ 1,00), gera cobrança real
          no PagBank e monitora <code>appointments</code> a cada 3s. Quando o webhook chegar, o status muda para
          <code> approved</code>. Clique em "Limpar" ao final.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status atual</CardTitle>
          <CardDescription>Appointment: {appointmentId || "—"}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>payment_status</Label><div><Badge variant={statusColor as "default" | "secondary" | "destructive"}>{paymentStatus}</Badge></div></div>
          <div><Label>status</Label><div><Badge variant="outline">{apptStatus}</Badge></div></div>
          <div><Label>order_id</Label><div className="text-xs font-mono break-all">{orderId || "—"}</div></div>
          <div><Label>confirmado_em</Label><div className="text-xs">{confirmedAt ? new Date(confirmedAt).toLocaleString("pt-BR") : "—"}</div></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pix">
        <TabsList>
          <TabsTrigger value="pix"><QrCode className="w-4 h-4 mr-2" />PIX</TabsTrigger>
          <TabsTrigger value="card"><CreditCard className="w-4 h-4 mr-2" />Cartão</TabsTrigger>
        </TabsList>

        <TabsContent value="pix">
          <Card>
            <CardHeader><CardTitle>Cobrança PIX R$ 1,00</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={generatePix} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                Gerar PIX
              </Button>
              {pixQr && (
                <div className="flex flex-col items-center gap-3 p-4 border rounded-lg">
                  <img src={`data:image/png;base64,${pixQr}`} alt="QR Code PIX" className="w-56 h-56" />
                  {pixCopy && (
                    <div className="w-full">
                      <Label>Copia e cola</Label>
                      <div className="flex gap-2">
                        <Input value={pixCopy} readOnly className="font-mono text-xs" />
                        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(pixCopy); toast.success("Copiado"); }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie com o app do seu banco. Após pagar, o webhook do PagBank atualizará o status acima
                    automaticamente em alguns segundos.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="card">
          <Card>
            <CardHeader>
              <CardTitle>Cobrança Cartão R$ 1,00</CardTitle>
              <CardDescription>Use um cartão real seu para teste — será cobrado de verdade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Número</Label><Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} /></div>
                <div><Label>Nome impresso</Label><Input value={cardName} onChange={(e) => setCardName(e.target.value)} /></div>
                <div><Label>Validade MM/YY</Label><Input value={cardExp} onChange={(e) => setCardExp(e.target.value)} /></div>
                <div><Label>CVV</Label><Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} /></div>
              </div>
              <Button onClick={chargeCard} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                Cobrar R$ 1,00
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Log do teste</CardTitle>
            <CardDescription>Mais recente no topo</CardDescription>
          </div>
          {appointmentId && (
            <Button variant="destructive" size="sm" onClick={cleanup}>
              <Trash2 className="w-4 h-4 mr-2" /> Limpar appointment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted/50 p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap">
            {pollLog.length ? pollLog.join("\n") : "—"}
          </pre>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            {paymentStatus === "approved" ? (
              <><CheckCircle2 className="w-4 h-4 text-green-600" /> Webhook funcionando corretamente.</>
            ) : paymentStatus === "refused" ? (
              <><XCircle className="w-4 h-4 text-red-600" /> Pagamento recusado pelo PagBank.</>
            ) : (
              <>Aguardando confirmação do webhook…</>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}