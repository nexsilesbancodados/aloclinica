/**
 * BillingPortal — central do paciente para gerenciar pagamentos.
 *
 * 3 abas:
 *  1. Assinaturas — ativas/canceladas + cancelar/trocar cartão
 *  2. Cartões salvos — vault PagBank
 *  3. Histórico — todas transações (paid/refunded/pending)
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CreditCard, Calendar, Receipt, RefreshCw, XCircle, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import SavedCardsList from "./SavedCardsList";
import { warn } from "@/lib/logger";

type Subscription = {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string | null;
  next_charge_at: string | null;
  last_charge_at: string | null;
  last_charge_status: string | null;
  amount_cents: number | null;
  saved_card_id: string | null;
  cancelled_at: string | null;
  // joined
  plan_name?: string;
};

type Transaction = {
  id: string;
  resource_type: string;
  resource_id: string;
  amount_cents: number;
  payment_method: string;
  status: string;
  description: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  created_at: string;
};

const fmtBRL = (cents: number | null) =>
  cents == null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const statusBadge = (status: string) => {
  const map: Record<string, { className: string; label: string; icon?: any }> = {
    paid: { className: "border-emerald-200 text-emerald-700", label: "Pago", icon: CheckCircle2 },
    pending: { className: "border-amber-200 text-amber-700", label: "Pendente", icon: Clock },
    declined: { className: "border-red-200 text-red-700", label: "Recusado", icon: XCircle },
    refunded: { className: "border-purple-200 text-purple-700", label: "Estornado", icon: RefreshCw },
    partial_refund: { className: "border-purple-200 text-purple-700", label: "Estorno parcial", icon: RefreshCw },
    cancelled: { className: "border-slate-200 text-slate-700", label: "Cancelado", icon: XCircle },
    failed: { className: "border-red-200 text-red-700", label: "Falha", icon: AlertTriangle },
    authorized: { className: "border-blue-200 text-blue-700", label: "Autorizado", icon: Clock },
    active: { className: "border-emerald-200 text-emerald-700", label: "Ativa", icon: CheckCircle2 },
    suspended: { className: "border-amber-200 text-amber-700", label: "Suspensa", icon: AlertTriangle },
  };
  const cfg = map[status] ?? { className: "border-muted text-muted-foreground", label: status };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[11px] gap-1 ${cfg.className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {cfg.label}
    </Badge>
  );
};

export function BillingPortal() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; sub: Subscription | null; reason: string }>({
    open: false, sub: null, reason: "",
  });
  const [tab, setTab] = useState<"subscriptions" | "cards" | "history">("subscriptions");

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);

    const [subsRes, txsRes] = await Promise.all([
      (db as any)
        .from("subscriptions")
        .select("*, plans(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      db
        .from("payment_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (subsRes.error) warn("[BillingPortal] subs error", subsRes.error);
    if (txsRes.error) warn("[BillingPortal] txs error", txsRes.error);

    setSubs(((subsRes.data ?? []) as any[]).map(s => ({ ...s, plan_name: s.plans?.name })));
    setTxs((txsRes.data ?? []) as Transaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const cancelSubscription = async () => {
    const sub = cancelDialog.sub;
    if (!sub) return;
    const { data, error } = await db.functions.invoke("mercadopago-cancel-subscription", {
      body: { subscription_id: sub.id },
    });
    if (error || (data as any)?.error || !(data as any)?.ok) {
      toast.error("Erro ao cancelar", { description: (data as any)?.error || error?.message });
      return;
    }
    toast.success("Assinatura cancelada", { description: "Você não será cobrado novamente." });
    setCancelDialog({ open: false, sub: null, reason: "" });
    await fetchAll();
  };

  const counts = useMemo(() => ({
    activeSubs: subs.filter(s => s.status === "active").length,
    txCount: txs.length,
  }), [subs, txs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos & Assinaturas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie cartões, assinaturas ativas e histórico de transações.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="subscriptions" className="gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Assinaturas
            {counts.activeSubs > 0 && (
              <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">{counts.activeSubs}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Cartões
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Histórico
            <span className="text-[10px] text-muted-foreground">({counts.txCount})</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Assinaturas ── */}
        <TabsContent value="subscriptions" className="space-y-3 mt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : subs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma assinatura ainda.</p>
              </CardContent>
            </Card>
          ) : (
            subs.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {s.plan_name || "Assinatura"}
                        {statusBadge(s.status)}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {fmtBRL(s.amount_cents)} / mês
                      </CardDescription>
                    </div>
                    {s.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => setCancelDialog({ open: true, sub: s, reason: "" })}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                  {s.next_charge_at && s.status === "active" && (
                    <div>
                      <div className="text-muted-foreground text-xs">Próxima cobrança</div>
                      <div className="font-medium">{format(new Date(s.next_charge_at), "dd 'de' MMM, yyyy", { locale: ptBR })}</div>
                    </div>
                  )}
                  {s.last_charge_at && (
                    <div>
                      <div className="text-muted-foreground text-xs">Última cobrança</div>
                      <div className="font-medium">
                        {format(new Date(s.last_charge_at), "dd/MM/yy", { locale: ptBR })}
                        {s.last_charge_status && (
                          <span className="ml-2">{statusBadge(s.last_charge_status)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {s.cancelled_at && (
                    <div className="sm:col-span-2 text-xs text-muted-foreground">
                      Cancelada em {format(new Date(s.cancelled_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Cartões ── */}
        <TabsContent value="cards" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cartões salvos</CardTitle>
              <CardDescription>
                Cartões usados para assinaturas e cobranças rápidas. Dados criptografados pelo PagBank.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SavedCardsList />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Histórico ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : txs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma transação ainda.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(t.created_at), "dd/MM/yy HH:mm")}
                          </TableCell>
                          <TableCell className="text-sm">{t.description || t.resource_type}</TableCell>
                          <TableCell className="text-xs">{t.payment_method}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmtBRL(t.amount_cents)}
                            {t.refund_amount_cents != null && (
                              <div className="text-[10px] text-purple-600">
                                Estorno: {fmtBRL(t.refund_amount_cents)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{statusBadge(t.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={cancelDialog.open} onOpenChange={(o) => !o && setCancelDialog({ open: false, sub: null, reason: "" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Você não será cobrado novamente. Pode reativar a qualquer momento criando uma nova assinatura.
            </p>
            <div>
              <label className="text-xs font-medium">Motivo (opcional)</label>
              <Textarea
                value={cancelDialog.reason}
                onChange={(e) => setCancelDialog({ ...cancelDialog, reason: e.target.value })}
                placeholder="Conta-nos por que está cancelando..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, sub: null, reason: "" })}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancelSubscription}>
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BillingPortal;
