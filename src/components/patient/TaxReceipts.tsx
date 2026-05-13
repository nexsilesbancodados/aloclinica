/**
 * TaxReceipts — central de recibos pra IRPF.
 *
 * Junta TODOS os pagamentos do paciente (consultas, assinaturas, urgência,
 * renovações de receita) e gera recibos IRPF-compliant. Filtro por ano
 * facilita IRPF (exercício fiscal).
 */
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Calendar, Stethoscope, CreditCard, Receipt as ReceiptIcon, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { generateTaxReceipt } from "@/lib/taxReceipt";

type PaidItem = {
  id: string;
  type: "appointment" | "subscription" | "queue" | "renewal" | "pingo_card";
  description: string;
  amount: number;
  paid_at: string;
  doctor?: { name: string; crm: string; crm_state: string; cpf?: string };
  raw?: any;
};

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  appointment: { label: "Consulta", icon: Stethoscope, color: "text-blue-600" },
  subscription: { label: "Assinatura", icon: CreditCard, color: "text-emerald-600" },
  queue: { label: "Plantão", icon: Sparkles, color: "text-amber-600" },
  renewal: { label: "Renovação receita", icon: FileText, color: "text-violet-600" },
  pingo_card: { label: "Pingo Card", icon: CreditCard, color: "text-amber-600" },
};

