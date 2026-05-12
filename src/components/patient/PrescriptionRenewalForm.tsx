import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Clock, CheckCircle2, XCircle, AlertCircle, QrCode, CreditCard, FileBarChart, Lock, Copy, Shield, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

type PaymentMethod = "pix" | "card" | "boleto";
const RENEWAL_PRICE = 80;

const PrescriptionRenewalForm = () => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prescriptionUrl, setPrescriptionUrl] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [sideEffects, setSideEffects] = useState("");
  const [notes, setNotes] = useState("");
  const [myRenewals, setMyRenewals] = useState<any[]>([]);
  

  // Payment state
  const [showPayment, setShowPayment] = useState(false);
  const [renewalId, setRenewalId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [processing, setProcessing] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const finalPrice = RENEWAL_PRICE;

  useEffect(() => {
    if (user) {
      fetchRenewals();
    }
  }, [user]);

  const fetchRenewals = async () => {
    if (!user) return;
    const { data } = await db
      .from("prescription_renewals")
      .select("*")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false });
    setMyRenewals(data ?? []);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    setUploading(true);
    const filePath = `${user.id}/renewal-${Date.now()}-${file.name}`;
    const { error } = await db.storage.from("patient-documents").upload(filePath, file);
    if (error) { toast.error("Erro no upload: " + error.message); }
    else { setPrescriptionUrl(filePath); toast.success("Receita enviada!"); }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!user || !prescriptionUrl) { toast.error("Envie a receita vencida primeiro"); return; }
    setSubmitting(true);
    const questionnaire = {
      allergies: allergies.trim(),
      chronic_conditions: conditions.trim(),
      current_medications: medications.trim(),
      side_effects: sideEffects.trim(),
      additional_notes: notes.trim(),
    };

    const { data, error } = await db.from("prescription_renewals").insert({
      patient_id: user.id,
      original_prescription_url: prescriptionUrl,
      health_questionnaire: questionnaire,
      status: "pending_payment",
    }).select("id").single();

    if (error) { toast.error("Erro: " + error.message); }
    else {
      setRenewalId(data.id);
      setShowPayment(true);
      toast.info("Agora finalize o pagamento para enviar ao médico.");
    }
    setSubmitting(false);
  };

  const handlePayment = async () => {
    if (!user || !renewalId) return;
    if (paymentMethod === "card" && (!cardName || !cardNumber || !cardExpiry || !cardCvv)) {
      toast.error("Preencha todos os campos do cartão"); return;
    }
    setProcessing(true);
    try {
      const { data: profile } = await db.from("profiles").select("first_name, last_name, cpf, phone").eq("user_id", user.id).single();
      if (!profile?.cpf) { toast.error("CPF obrigatório"); setProcessing(false); return; }

      const methodMap: Record<PaymentMethod, "pix" | "credit_card" | "boleto"> = {
        pix: "pix", card: "credit_card", boleto: "boleto",
      };
      const payload: Record<string, any> = {
        amount: finalPrice,
        payment_method: methodMap[paymentMethod],
        reference_id: `renewal_${renewalId}`,
        description: "Renovação de Receita - AloClínica",
      };

      if (paymentMethod === "card") {
        const [expiryMonth, expiryYear] = cardExpiry.split("/");
        try {
          const { createCardToken, detectCardBrand } = await import("@/lib/mercadopago");
          const token = await createCardToken({
            cardNumber: cardNumber.replace(/\s/g, ""),
            cardholderName: cardName,
            cardExpirationMonth: expiryMonth,
            cardExpirationYear: expiryYear,
            securityCode: cardCvv,
            identificationType: "CPF",
            identificationNumber: profile.cpf,
          });
          payload.card_token = token.id;
          payload.payment_method_id = token.payment_method_id ?? detectCardBrand(cardNumber);
          payload.installments = 1;
        } catch (e) {
          toast.error("Erro no cartão", { description: e instanceof Error ? e.message : String(e) });
          setProcessing(false); return;
        }
      }

      const { data, error } = await db.functions.invoke("mercadopago-create-payment", { body: payload });
      if (error || !data?.payment_id || data?.error) {
        toast.error("Erro no pagamento", { description: data?.error || error?.message });
        setProcessing(false); return;
      }

      if (paymentMethod === "pix") {
        setPixQrCode(data.qr_code_base64 || null);
        setPixCopyPaste(data.qr_code || "");
        setProcessing(false);
        toast.success("PIX gerado! 🎉");
        return;
      }

      if (paymentMethod === "boleto") {
        setBoletoUrl(data.boleto_url || null);
        setProcessing(false);
        toast.success("Boleto gerado!");
        return;
      }

      // Card — instant
      if (data.status === "approved") {
        await db.from("prescription_renewals").update({ paid_at: new Date().toISOString(), status: "pending_review", payment_id: data.payment_id } as any).eq("id", renewalId);
        toast.success("Pagamento confirmado! 🎉", { description: "Um médico analisará sua receita em breve." });
        resetForm();
        fetchRenewals();
      }
    } catch (err: unknown) {
      toast.error("Erro", { description: err instanceof Error ? err.message : "Erro inesperado" });
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setShowPayment(false);
    setRenewalId(null);
    setPrescriptionUrl("");
    setAllergies(""); setConditions(""); setMedications(""); setSideEffects(""); setNotes("");
    setPixQrCode(null); setPixCopyPaste(null); setBoletoUrl(null);
  };

  const formatCardNum = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})/g, "$1 ").trim();
  const formatExp = (v: string) => { const c = v.replace(/\D/g, "").slice(0, 4); return c.length >= 3 ? `${c.slice(0, 2)}/${c.slice(2)}` : c; };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending_payment": return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Aguardando pagamento</Badge>;
      case "pending": case "pending_review": return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Em análise</Badge>;
      case "in_review": return <Badge className="bg-warning text-warning-foreground"><AlertCircle className="w-3 h-3 mr-1" />Em análise</Badge>;
      case "approved": return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Aprovada</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejeitada</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("renewal")}>
      <div className="max-w-2xl mx-auto pb-24 md:pb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">💊 Renovar Receita</h1>
        <p className="text-muted-foreground text-sm mb-6">Renove sua receita sem precisar de videoconsulta</p>

        {!showPayment ? (
          <Card className="mb-6">
            <CardContent className="p-6 space-y-4">
              <div>
                <Label className="text-sm font-medium">1. Envie a receita vencida</Label>
                <div className="mt-2">
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUpload} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="w-4 h-4 mr-2" /> {uploading ? "Enviando..." : prescriptionUrl ? "✅ Receita enviada" : "Escolher arquivo"}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">2. Questionário de saúde</Label>
                <div className="space-y-3 mt-2">
                  <div><Label className="text-xs text-muted-foreground">Alergias conhecidas</Label><Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Ex: Dipirona, Penicilina..." /></div>
                  <div><Label className="text-xs text-muted-foreground">Condições crônicas</Label><Input value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Ex: Hipertensão, Diabetes..." /></div>
                  <div><Label className="text-xs text-muted-foreground">Medicamentos atuais</Label><Textarea value={medications} onChange={e => setMedications(e.target.value)} placeholder="Liste os medicamentos" rows={2} /></div>
                  <div><Label className="text-xs text-muted-foreground">Efeitos colaterais</Label><Input value={sideEffects} onChange={e => setSideEffects(e.target.value)} placeholder="Algum efeito colateral?" /></div>
                  <div><Label className="text-xs text-muted-foreground">Observações</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informações extras" rows={2} /></div>
                </div>
              </div>

              <Button onClick={handleSubmit} disabled={submitting || !prescriptionUrl} className="w-full">
                {submitting ? "Enviando..." : `Prosseguir para Pagamento — R$ ${finalPrice.toFixed(2).replace(".", ",")}`}
              </Button>
              <p className="text-xs text-muted-foreground text-center">Análise em até 3 dias úteis após pagamento</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <Lock className="w-5 h-5 mx-auto text-muted-foreground mb-2" />
                <h2 className="text-lg font-bold text-foreground">Pagamento — Renovação de Receita</h2>
                <p className="text-muted-foreground text-sm">
                    R$ {RENEWAL_PRICE},00 • Pagamento via Asaas
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                {([
                  { id: "pix" as PaymentMethod, label: "PIX", icon: QrCode, badge: "Instantâneo" },
                  { id: "card" as PaymentMethod, label: "Cartão", icon: CreditCard, badge: null },
                  { id: "boleto" as PaymentMethod, label: "Boleto", icon: FileBarChart, badge: null },
                ]).map(method => (
                  <motion.button key={method.id} whileTap={{ scale: 0.97 }} onClick={() => setPaymentMethod(method.id)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      paymentMethod === method.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
                    }`}>
                    <method.icon className={`w-5 h-5 ${paymentMethod === method.id ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-semibold ${paymentMethod === method.id ? "text-primary" : "text-foreground"}`}>{method.label}</span>
                    {method.badge && <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0 bg-secondary text-secondary-foreground border-0">{method.badge}</Badge>}
                  </motion.button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {paymentMethod === "pix" && (
                  <motion.div key="pix" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                    {pixQrCode ? (
                      <>
                        <div className="w-48 h-48 mx-auto rounded-2xl bg-card border-2 border-border p-2 mb-4">
                          <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-full h-full object-contain rounded-xl" loading="lazy" decoding="async" />
                        </div>
                        <Button variant="outline" className="w-full mb-4 text-xs" onClick={() => { navigator.clipboard.writeText(pixCopyPaste || ""); setPixCopied(true); toast.success("Copiado!"); setTimeout(() => setPixCopied(false), 3000); }}>
                          {pixCopied ? <><CheckCircle2 className="w-4 h-4 mr-2 text-secondary" /> Copiado!</> : <><Copy className="w-4 h-4 mr-2" /> Copiar código PIX</>}
                        </Button>
                        <p className="text-xs text-muted-foreground">Após o pagamento, sua solicitação será enviada automaticamente.</p>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-12 h-12 mx-auto text-primary/60 mb-4" />
                        <Button className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground h-12" onClick={handlePayment} disabled={processing}>
                          {processing ? "Gerando PIX..." : `Gerar PIX • R$ ${finalPrice.toFixed(2).replace(".", ",")}`}
                        </Button>
                      </>
                    )}
                  </motion.div>
                )}

                {paymentMethod === "card" && (
                  <motion.div key="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div><Label className="text-xs text-muted-foreground">Nome no cartão</Label><Input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Nome no cartão" className="mt-1" /></div>
                    <div><Label className="text-xs text-muted-foreground">Número</Label><Input value={cardNumber} onChange={e => setCardNumber(formatCardNum(e.target.value))} placeholder="0000 0000 0000 0000" className="mt-1 font-mono" maxLength={19} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs text-muted-foreground">Validade</Label><Input value={cardExpiry} onChange={e => setCardExpiry(formatExp(e.target.value))} placeholder="MM/AA" className="mt-1 font-mono" maxLength={5} /></div>
                      <div><Label className="text-xs text-muted-foreground">CVV</Label><Input value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="•••" className="mt-1 font-mono" maxLength={4} type="password" /></div>
                    </div>
                    <Button className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground h-12" onClick={handlePayment} disabled={processing}>
                      {processing ? "Processando..." : <><Lock className="w-4 h-4 mr-2" /> Pagar R$ {finalPrice.toFixed(2).replace(".", ",")}</>}
                    </Button>
                  </motion.div>
                )}

                {paymentMethod === "boleto" && (
                  <motion.div key="boleto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                    {boletoUrl ? (
                      <><CheckCircle2 className="w-12 h-12 mx-auto text-secondary mb-4" /><a href={boletoUrl} target="_blank" rel="noopener noreferrer"><Button className="w-full">📄 Abrir Boleto</Button></a></>
                    ) : (
                      <><FileBarChart className="w-12 h-12 mx-auto text-primary/60 mb-4" /><Button className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground h-12" onClick={handlePayment} disabled={processing}>
                        {processing ? "Gerando boleto..." : `Gerar Boleto • R$ ${finalPrice.toFixed(2).replace(".", ",")}`}
                      </Button></>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-center gap-4 mt-4 text-muted-foreground">
                <div className="flex items-center gap-1 text-xs"><Lock className="w-3 h-3" /> SSL 256-bit</div>
                <div className="flex items-center gap-1 text-xs"><Shield className="w-3 h-3" /> PCI DSS</div>
                <div className="flex items-center gap-1 text-xs"><Check className="w-3 h-3" /> LGPD</div>
              </div>
            </CardContent>
          </Card>
        )}

        {myRenewals.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Minhas Solicitações</h3>
              <div className="space-y-3">
                {myRenewals.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                        {r.rejection_reason && <p className="text-xs text-destructive">{r.rejection_reason}</p>}
                      </div>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PrescriptionRenewalForm;
