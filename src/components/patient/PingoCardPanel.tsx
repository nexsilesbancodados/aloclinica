import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Heart, QrCode, Sparkle, Crown, Check, ArrowRight, Storefront, Flask, Eyeglasses, MapPin, MagnifyingGlass, Lightning } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PingoSubscribeDialog } from "./PingoSubscribeDialog";

interface Plan {
  id: string; name: string; slug: string; tagline: string | null;
  price_monthly: number; price_yearly: number;
  consultation_discount_percent: number; exam_discount_percent: number; partner_discount_percent: number;
  benefits: string[]; color: string; is_highlighted: boolean;
}

interface Subscription {
  id: string; user_id: string; plan_id: string; card_number: string;
  status: string; billing_cycle: string; started_at: string;
  current_period_end: string | null; total_savings: number;
  plan?: Plan;
}

interface Transaction {
  id: string; description: string | null;
  original_amount: number; discount_amount: number; final_amount: number;
  category: string | null; created_at: string;
  partner?: { name: string } | null;
}

interface Partner {
  id: string; name: string; category: string; description: string | null;
  discount_percent: number; discount_description: string | null;
  city: string | null; state: string | null;
}

const categoryIcons: Record<string, React.ReactNode> = {
  farmacia: <Storefront size={18} weight="fill" />,
  laboratorio: <Flask size={18} weight="fill" />,
  otica: <Eyeglasses size={18} weight="fill" />,
  academia: <Lightning size={18} weight="fill" />,
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const generateCardNumber = () => {
  const block = () => Math.floor(1000 + Math.random() * 9000);
  return `${block()} ${block()} ${block()} ${block()}`;
};

const PingoCardPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const nav = getPatientNav("pingo-card");

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partnerCategory, setPartnerCategory] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [{ data: subs }, { data: planList }, { data: partnerList }] = await Promise.all([
      db.from("pingo_card_subscriptions").select("*, plan:pingo_card_plans(*)").eq("user_id", user!.id).maybeSingle(),
      db.from("pingo_card_plans").select("*").eq("is_active", true).order("display_order"),
      db.from("pingo_card_partners").select("*").eq("is_active", true).order("display_order"),
    ]);
    setSubscription(subs as Subscription | null);
    setPlans((planList ?? []) as Plan[]);
    setPartners((partnerList ?? []) as Partner[]);

    if (subs?.id) {
      const { data: tx } = await db
        .from("pingo_card_transactions")
        .select("*, partner:pingo_card_partners(name)")
        .eq("subscription_id", subs.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setTransactions((tx ?? []) as Transaction[]);
    }
    setLoading(false);
  };

  // Subscribe agora abre dialog de pagamento (cobra de verdade via Mercado Pago)
  const [subscribeDialog, setSubscribeDialog] = useState<{ plan: Plan | null; cycle: "monthly" | "yearly" }>({
    plan: null,
    cycle: "monthly",
  });
  const subscribe = (plan: Plan, billingCycle: "monthly" | "yearly") => {
    if (!user) {
      toast.error("Faça login pra assinar");
      return;
    }
    setSubscribeDialog({ plan, cycle: billingCycle });
  };

  const cancel = async () => {
    if (!subscription) return;
    // Cancela no Mercado Pago + marca local
    const { data, error } = await db.functions.invoke("mercadopago-cancel-subscription", {
      body: { subscription_id: subscription.id, table: "pingo_card_subscriptions" },
    });
    if (error || (data as any)?.error) {
      toast.error("Erro ao cancelar", { description: (data as any)?.error || error?.message });
      return;
    }
    toast.success("Assinatura cancelada", { description: "Você não será cobrado novamente." });
    void load();
  };

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      const matchText = !partnerFilter || `${p.name} ${p.city ?? ""}`.toLowerCase().includes(partnerFilter.toLowerCase());
      const matchCat = partnerCategory === "all" || p.category === partnerCategory;
      return matchText && matchCat;
    });
  }, [partners, partnerFilter, partnerCategory]);

  const totalSavings = transactions.reduce((sum, t) => sum + Number(t.discount_amount), 0);
  const cardPayload = subscription ? `PINGO:${subscription.card_number}:${subscription.user_id}` : "";

  // ESTADO: Sem assinatura → mostrar planos
  if (!loading && !subscription) {
    return (
      <DashboardLayout title="Pingo Card" nav={nav} role="patient">
        <div className="space-y-6 max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
              <CardContent className="p-8 md:p-12">
                <Badge className="mb-4 bg-amber-400 text-amber-950 border-0">
                  <Heart size={14} weight="fill" className="mr-1" /> PINGO CARD
                </Badge>
                <h1 className="text-3xl md:text-4xl font-bold mb-3">Comece a economizar com sua saúde</h1>
                <p className="text-lg opacity-90 max-w-2xl">
                  Descontos em consultas, exames e em uma rede crescente de parceiros. Cancele quando quiser.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <h2 className="text-2xl font-bold">Escolha seu plano</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id} className={plan.is_highlighted ? "border-2 border-primary shadow-lg" : ""}>
                <CardHeader>
                  {plan.is_highlighted && <Badge className="w-fit mb-2">MAIS POPULAR</Badge>}
                  <CardTitle>{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-3xl font-bold">{formatBRL(plan.price_monthly)}</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {plan.benefits.slice(0, 4).map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={16} weight="bold" className="text-primary shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button onClick={() => subscribe(plan, "monthly")}>Assinar mensal</Button>
                    <Button variant="outline" onClick={() => subscribe(plan, "yearly")}>
                      Anual ({formatBRL(plan.price_yearly)})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading || !subscription) {
    return (
      <DashboardLayout title="Pingo Card" nav={nav} role="patient">
        <div className="space-y-4 max-w-6xl mx-auto">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const plan = subscription.plan;
  const isCanceled = subscription.status === "canceled";

  return (
    <DashboardLayout title="Pingo Card" nav={nav} role="patient">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* CARTÃO VIRTUAL */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-2xl">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart size={20} weight="fill" className="text-amber-300" />
                    <span className="font-bold tracking-wide">PINGO CARD</span>
                    <Badge className="bg-amber-400 text-amber-950 border-0 ml-auto md:ml-0">{plan?.name}</Badge>
                  </div>

                  <p className="text-2xl md:text-3xl font-mono tracking-widest mb-4">{subscription.card_number}</p>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase opacity-75">Titular</p>
                      <p className="font-semibold">{user?.email?.split("@")[0]}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase opacity-75">Válido até</p>
                      <p className="font-semibold">
                        {subscription.current_period_end
                          ? format(new Date(subscription.current_period_end), "MM/yy")
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {isCanceled && (
                    <Badge variant="destructive" className="mt-4">Assinatura cancelada</Badge>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl shadow-lg">
                  <QRCodeSVG value={cardPayload} size={120} />
                  <p className="text-center text-xs text-foreground mt-2 font-medium">Apresente em parceiros</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* KPIs */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Sparkle size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Economia total</p>
                  <p className="text-xl font-bold">{formatBRL(Number(subscription.total_savings) + totalSavings)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <QrCode size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Usos</p>
                  <p className="text-xl font-bold">{transactions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Crown size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Plano</p>
                  <p className="text-xl font-bold">{plan?.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TABS */}
        <Tabs defaultValue="parceiros">
          <TabsList>
            <TabsTrigger value="parceiros">Rede de parceiros</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="plano">Meu plano</TabsTrigger>
          </TabsList>

          <TabsContent value="parceiros" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" weight="bold" />
                <Input placeholder="Buscar parceiro ou cidade..." className="pl-9" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} />
              </div>
              <Select value={partnerCategory} onValueChange={setPartnerCategory}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  <SelectItem value="farmacia">Farmácia</SelectItem>
                  <SelectItem value="laboratorio">Laboratório</SelectItem>
                  <SelectItem value="otica">Ótica</SelectItem>
                  <SelectItem value="academia">Academia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredPartners.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum parceiro encontrado.</CardContent></Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredPartners.map((p) => (
                  <Card key={p.id} className="hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          {categoryIcons[p.category] ?? <Storefront size={18} weight="fill" />}
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">-{p.discount_percent}%</Badge>
                      </div>
                      <h3 className="font-semibold mb-1">{p.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {p.discount_description ?? p.description}
                      </p>
                      {p.city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={12} weight="fill" /> {p.city}, {p.state}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico">
            {transactions.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum uso registrado ainda. Use seu cartão em parceiros para acompanhar sua economia aqui.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y">
                  {transactions.map((t) => (
                    <div key={t.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{t.partner?.name ?? t.description ?? "Uso"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(t.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-600 font-bold">-{formatBRL(Number(t.discount_amount))}</p>
                        <p className="text-xs text-muted-foreground">de {formatBRL(Number(t.original_amount))}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="plano" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{plan?.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{plan?.tagline}</p>
                <ul className="space-y-2">
                  {plan?.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check size={16} weight="bold" className="text-primary mt-0.5 shrink-0" /> {b}
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
                  <div>
                    <p className="text-muted-foreground">Cobrança</p>
                    <p className="font-semibold capitalize">{subscription.billing_cycle === "yearly" ? "Anual" : "Mensal"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo ciclo</p>
                    <p className="font-semibold">
                      {subscription.current_period_end ? format(new Date(subscription.current_period_end), "dd/MM/yyyy") : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isCanceled && (
              <Card>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold">Quer trocar de plano?</p>
                    <p className="text-sm text-muted-foreground">Cancele a assinatura atual e escolha outro.</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Cancelar assinatura</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Pingo Card?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Você perderá os benefícios e descontos imediatamente. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={cancel}>Confirmar cancelamento</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <PingoSubscribeDialog
        open={!!subscribeDialog.plan}
        onOpenChange={(open) => !open && setSubscribeDialog({ plan: null, cycle: "monthly" })}
        plan={subscribeDialog.plan}
        billingCycle={subscribeDialog.cycle}
        onSubscribed={() => void load()}
      />
    </DashboardLayout>
  );
};

export default PingoCardPanel;