const TaxReceipts = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [profile, setProfile] = useState<{ first_name: string; last_name: string; cpf: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    // Profile pro CPF
    const { data: prof } = await db
      .from("profiles")
      .select("first_name, last_name, cpf")
      .eq("user_id", user!.id)
      .single();
    setProfile(prof);

    // Payment transactions (Mercado Pago — pagamentos avulsos: consultas/queue/renewal)
    const { data: txs } = await db
      .from("payment_transactions")
      .select("id, amount_cents, status, paid_at, resource_id, resource_type, payment_method")
      .eq("user_id", user!.id)
      .eq("status", "approved")
      .order("paid_at", { ascending: false })
      .limit(500);

    const all: PaidItem[] = [];

    // Resolve appointment + doctor info pra cada transação de consulta
    const apptIds = (txs ?? []).filter(t => t.resource_type === "appointment").map(t => t.resource_id).filter(Boolean);
    let apptMap = new Map<string, { doctor_id: string; scheduled_at: string }>();
    let docMap = new Map<string, { name: string; crm: string; crm_state: string; cpf?: string }>();
    if (apptIds.length > 0) {
      const { data: appts } = await db.from("appointments")
        .select("id, doctor_id, scheduled_at")
        .in("id", apptIds);
      apptMap = new Map((appts ?? []).map(a => [a.id, { doctor_id: a.doctor_id, scheduled_at: a.scheduled_at }]));
      const docIds = [...new Set((appts ?? []).map(a => a.doctor_id))];
      if (docIds.length > 0) {
        const { data: docs } = await db.from("doctor_profiles")
          .select("id, user_id, crm, crm_state")
          .in("id", docIds);
        const userIds = (docs ?? []).map(d => d.user_id);
        const { data: docProfs } = await db.from("profiles")
          .select("user_id, first_name, last_name, cpf")
          .in("user_id", userIds);
        const profMap = new Map<string, any>((docProfs ?? []).map((p: any) => [p.user_id, p]));
        (docs ?? []).forEach(d => {
          const p = profMap.get(d.user_id);
          if (p) docMap.set(d.id, {
            name: `Dr(a). ${p.first_name} ${p.last_name}`.trim(),
            crm: d.crm,
            crm_state: d.crm_state,
            cpf: p.cpf ?? undefined,
          });
        });
      }
    }

    (txs ?? []).forEach(t => {
      if (!t.paid_at) return;
      const meta = TYPE_META[t.resource_type as string] ?? TYPE_META.appointment;
      let description = meta.label;
      let doctor: PaidItem["doctor"] = undefined;
      if (t.resource_type === "appointment" && t.resource_id) {
        const appt = apptMap.get(t.resource_id);
        const doc = appt ? docMap.get(appt.doctor_id) : null;
        if (doc) {
          description = `Consulta com ${doc.name}`;
          doctor = doc;
        }
      } else if (t.resource_type === "urgent_queue") {
        description = "Atendimento de plantão (urgência)";
      } else if (t.resource_type === "prescription_renewal") {
        description = "Renovação de receita";
      }
      all.push({
        id: t.id,
        type: t.resource_type === "urgent_queue" ? "queue" : t.resource_type === "prescription_renewal" ? "renewal" : "appointment",
        description,
        amount: Number(t.amount_cents) / 100,
        paid_at: t.paid_at,
        doctor,
      });
    });

    // Pingo Card subscriptions (pagas via MP — plano mensal/anual)
    const { data: pingoSubs } = await db
      .from("pingo_card_subscriptions")
      .select("id, plan_id, billing_cycle, started_at, status")
      .eq("user_id", user!.id)
      .in("status", ["active", "cancelled"])
      .order("started_at", { ascending: false });

    if (pingoSubs && pingoSubs.length > 0) {
      const planIds = [...new Set(pingoSubs.map(p => p.plan_id))];
      const { data: plans } = await db
        .from("pingo_card_plans")
        .select("id, name, price_monthly, price_yearly")
        .in("id", planIds);
      const planMap = new Map<string, any>((plans ?? []).map((p: any) => [p.id, p]));
      pingoSubs.forEach(sub => {
        const plan = planMap.get(sub.plan_id);
        if (!plan || !sub.started_at) return;
        const amount = sub.billing_cycle === "yearly" ? Number(plan.price_yearly) : Number(plan.price_monthly);
        all.push({
          id: sub.id,
          type: "pingo_card",
          description: `Pingo Card — Plano ${plan.name} (${sub.billing_cycle === "yearly" ? "anual" : "mensal"})`,
          amount,
          paid_at: sub.started_at,
        });
      });
    }

    // Ordena por data desc
    all.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
    setItems(all);
    setLoading(false);
  };

  const years = useMemo(() => {
    const set = new Set(items.map(i => new Date(i.paid_at).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);

  const filtered = useMemo(() => {
    if (yearFilter === "all") return items;
    return items.filter(i => String(new Date(i.paid_at).getFullYear()) === yearFilter);
  }, [items, yearFilter]);

  const yearTotal = filtered.reduce((sum, i) => sum + i.amount, 0);

  const downloadReceipt = (item: PaidItem) => {
    if (!profile?.cpf) {
      toast.error("CPF não cadastrado", { description: "Complete seu perfil pra gerar recibos pra IR." });
      return;
    }
    generateTaxReceipt({
      patient: {
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        cpf: profile.cpf,
      },
      items: [{
        description: item.description,
        amount: item.amount,
        date: item.paid_at,
      }],
      receipt_number: `${item.type.toUpperCase().slice(0, 3)}-${item.id.slice(0, 8).toUpperCase()}`,
      payment_date: item.paid_at,
      doctor: item.doctor,
    });
  };

  const downloadConsolidated = () => {
    if (!profile?.cpf) {
      toast.error("CPF não cadastrado");
      return;
    }
    if (filtered.length === 0) {
      toast.error("Nada pra exportar no período selecionado");
      return;
    }
    generateTaxReceipt({
      patient: {
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        cpf: profile.cpf,
      },
      items: filtered.map(i => ({
        description: i.description,
        amount: i.amount,
        date: i.paid_at,
      })),
      receipt_number: `IRPF-${yearFilter === "all" ? "TODOS" : yearFilter}`,
      payment_date: filtered[0]?.paid_at ?? new Date().toISOString(),
    });
  };

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("payments")} role="patient">
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <ReceiptIcon className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-foreground">Recibos para IRPF</h1>
            <p className="text-sm text-muted-foreground">
              Comprovantes de despesas médicas dedutíveis no Imposto de Renda Pessoa Física.
            </p>
          </div>
        </div>

        {!loading && !profile?.cpf && (
          <Card className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-100">
              <strong>Complete seu CPF</strong> em <a href="/dashboard/profile" className="underline">Meu Perfil</a> pra
              gerar recibos válidos pra Receita Federal.
            </CardContent>
          </Card>
        )}

        {/* Filtro + total */}
        <div className="flex items-center gap-3 flex-wrap mb-4 p-4 rounded-2xl bg-card border border-border/40">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total no período</p>
            <p className="text-xl font-extrabold text-foreground tabular-nums">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(yearTotal)}
            </p>
          </div>
          <Button onClick={downloadConsolidated} disabled={filtered.length === 0 || !profile?.cpf} className="gap-2">
            <Download className="w-4 h-4" /> Recibo consolidado
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <ReceiptIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum pagamento aprovado neste período.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => {
              const meta = TYPE_META[item.type] ?? TYPE_META.appointment;
              const Icon = meta.icon;
              return (
                <Card key={item.id} className="border-border/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5">{meta.label}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(item.paid_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-extrabold text-foreground tabular-nums">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.amount)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadReceipt(item)}
                        disabled={!profile?.cpf}
                        className="gap-1 h-7 text-[11px] mt-0.5"
                      >
                        <Download className="w-3 h-3" /> Recibo
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-6 text-center leading-relaxed max-w-md mx-auto">
          Os recibos são gerados em PDF com CNPJ da AloClínica e CPF do médico (quando aplicável),
          conforme exigências da Receita Federal pra dedução de despesas médicas no Anexo de Pagamentos
          Efetuados (Art. 73 do RIR/2018).
        </p>
      </div>
    </DashboardLayout>
  );
};

export default TaxReceipts;
