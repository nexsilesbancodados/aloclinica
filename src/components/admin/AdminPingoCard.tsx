import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash, Heart, Storefront, Users, TrendUp } from "@phosphor-icons/react";
import { Heart as HeartIcon } from "lucide-react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Plan {
  id: string; name: string; slug: string; tagline: string; description: string;
  price_monthly: number; price_yearly: number;
  consultation_discount_percent: number; exam_discount_percent: number; partner_discount_percent: number;
  max_dependents: number; benefits: string[]; color: string;
  is_highlighted: boolean; is_active: boolean; display_order: number;
}

interface Partner {
  id: string; name: string; category: string; description: string;
  discount_percent: number; discount_description: string;
  city: string; state: string; phone: string; website: string;
  is_active: boolean; is_featured: boolean; display_order: number;
}

interface Subscription {
  id: string; user_id: string; card_number: string; status: string;
  billing_cycle: string; started_at: string; total_savings: number;
  plan?: { name: string };
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const emptyPlan: Partial<Plan> = {
  name: "", slug: "", tagline: "", description: "",
  price_monthly: 0, price_yearly: 0,
  consultation_discount_percent: 0, exam_discount_percent: 0, partner_discount_percent: 0,
  max_dependents: 0, benefits: [], color: "blue",
  is_highlighted: false, is_active: true, display_order: 0,
};

const emptyPartner: Partial<Partner> = {
  name: "", category: "farmacia", description: "",
  discount_percent: 10, discount_description: "",
  city: "", state: "", phone: "", website: "",
  is_active: true, is_featured: false, display_order: 0,
};

const AdminPingoCard = () => {
  const confirm = useConfirm();
  const nav = getAdminNav("pingo-card");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const [planForm, setPlanForm] = useState<Partial<Plan>>(emptyPlan);
  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [partnerForm, setPartnerForm] = useState<Partial<Partner>>(emptyPartner);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);

