/**
 * /contratos — Página pública. Formulário "Quero contratar a AloClínica
 * para minha organização". Cria lead em public.contract_leads. Admin
 * acompanha em /dashboard/admin/leads.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle2, Loader2, ShieldCheck, Sparkles, Heart, Users } from "lucide-react";
import { toast } from "sonner";

const ORG_TYPES = [
  { v: "prefeitura", label: "Prefeitura / Município" },
  { v: "secretaria", label: "Secretaria de Saúde" },
  { v: "empresa", label: "Empresa privada" },
  { v: "ong", label: "ONG / Terceiro setor" },
  { v: "sindicato", label: "Sindicato / Associação" },
  { v: "operadora", label: "Operadora de saúde / Plano" },
  { v: "outro", label: "Outro" },
];

const Contratos = () => {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    org_name: "",
    org_type: "",
    cnpj: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_role: "",
    expected_beneficiaries: "",
    message: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.org_name.trim() || !form.org_type || !form.contact_name.trim() || !form.contact_email.trim()) {
      toast.info("Preencha os campos obrigatórios."); return;
    }
    setSubmitting(true);
    try {
      const { error } = await db.from("contract_leads").insert({
        org_name: form.org_name.trim(),
        org_type: form.org_type,
        cnpj: form.cnpj.trim() || null,
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim().toLowerCase(),
        contact_phone: form.contact_phone.trim() || null,
        contact_role: form.contact_role.trim() || null,
        expected_beneficiaries: form.expected_beneficiaries ? Number(form.expected_beneficiaries) : null,
        message: form.message.trim() || null,
      } as any);
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      toast.error("Não foi possível enviar", { description: e?.message });
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
        <SEOHead title="Solicitação recebida | AloClínica" description="Solicitação de contrato recebida" />
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-success/15 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Solicitação recebida!</h1>
            <p className="text-sm text-muted-foreground">
              Em até <strong>2 dias úteis</strong> nosso time comercial vai te contatar pelo e-mail informado.
            </p>
            <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl">Voltar à home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-10 px-4">
      <SEOHead title="Contrate a AloClínica para sua organização" description="Telemedicina B2G/B2B com painel epidemiológico, controle de cota e IA clínica." />
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Telemedicina para sua organização</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Prefeituras, empresas e ONGs operam saúde digital com a AloClínica.
            Painel epidemiológico, controle de cota, IA clínica e conformidade LGPD inclusos.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: Sparkles, label: "IA Clínica integrada" },
            { icon: ShieldCheck, label: "LGPD + CFM 2.314" },
            { icon: Heart, label: "Painel epidemiológico" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <f.icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-[11px] font-medium text-foreground">{f.label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Solicite contato comercial</CardTitle>
            <CardDescription>Em até 2 dias úteis, nosso time entra em contato.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome da organização *</Label>
                  <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} placeholder="Ex.: Prefeitura de São Paulo" />
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.org_type} onValueChange={(v) => setForm({ ...form, org_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {ORG_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>CNPJ (opcional)</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Seu contato</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Seu nome *</Label>
                      <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>Cargo</Label>
                      <Input value={form.contact_role} onChange={(e) => setForm({ ...form, contact_role: e.target.value })} placeholder="Ex.: Secretário(a)" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>E-mail *</Label>
                      <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="voce@orgao.gov.br" />
                    </div>
                    <div>
                      <Label>Telefone / WhatsApp</Label>
                      <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="(11) 99999-9999" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Beneficiários esperados</Label>
                <Input type="number" min={1} value={form.expected_beneficiaries}
                  onChange={(e) => setForm({ ...form, expected_beneficiaries: e.target.value })}
                  placeholder="Ex.: 5000" />
              </div>

              <div>
                <Label>Conte um pouco mais (opcional)</Label>
                <Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Especialidades de interesse, prazo, contexto da licitação…" className="resize-none" />
              </div>

              <Button type="submit" size="lg" className="w-full h-12 rounded-2xl gap-2" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? "Enviando…" : "Solicitar contato comercial"}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Ao enviar, você concorda com o tratamento dos dados conforme LGPD. Nada de spam.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Contratos;
