/**
 * AdminBilling — gestão centralizada de billing pelo admin.
 *
 * 3 abas:
 *  - Transações: lista todas com filtros + botão Estornar
 *  - Assinaturas: ativas/canceladas/suspensas + cancelar manualmente
 *  - Próximas cobranças: subscriptions com next_charge_at <= 7 dias
 */
import { useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Wallet, RefreshCw, RotateCcw, XCircle, Search, Calendar, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { exportToCSV } from "@/lib/csv";

const adminNav = getAdminNav("billing");

const fmtBRL = (cents: number | null) =>
  cents == null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

type Tx = {
  id: string;
  user_id: string | null;
  resource_type: string;
  resource_id: string;
  pagbank_charge_id: string | null;
  amount_cents: number;
  payment_method: string;
  installments: number | null;
  status: string;
  refund_amount_cents: number | null;
  refunded_at: string | null;
  description: string | null;
  paid_at: string | null;
  created_at: string;
  // joined
  user_email?: string;
  user_name?: string;
};

type Sub = {
  id: string;
  user_id: string;
  status: string;
  amount_cents: number | null;
  starts_at: string | null;
  next_charge_at: string | null;
  last_charge_at: string | null;
  cancelled_at: string | null;
  retry_count: number;
  user_email?: string;
  user_name?: string;
  plan_name?: string;
};

const statusBadgeTx = (status: string) => {
  const map: Record<string, string> = {
    paid: "border-emerald-200 text-emerald-700",
    pending: "border-amber-200 text-amber-700",
    declined: "border-red-200 text-red-700",
    refunded: "border-purple-200 text-purple-700",
    partial_refund: "border-purple-200 text-purple-700",
    cancelled: "border-slate-200 text-slate-700",
    failed: "border-red-200 text-red-700",
    authorized: "border-blue-200 text-blue-700",
  };
  return <Badge variant="outline" className={`text-[11px] ${map[status] ?? ""}`}>{status}</Badge>;
};

const AdminBilling = () => {
  const confirm = useConfirm();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"transactions" | "subscriptions" | "upcoming">("transactions");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; tx: Tx | null; amountInput: string; reason: string }>({
    open: false, tx: null, amountInput: "", reason: "",
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const txPg = usePagination({ pageSize: 25 });
  const subPg = usePagination({ pageSize: 25 });

  const fetchAll = async () => {
    setLoading(true);
    const [txRes, subRes] = await Promise.all([
      db.from("payment_transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(txPg.from, txPg.to),
      (db as any).from("subscriptions")
        .select("*, plans(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(subPg.from, subPg.to),
    ]);
    txPg.setTotal(txRes.count ?? 0);
    subPg.setTotal((subRes as any).count ?? 0);

    // Enrich com profiles
    const userIds = [
      ...new Set([
        ...((txRes.data ?? []) as Tx[]).filter(t => t.user_id).map(t => t.user_id!),
        ...((subRes.data ?? []) as any[]).map(s => s.user_id),
      ]),
    ];
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);
    const pMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    setTxs(((txRes.data ?? []) as Tx[]).map(t => ({
      ...t,
      user_name: t.user_id ? `${(pMap.get(t.user_id) as any)?.first_name ?? ""} ${(pMap.get(t.user_id) as any)?.last_name ?? ""}`.trim() : "",
    })));
    setSubs(((subRes.data ?? []) as any[]).map(s => ({
      ...s,
      user_name: `${(pMap.get(s.user_id) as any)?.first_name ?? ""} ${(pMap.get(s.user_id) as any)?.last_name ?? ""}`.trim(),
      plan_name: s.plans?.name,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [txPg.page, txPg.pageSize, subPg.page, subPg.pageSize]);

  const filteredTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs.filter(t => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (q && !`${t.user_name ?? ""} ${t.description ?? ""} ${t.resource_id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txs, search, filterStatus]);

  const upcomingSubs = useMemo(() => {
    const cutoff = Date.now() + 7 * 86400000;
    return subs.filter(s =>
      s.status === "active" &&
      s.next_charge_at &&
      new Date(s.next_charge_at).getTime() <= cutoff
    ).sort((a, b) => (a.next_charge_at! < b.next_charge_at! ? -1 : 1));
  }, [subs]);

  const openRefund = (tx: Tx) => setRefundDialog({
    open: true, tx,
    amountInput: ((tx.amount_cents - (tx.refund_amount_cents ?? 0)) / 100).toFixed(2),
    reason: "",
  });

  const confirmRefund = async () => {
    const tx = refundDialog.tx;
    if (!tx) return;
    setActionLoading(tx.id);
    const reaisAmount = parseFloat(refundDialog.amountInput.replace(",", "."));
    const { data, error } = await db.functions.invoke("mercadopago-refund", {
      body: {
        transaction_id: tx.id,
        amount: reaisAmount > 0 ? reaisAmount : undefined,
      },
    });
    if (error || (data as any)?.error || !(data as any)?.ok) {
      toast.error("Erro no estorno", { description: (data as any)?.error || error?.message });
      setActionLoading(null);
      return;
    }
    toast.success("Estornado!", { description: `${(data as any).is_partial ? "Parcial" : "Total"}: R$ ${Number((data as any).amount).toFixed(2)}` });
    setActionLoading(null);
    setRefundDialog({ open: false, tx: null, amountInput: "", reason: "" });
    await fetchAll();
  };

  const cancelSubManual = async (sub: Sub) => {
    const ok = await confirm({
      title: "Cancelar assinatura?",
      description: `Você está cancelando a assinatura de ${sub.user_name || sub.user_id}. O usuário não será cobrado novamente.`,
      confirmLabel: "Cancelar assinatura",
      destructive: true,
    });
    if (!ok) return;
    setActionLoading(sub.id);
    const { data, error } = await db.functions.invoke("mercadopago-cancel-subscription", {
      body: { subscription_id: sub.id },
    });
    if (error || (data as any)?.error || !(data as any)?.ok) {
      toast.error("Erro", { description: (data as any)?.error || error?.message });
    } else {
      toast.success("Assinatura cancelada");
      await fetchAll();
    }
    setActionLoading(null);
  };

  const exportTxs = () => {
    if (filteredTxs.length === 0) {
      toast.error("Nada a exportar");
      return;
    }
    exportToCSV(
      `transacoes_${format(new Date(), "yyyy-MM-dd")}.csv`,
      filteredTxs.map(t => ({
        data: format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        usuario: t.user_name ?? "",
        recurso: `${t.resource_type}:${t.resource_id}`,
        descricao: t.description ?? "",
        metodo: t.payment_method,
        valor: fmtBRL(t.amount_cents),
        estorno: t.refund_amount_cents != null ? fmtBRL(t.refund_amount_cents) : "",
        status: t.status,
        pagbank_charge_id: t.pagbank_charge_id ?? "",
      })),
      [
        { key: "data", label: "Data" },
        { key: "usuario", label: "Usuário" },
        { key: "recurso", label: "Recurso" },
        { key: "descricao", label: "Descrição" },
        { key: "metodo", label: "Método" },
        { key: "valor", label: "Valor" },
        { key: "estorno", label: "Estorno" },
        { key: "status", label: "Status" },
        { key: "pagbank_charge_id", label: "PagBank Charge ID" },
      ],
    );
    toast.success("CSV exportado");
  };

  const counts = {
    pending: txs.filter(t => t.status === "pending").length,
    paid: txs.filter(t => t.status === "paid").length,
    refunded: txs.filter(t => t.status === "refunded" || t.status === "partial_refund").length,
    activeSubs: subs.filter(s => s.status === "active").length,
    suspendedSubs: subs.filter(s => s.status === "suspended").length,
  };

  return (
    <DashboardLayout title="Admin" nav={adminNav}>
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Wallet}
          eyebrow="Financeiro"
          title="Billing PagBank"
          description="Transações, assinaturas e estornos. Tudo passa por payment_transactions."
          accent="from-emerald-500 to-teal-600"
          badge={
            counts.pending > 0
              ? { label: `${counts.pending} pendente${counts.pending === 1 ? "" : "s"}`, tone: "warning" }
              : undefined
          }
          actions={
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="transactions" className="gap-1.5">
              Transações ({txs.length})
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="gap-1.5">
              Assinaturas
              {counts.activeSubs > 0 && (
                <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">{counts.activeSubs}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Próximas (7d)
              {upcomingSubs.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{upcomingSubs.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-3 mt-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuário/descrição..." className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="declined">Recusado</SelectItem>
                  <SelectItem value="refunded">Estornado</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportTxs}>
                Exportar CSV
              </Button>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
                    ) : filteredTxs.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma transação</TableCell></TableRow>
                    ) : filteredTxs.slice(0, 100).map((t) => {
                      const canRefund = (t.status === "paid" || t.status === "partial_refund") && t.pagbank_charge_id;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</TableCell>
                          <TableCell className="text-sm">{t.user_name || t.user_id?.slice(0,8) || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[180px] truncate" title={t.description ?? undefined}>
                            {t.description || `${t.resource_type}`}
                          </TableCell>
                          <TableCell className="text-xs">{t.payment_method}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtBRL(t.amount_cents)}
                            {t.refund_amount_cents != null && (
                              <div className="text-[10px] text-purple-600">−{fmtBRL(t.refund_amount_cents)}</div>
                            )}
                          </TableCell>
                          <TableCell>{statusBadgeTx(t.status)}</TableCell>
                          <TableCell className="text-right">
                            {canRefund && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === t.id}
                                onClick={() => openRefund(t)}
                                className="text-purple-700 border-purple-200 hover:bg-purple-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Estornar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredTxs.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Mostrando 100 de {filteredTxs.length}. Use o CSV para ver tudo.
                  </p>
                )}
              </CardContent>
            </Card>
            <PaginationBar pg={txPg} noun="transações" />
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-3 mt-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : subs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Sem assinaturas no banco.</div>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Próx. cobrança</TableHead>
                        <TableHead>Última</TableHead>
                        <TableHead>Retry</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.user_name || s.user_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">{s.plan_name || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(s.amount_cents)}</TableCell>
                          <TableCell>{statusBadgeTx(s.status)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {s.next_charge_at ? format(new Date(s.next_charge_at), "dd/MM/yy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {s.last_charge_at ? format(new Date(s.last_charge_at), "dd/MM/yy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.retry_count > 0 && (
                              <Badge variant="outline" className="text-amber-700 border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1" /> {s.retry_count}/3
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.status === "active" && (
                              <Button size="sm" variant="outline" disabled={actionLoading === s.id}
                                className="text-red-700 border-red-200 hover:bg-red-50"
                                onClick={() => cancelSubManual(s)}>
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <PaginationBar pg={subPg} noun="assinaturas" />
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-3 mt-4">
            {upcomingSubs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma cobrança nos próximos 7 dias.</p>
                </CardContent>
              </Card>
            ) : (
              upcomingSubs.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-sm font-medium">{s.user_name || s.user_id.slice(0, 8)} · {s.plan_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Cobra {fmtBRL(s.amount_cents)} em {format(new Date(s.next_charge_at!), "dd 'de' MMM, yyyy", { locale: ptBR })}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => cancelSubManual(s)}
                      className="text-red-700 border-red-200">
                      Cancelar
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Refund Dialog */}
        <Dialog open={refundDialog.open} onOpenChange={(o) => !o && setRefundDialog({ open: false, tx: null, amountInput: "", reason: "" })}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Estornar transação</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {refundDialog.tx && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Usuário:</span> {refundDialog.tx.user_name}</div>
                  <div><span className="text-muted-foreground">Valor original:</span> {fmtBRL(refundDialog.tx.amount_cents)}</div>
                  {refundDialog.tx.refund_amount_cents != null && (
                    <div><span className="text-muted-foreground">Já estornado:</span> {fmtBRL(refundDialog.tx.refund_amount_cents)}</div>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Valor a estornar (R$)</label>
                <Input
                  value={refundDialog.amountInput}
                  onChange={(e) => setRefundDialog({ ...refundDialog, amountInput: e.target.value })}
                  inputMode="decimal"
                  placeholder="Ex: 89.90"
                />
                <p className="text-[11px] text-muted-foreground">Deixe igual ao valor original para estorno total.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Motivo</label>
                <Textarea
                  value={refundDialog.reason}
                  onChange={(e) => setRefundDialog({ ...refundDialog, reason: e.target.value })}
                  placeholder="Ex: solicitação do cliente, erro de cobrança..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundDialog({ open: false, tx: null, amountInput: "", reason: "" })}>
                Cancelar
              </Button>
              <Button onClick={confirmRefund} className="bg-purple-600 hover:bg-purple-700">
                Confirmar estorno
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminBilling;