  const [benefitsInput, setBenefitsInput] = useState("");

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: pl }, { data: pa }, { data: sub }] = await Promise.all([
      db.from("pingo_card_plans").select("*").order("display_order"),
      db.from("pingo_card_partners").select("*").order("display_order"),
      db.from("pingo_card_subscriptions").select("*, plan:pingo_card_plans(name)").order("created_at", { ascending: false }).limit(100),
    ]);
    setPlans((pl ?? []) as Plan[]);
    setPartners((pa ?? []) as Partner[]);
    setSubscriptions((sub ?? []) as Subscription[]);
    setLoading(false);
  };

  // ── PLANS ──
  const openPlanForm = (p?: Plan) => {
    if (p) {
      setPlanForm(p);
      setEditingPlanId(p.id);
      setBenefitsInput(p.benefits.join("\n"));
    } else {
      setPlanForm(emptyPlan);
      setEditingPlanId(null);
      setBenefitsInput("");
    }
    setPlanOpen(true);
  };

  const savePlan = async () => {
    const benefits = benefitsInput.split("\n").map((s) => s.trim()).filter(Boolean);
    const payload = { ...planForm, benefits, slug: planForm.slug || planForm.name?.toLowerCase().replace(/\s+/g, "-") };
    const { error } = editingPlanId
      ? await db.from("pingo_card_plans").update(payload).eq("id", editingPlanId)
      : await db.from("pingo_card_plans").insert(payload);
    if (error) { toast.error("Erro ao salvar plano", { description: error.message }); return; }
    toast.success(editingPlanId ? "Plano atualizado" : "Plano criado");
    setPlanOpen(false);
    void load();
  };

  const deletePlan = async (id: string) => {
    const ok = await confirm({
      title: "Excluir plano?",
      description: "Assinaturas existentes nesse plano não serão afetadas, mas novos clientes não poderão mais escolher esse plano.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await db.from("pingo_card_plans").delete().eq("id", id);
    if (error) { toast.error("Erro", { description: error.message }); return; }
    toast.success("Plano excluído");
    void load();
  };

  // ── PARTNERS ──
  const openPartnerForm = (p?: Partner) => {
    if (p) { setPartnerForm(p); setEditingPartnerId(p.id); }
    else { setPartnerForm(emptyPartner); setEditingPartnerId(null); }
    setPartnerOpen(true);
  };

  const savePartner = async () => {
    const { error } = editingPartnerId
      ? await db.from("pingo_card_partners").update(partnerForm).eq("id", editingPartnerId)
      : await db.from("pingo_card_partners").insert(partnerForm);
    if (error) { toast.error("Erro ao salvar parceiro", { description: error.message }); return; }
    toast.success(editingPartnerId ? "Parceiro atualizado" : "Parceiro criado");
    setPartnerOpen(false);
    void load();
  };

  const deletePartner = async (id: string) => {
    const ok = await confirm({
      title: "Excluir parceiro?",
      description: "O parceiro deixará de aparecer na rede credenciada e não dará mais descontos.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await db.from("pingo_card_partners").delete().eq("id", id);
    if (error) { toast.error("Erro", { description: error.message }); return; }
    toast.success("Parceiro excluído");
    void load();
  };

  // KPIs
  const activeSubscriptions = subscriptions.filter((s) => s.status === "active").length;
  const mrr = subscriptions
    .filter((s) => s.status === "active" && s.billing_cycle === "monthly")
    .reduce((sum, s) => {
      const plan = plans.find((p) => p.name === s.plan?.name);
      return sum + (plan?.price_monthly ?? 0);
    }, 0);
  const totalSavings = subscriptions.reduce((sum, s) => sum + Number(s.total_savings ?? 0), 0);

  return (
    <DashboardLayout title="Pingo Card" nav={nav} role="admin">
      <div className="space-y-6">
        <AdminPageHeader
          icon={HeartIcon}
          title="Pingo Card"
          description="Gestão completa do programa de cartão de benefícios"
        />

        {/* KPIs */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Assinantes ativos</p>
                  <p className="text-xl font-bold">{activeSubscriptions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <TrendUp size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">MRR</p>
                  <p className="text-xl font-bold">{formatBRL(mrr)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Storefront size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Parceiros</p>
                  <p className="text-xl font-bold">{partners.filter((p) => p.is_active).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Heart size={20} weight="fill" />
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Economia gerada</p>
                  <p className="text-xl font-bold">{formatBRL(totalSavings)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="plans">
          <TabsList>
            <TabsTrigger value="plans">Planos ({plans.length})</TabsTrigger>
            <TabsTrigger value="partners">Parceiros ({partners.length})</TabsTrigger>
            <TabsTrigger value="subscribers">Assinantes ({subscriptions.length})</TabsTrigger>
          </TabsList>

          {/* PLANS */}
          <TabsContent value="plans" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Configure os planos disponíveis para os pacientes.</p>
              <Button onClick={() => openPlanForm()}><Plus size={16} className="mr-2" /> Novo plano</Button>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Mensal</TableHead>
                      <TableHead>Anual</TableHead>
                      <TableHead>Desc. Consultas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          {p.is_highlighted && <Badge className="text-xs mt-1">Destaque</Badge>}
                        </TableCell>
                        <TableCell>{formatBRL(Number(p.price_monthly))}</TableCell>
                        <TableCell>{formatBRL(Number(p.price_yearly))}</TableCell>
                        <TableCell>{p.consultation_discount_percent}%</TableCell>
                        <TableCell>
                          <Badge variant={p.is_active ? "default" : "secondary"}>
                            {p.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => openPlanForm(p)}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePlan(p.id)}><Trash size={14} /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PARTNERS */}
          <TabsContent value="partners" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Cadastre parceiros que oferecem descontos aos titulares do cartão.</p>
              <Button onClick={() => openPartnerForm()}><Plus size={16} className="mr-2" /> Novo parceiro</Button>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                        <TableCell>{p.discount_percent}%</TableCell>
                        <TableCell>{p.city ? `${p.city}/${p.state}` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.is_active ? "default" : "secondary"}>
                            {p.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => openPartnerForm(p)}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePartner(p.id)}><Trash size={14} /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUBSCRIBERS */}
          <TabsContent value="subscribers" className="space-y-4">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cartão</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Cobrança</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Economia</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum assinante ainda</TableCell></TableRow>
                    ) : subscriptions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.card_number}</TableCell>
                        <TableCell>{s.plan?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{s.billing_cycle === "yearly" ? "Anual" : "Mensal"}</Badge></TableCell>
                        <TableCell>{format(new Date(s.started_at), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{formatBRL(Number(s.total_savings ?? 0))}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : s.status === "canceled" ? "destructive" : "secondary"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* PLAN DIALOG */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlanId ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nome</Label><Input value={planForm.name ?? ""} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} /></div>
            <div><Label>Slug</Label><Input value={planForm.slug ?? ""} onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })} placeholder="auto-gerado" /></div>
            <div className="col-span-2"><Label>Tagline</Label><Input value={planForm.tagline ?? ""} onChange={(e) => setPlanForm({ ...planForm, tagline: e.target.value })} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={planForm.description ?? ""} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} /></div>
            <div><Label>Preço mensal (R$)</Label><Input type="number" step="0.01" value={planForm.price_monthly ?? 0} onChange={(e) => setPlanForm({ ...planForm, price_monthly: Number(e.target.value) })} /></div>
            <div><Label>Preço anual (R$)</Label><Input type="number" step="0.01" value={planForm.price_yearly ?? 0} onChange={(e) => setPlanForm({ ...planForm, price_yearly: Number(e.target.value) })} /></div>
            <div><Label>% Desconto consultas</Label><Input type="number" value={planForm.consultation_discount_percent ?? 0} onChange={(e) => setPlanForm({ ...planForm, consultation_discount_percent: Number(e.target.value) })} /></div>
            <div><Label>% Desconto exames</Label><Input type="number" value={planForm.exam_discount_percent ?? 0} onChange={(e) => setPlanForm({ ...planForm, exam_discount_percent: Number(e.target.value) })} /></div>
            <div><Label>% Desconto parceiros</Label><Input type="number" value={planForm.partner_discount_percent ?? 0} onChange={(e) => setPlanForm({ ...planForm, partner_discount_percent: Number(e.target.value) })} /></div>
            <div><Label>Máx. dependentes</Label><Input type="number" value={planForm.max_dependents ?? 0} onChange={(e) => setPlanForm({ ...planForm, max_dependents: Number(e.target.value) })} /></div>
            <div className="col-span-2"><Label>Benefícios (1 por linha)</Label><Textarea rows={5} value={benefitsInput} onChange={(e) => setBenefitsInput(e.target.value)} placeholder={"15% em consultas\n10% em exames"} /></div>
            <div><Label>Ordem</Label><Input type="number" value={planForm.display_order ?? 0} onChange={(e) => setPlanForm({ ...planForm, display_order: Number(e.target.value) })} /></div>
            <div className="space-y-2 pt-6">
              <div className="flex items-center gap-2"><Switch checked={planForm.is_highlighted ?? false} onCheckedChange={(v) => setPlanForm({ ...planForm, is_highlighted: v })} /><Label>Destaque</Label></div>
              <div className="flex items-center gap-2"><Switch checked={planForm.is_active ?? true} onCheckedChange={(v) => setPlanForm({ ...planForm, is_active: v })} /><Label>Ativo</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={savePlan}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PARTNER DIALOG */}
      <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPartnerId ? "Editar parceiro" : "Novo parceiro"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={partnerForm.name ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={partnerForm.category} onValueChange={(v) => setPartnerForm({ ...partnerForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="farmacia">Farmácia</SelectItem>
                  <SelectItem value="laboratorio">Laboratório</SelectItem>
                  <SelectItem value="otica">Ótica</SelectItem>
                  <SelectItem value="academia">Academia</SelectItem>
                  <SelectItem value="clinica">Clínica</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>% Desconto</Label><Input type="number" value={partnerForm.discount_percent ?? 0} onChange={(e) => setPartnerForm({ ...partnerForm, discount_percent: Number(e.target.value) })} /></div>
            <div className="col-span-2"><Label>Descrição do desconto</Label><Input value={partnerForm.discount_description ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, discount_description: e.target.value })} placeholder="Ex: 20% em medicamentos genéricos" /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={partnerForm.description ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })} /></div>
            <div><Label>Cidade</Label><Input value={partnerForm.city ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, city: e.target.value })} /></div>
            <div><Label>Estado (UF)</Label><Input maxLength={2} value={partnerForm.state ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, state: e.target.value.toUpperCase() })} /></div>
            <div><Label>Telefone</Label><Input value={partnerForm.phone ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} /></div>
            <div><Label>Site</Label><Input value={partnerForm.website ?? ""} onChange={(e) => setPartnerForm({ ...partnerForm, website: e.target.value })} /></div>
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2"><Switch checked={partnerForm.is_featured ?? false} onCheckedChange={(v) => setPartnerForm({ ...partnerForm, is_featured: v })} /><Label>Destaque</Label></div>
              <div className="flex items-center gap-2"><Switch checked={partnerForm.is_active ?? true} onCheckedChange={(v) => setPartnerForm({ ...partnerForm, is_active: v })} /><Label>Ativo</Label></div>
            </div>
            <div><Label>Ordem</Label><Input type="number" value={partnerForm.display_order ?? 0} onChange={(e) => setPartnerForm({ ...partnerForm, display_order: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerOpen(false)}>Cancelar</Button>
            <Button onClick={savePartner}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminPingoCard;
