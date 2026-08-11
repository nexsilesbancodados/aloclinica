import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Users, Ticket, Briefcase, Handshake, FileText, Download, Upload, Gavel, HeartHandshake, Building2, Search, TrendingUp, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Contrato = {
  id: string;
  nome: string;
  tipo: "empresa" | "prefeitura" | "ong" | "plano_proprio";
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  modelo_cobranca: "mensal" | "pacote_pre_pago" | "gratuito_patrocinado";
  valor_consulta: number | null;
  cota_total: number | null;
  cota_utilizada: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  subdominio: string | null;
  status: "ativo" | "pausado" | "encerrado";
  observacoes: string | null;
  numero_processo?: string | null;
  numero_empenho?: string | null;
  modalidade_licitacao?: string | null;
};

const emptyForm = {
  nome: "",
  tipo: "empresa" as Contrato["tipo"],
  cnpj: "",
  contato_nome: "",
  contato_email: "",
  contato_telefone: "",
  modelo_cobranca: "pacote_pre_pago" as Contrato["modelo_cobranca"],
  valor_consulta: "",
  cota_total: "",
  vigencia_inicio: new Date().toISOString().slice(0, 10),
  vigencia_fim: "",
  subdominio: "",
  observacoes: "",
  numero_processo: "",
  numero_empenho: "",
  modalidade_licitacao: "",
};

const AdminContratos = () => {
  const nav = getAdminNav("contratos");
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Contrato | null>(null);
  const [benefOpen, setBenefOpen] = useState(false);
  const [vouchOpen, setVouchOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [faturaOpen, setFaturaOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "licitacoes" | "acoes" | "orgaos">("overview");
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | Contrato["status"]>("todos");

  const fetch = async () => {
    setLoading(true);
    const { data } = await db.from("contratos").select("*").order("created_at", { ascending: false });
    setContratos((data ?? []) as Contrato[]);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // ─── Derivações por aba ────────────────────────────────────────────────
  const filtrar = (lista: Contrato[]) => {
    const q = search.trim().toLowerCase();
    return lista.filter((c) => {
      if (statusFiltro !== "todos" && c.status !== statusFiltro) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        (c.cnpj ?? "").toLowerCase().includes(q) ||
        (c.numero_processo ?? "").toLowerCase().includes(q) ||
        (c.subdominio ?? "").toLowerCase().includes(q)
      );
    });
  };

  const licitacoes = filtrar(contratos.filter((c) => c.tipo === "prefeitura"));
  const acoes = filtrar(contratos.filter((c) => c.tipo === "ong"));
  const orgaos = filtrar(contratos.filter((c) => c.tipo === "empresa" || c.tipo === "plano_proprio"));

  // KPIs
  const totalAtivos = contratos.filter((c) => c.status === "ativo").length;
  const totalConsumido = contratos.reduce((s, c) => s + (c.cota_utilizada || 0), 0);
  const totalContratado = contratos.reduce((s, c) => s + (c.cota_total || 0), 0);
  const totalVidas = 4520; // Simulated total beneficiaries

  const valorPrevistoMes = contratos
    .filter((c) => c.status === "ativo" && c.valor_consulta)
    .reduce((s, c) => s + Number(c.valor_consulta) * (c.cota_total || 0), 0);
  const vencendo30d = contratos.filter((c) => {
    if (!c.vigencia_fim) return false;
    const diff = (new Date(c.vigencia_fim).getTime() - Date.now()) / 86400000;
    return diff > 0 && diff <= 30;
  }).length;

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      cnpj: form.cnpj || null,
      contato_nome: form.contato_nome || null,
      contato_email: form.contato_email || null,
      contato_telefone: form.contato_telefone || null,
      modelo_cobranca: form.modelo_cobranca,
      valor_consulta: form.valor_consulta ? Number(form.valor_consulta) : null,
      cota_total: form.cota_total ? Number(form.cota_total) : null,
      vigencia_inicio: form.vigencia_inicio,
      vigencia_fim: form.vigencia_fim || null,
      subdominio: form.subdominio || null,
      observacoes: form.observacoes || null,
      numero_processo: form.numero_processo || null,
      numero_empenho: form.numero_empenho || null,
      modalidade_licitacao: form.modalidade_licitacao || null,
    };
    const { error } = await db.from("contratos").insert(payload);
    if (error) { toast.error("Erro ao criar", { description: error.message }); return; }
    toast.success("Contrato criado");
    setOpen(false);
    setForm(emptyForm);
    fetch();
  };

  const updateStatus = async (id: string, status: Contrato["status"]) => {
    await db.from("contratos").update({ status }).eq("id", id);
    fetch();
  };

  const removerContrato = async (id: string) => {
    if (!confirm("Excluir este contrato? Isso remove beneficiários e vouchers vinculados.")) return;
    await db.from("contratos").delete().eq("id", id);
    toast.success("Removido");
    fetch();
  };

  const statusBadge = (s: Contrato["status"]) => {
    const map = { ativo: "default", pausado: "secondary", encerrado: "destructive" } as const;
    return <Badge variant={map[s]}>{s}</Badge>;
  };

  const Kpi = ({ icon: Icon, label, value, accent }: any) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );

  const Linha = ({ c, mostrarProcesso = false }: { c: Contrato; mostrarProcesso?: boolean }) => (
    <TableRow key={c.id}>
      <TableCell className="font-medium">{c.nome}</TableCell>
      {mostrarProcesso && (
        <TableCell className="text-xs">
          {c.numero_processo ? (
            <div>
              <div className="font-mono">{c.numero_processo}</div>
              {c.modalidade_licitacao && <div className="text-muted-foreground">{c.modalidade_licitacao.replace(/_/g, " ")}</div>}
            </div>
          ) : "—"}
        </TableCell>
      )}
      <TableCell className="text-xs">{c.modelo_cobranca.replace(/_/g, " ")}</TableCell>
      <TableCell>
        {c.cota_utilizada}{c.cota_total ? ` / ${c.cota_total}` : ""}
        {c.cota_total ? (
          <div className="h-1 mt-1 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, (c.cota_utilizada / c.cota_total) * 100)}%` }}
            />
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-xs">{c.vigencia_fim ?? "—"}</TableCell>
      <TableCell>{statusBadge(c.status)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap">
        <Button size="sm" variant="ghost" onClick={() => { setSelected(c); setBenefOpen(true); }} title="Beneficiários"><Users className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setSelected(c); setVouchOpen(true); }} title="Vouchers"><Ticket className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setSelected(c); setDocsOpen(true); }} title="Documentos"><FileText className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setSelected(c); setFaturaOpen(true); }} title="Faturamento"><Download className="h-4 w-4" /></Button>
        <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v as Contrato["status"])}>
          <SelectTrigger className="inline-flex w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">ativo</SelectItem>
            <SelectItem value="pausado">pausado</SelectItem>
            <SelectItem value="encerrado">encerrado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => removerContrato(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </TableCell>
    </TableRow>
  );

  const Tabela = ({ lista, mostrarProcesso = false, vazio }: { lista: Contrato[]; mostrarProcesso?: boolean; vazio: string }) => (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-30" />
            {vazio}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                {mostrarProcesso && <TableHead>Processo / Modalidade</TableHead>}
                <TableHead>Cobrança</TableHead>
                <TableHead>Cota</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => <Linha key={c.id} c={c} mostrarProcesso={mostrarProcesso} />)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout title="Contratos & Ações" nav={nav}>
      <AdminPageHeader
        icon={Handshake}
        title="Contratos e Ações Sociais"
        description="Empresas, prefeituras, ONGs e campanhas sociais que usam a plataforma."
        accent="from-emerald-500 to-teal-600"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi icon={Users} label="Total de Vidas" value={totalVidas} accent="bg-blue-500" />
        <Kpi icon={Gavel} label="Licitações" value={contratos.filter(c => c.tipo === "prefeitura").length} accent="bg-blue-600" />
        <Kpi icon={HeartHandshake} label="Ações sociais" value={contratos.filter(c => c.tipo === "ong").length} accent="bg-pink-500" />
        <Kpi icon={TrendingUp} label="Consultas (consumo/cota)" value={`${totalConsumido}${totalContratado ? ` / ${totalContratado}` : ""}`} accent="bg-purple-500" />
        <Kpi icon={AlertCircle} label="Vencem em 30 dias" value={vencendo30d} accent="bg-amber-500" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center justify-between mb-3">
        <div className="flex gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome, CNPJ, processo, subdomínio..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="pausado">Pausados</SelectItem>
              <SelectItem value="encerrado">Encerrados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo contrato</Button>
      </div>

      {/* Abas */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-3">
          <TabsTrigger value="overview"><Briefcase className="h-4 w-4 mr-1" />Visão geral</TabsTrigger>
          <TabsTrigger value="licitacoes"><Gavel className="h-4 w-4 mr-1" />Licitações <Badge variant="secondary" className="ml-2">{licitacoes.length}</Badge></TabsTrigger>
          <TabsTrigger value="acoes"><HeartHandshake className="h-4 w-4 mr-1" />Ações sociais <Badge variant="secondary" className="ml-2">{acoes.length}</Badge></TabsTrigger>
          <TabsTrigger value="orgaos"><Building2 className="h-4 w-4 mr-1" />Órgãos & Empresas <Badge variant="secondary" className="ml-2">{orgaos.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="text-sm text-muted-foreground mb-2">
            Valor previsto (cota × valor/consulta dos ativos): <strong className="text-foreground">R$ {valorPrevistoMes.toFixed(2).replace(".", ",")}</strong>
          </div>
          <Tabela lista={filtrar(contratos)} mostrarProcesso vazio="Nenhum contrato cadastrado ainda." />
        </TabsContent>

        <TabsContent value="licitacoes">
          <Tabela lista={licitacoes} mostrarProcesso vazio="Nenhuma licitação registrada. Crie um contrato do tipo Prefeitura/Órgão público." />
        </TabsContent>

        <TabsContent value="acoes">
          <Tabela lista={acoes} vazio="Nenhuma ação social cadastrada. Crie um contrato do tipo ONG/Ação social." />
        </TabsContent>

        <TabsContent value="orgaos">
          <Tabela lista={orgaos} vazio="Nenhuma empresa ou plano próprio cadastrado." />
        </TabsContent>
      </Tabs>

      {/* Dialog: novo contrato */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome*</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Contrato["tipo"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="prefeitura">Prefeitura / órgão público</SelectItem>
                  <SelectItem value="ong">ONG / ação social</SelectItem>
                  <SelectItem value="plano_proprio">Plano próprio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo de cobrança</Label>
              <Select value={form.modelo_cobranca} onValueChange={(v) => setForm({ ...form, modelo_cobranca: v as Contrato["modelo_cobranca"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal pós-pago</SelectItem>
                  <SelectItem value="pacote_pre_pago">Pacote pré-pago</SelectItem>
                  <SelectItem value="gratuito_patrocinado">Gratuito patrocinado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
            <div><Label>Subdomínio (ex: prefeitura-x)</Label><Input value={form.subdominio} onChange={(e) => setForm({ ...form, subdominio: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
            <div><Label>Contato — nome</Label><Input value={form.contato_nome} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} /></div>
            <div><Label>Contato — e-mail</Label><Input type="email" value={form.contato_email} onChange={(e) => setForm({ ...form, contato_email: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.contato_telefone} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} /></div>
            <div><Label>Valor por consulta (R$)</Label><Input type="number" step="0.01" value={form.valor_consulta} onChange={(e) => setForm({ ...form, valor_consulta: e.target.value })} /></div>
            <div><Label>Cota total de consultas</Label><Input type="number" value={form.cota_total} onChange={(e) => setForm({ ...form, cota_total: e.target.value })} /></div>
            <div><Label>Início vigência</Label><Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} /></div>
            <div><Label>Fim vigência</Label><Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
            <div className="col-span-2 mt-2 border-t pt-3">
              <Label className="text-xs uppercase text-muted-foreground">Dados de licitação (se for órgão público)</Label>
            </div>
            <div><Label>Nº do processo</Label><Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="ex: 023.456/2026" /></div>
            <div><Label>Nº do empenho</Label><Input value={form.numero_empenho} onChange={(e) => setForm({ ...form, numero_empenho: e.target.value })} /></div>
            <div className="col-span-2">
              <Label>Modalidade</Label>
              <Select value={form.modalidade_licitacao || "—"} onValueChange={(v) => setForm({ ...form, modalidade_licitacao: v === "—" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="—">— Não se aplica</SelectItem>
                  <SelectItem value="pregao_eletronico">Pregão eletrônico</SelectItem>
                  <SelectItem value="pregao_presencial">Pregão presencial</SelectItem>
                  <SelectItem value="dispensa">Dispensa</SelectItem>
                  <SelectItem value="inexigibilidade">Inexigibilidade</SelectItem>
                  <SelectItem value="rdc">RDC</SelectItem>
                  <SelectItem value="concorrencia">Concorrência</SelectItem>
                  <SelectItem value="credenciamento">Credenciamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar contrato</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && <BeneficiariosDialog open={benefOpen} onOpenChange={setBenefOpen} contrato={selected} />}
      {selected && <VouchersDialog open={vouchOpen} onOpenChange={setVouchOpen} contrato={selected} />}
      {selected && <DocumentosDialog open={docsOpen} onOpenChange={setDocsOpen} contrato={selected} />}
      {selected && <FaturamentoDialog open={faturaOpen} onOpenChange={setFaturaOpen} contrato={selected} />}
    </DashboardLayout>
  );
};

/* ─── Beneficiários (sub-dialog) ─────────────────────────────────────────── */

function BeneficiariosDialog({ open, onOpenChange, contrato }: { open: boolean; onOpenChange: (v: boolean) => void; contrato: Contrato }) {
  const [list, setList] = useState<any[]>([]);
  const [bulk, setBulk] = useState("");

  const load = useCallback(async () => {
    const { data } = await db.from("contrato_beneficiarios").select("*").eq("contrato_id", contrato.id).order("created_at", { ascending: false });
    setList(data ?? []);
  }, [contrato.id]);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const importar = async () => {
    const linhas = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) return;
    const rows = linhas.map((line) => {
      const [email, cpf, nome] = line.split(",").map((s) => s?.trim());
      return { contrato_id: contrato.id, email: email || null, cpf: cpf || null, nome: nome || null, ativo: true };
    });
    const { error } = await db.from("contrato_beneficiarios").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} beneficiário(s) importado(s)`);
    setBulk("");
    load();
  };

  const remover = async (id: string) => {
    await db.from("contrato_beneficiarios").delete().eq("id", id);
    load();
  };

  // Lê um arquivo .csv e joga no campo (ignora linha de cabeçalho, se houver).
  const onCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (linhas.length && /e-?mail|cpf|nome/i.test(linhas[0]) && !/@/.test(linhas[0])) {
      linhas.shift(); // descarta cabeçalho
    }
    setBulk((prev) => (prev ? prev + "\n" : "") + linhas.join("\n"));
    toast.success(`${linhas.length} linha(s) carregada(s) do CSV — revise e clique em Importar`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Beneficiários — {contrato.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Importar (uma linha por pessoa: <code>email,cpf,nome</code>)</Label>
            <Textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="joao@empresa.com,12345678900,João Silva" />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={importar}>Importar</Button>
              <input
                id="benef-csv" type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { onCsvFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
              />
              <Button size="sm" variant="outline" asChild>
                <label htmlFor="benef-csv" className="cursor-pointer"><Upload className="h-4 w-4 mr-1" />Carregar CSV</label>
              </Button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto border rounded">
            <Table>
              <TableHeader><TableRow><TableHead>E-mail</TableHead><TableHead>CPF</TableHead><TableHead>Nome</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.email}</TableCell><TableCell>{b.cpf}</TableCell><TableCell>{b.nome}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => remover(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
                {!list.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nenhum beneficiário</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Vouchers (sub-dialog) ──────────────────────────────────────────────── */

function VouchersDialog({ open, onOpenChange, contrato }: { open: boolean; onOpenChange: (v: boolean) => void; contrato: Contrato }) {
  const [list, setList] = useState<any[]>([]);
  const [codigo, setCodigo] = useState("");
  const [usos, setUsos] = useState("1");
  const [validade, setValidade] = useState("");

  const load = useCallback(async () => {
    const { data } = await db.from("vouchers").select("*").eq("contrato_id", contrato.id).order("created_at", { ascending: false });
    setList(data ?? []);
  }, [contrato.id]);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const criar = async () => {
    if (!codigo.trim()) return;
    const { error } = await db.from("vouchers").insert({
      contrato_id: contrato.id,
      codigo: codigo.trim().toUpperCase(),
      usos_maximos: Number(usos) || 1,
      validade_fim: validade || null,
      ativo: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Voucher criado");
    setCodigo(""); setUsos("1"); setValidade("");
    load();
  };

  const remover = async (id: string) => {
    await db.from("vouchers").delete().eq("id", id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Vouchers — {contrato.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-4 gap-2 items-end">
          <div className="col-span-2"><Label>Código</Label><Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="EX: SAUDE2026" /></div>
          <div><Label>Usos máx</Label><Input type="number" value={usos} onChange={(e) => setUsos(e.target.value)} /></div>
          <div><Label>Validade</Label><Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></div>
          <div className="col-span-4"><Button size="sm" onClick={criar}>Gerar voucher</Button></div>
        </div>
        <div className="max-h-72 overflow-auto border rounded mt-3">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Usos</TableHead><TableHead>Validade</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono">{v.codigo}</TableCell>
                  <TableCell>{v.usos_atuais}/{v.usos_maximos}</TableCell>
                  <TableCell>{v.validade_fim ?? "—"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => remover(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {!list.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nenhum voucher</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AdminContratos;

/* ─── Documentos do contrato (anexos) ─────────────────────────────────────── */

function DocumentosDialog({ open, onOpenChange, contrato }: { open: boolean; onOpenChange: (v: boolean) => void; contrato: Contrato }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [tipo, setTipo] = useState("edital");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db.from("contrato_documentos").select("*").eq("contrato_id", contrato.id).order("created_at", { ascending: false });
    setDocs(data ?? []);
  }, [contrato.id]);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${contrato.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("contrato-docs").upload(path, file);
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    await db.from("contrato_documentos").insert({
      contrato_id: contrato.id,
      tipo,
      nome: file.name,
      storage_path: path,
      tamanho_bytes: file.size,
    });
    toast.success("Documento anexado");
    setUploading(false);
    e.target.value = "";
    load();
  };

  const baixar = async (d: any) => {
    const { data } = await supabase.storage.from("contrato-docs").createSignedUrl(d.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const remover = async (d: any) => {
    await supabase.storage.from("contrato-docs").remove([d.storage_path]);
    await db.from("contrato_documentos").delete().eq("id", d.id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Documentos — {contrato.nome}</DialogTitle></DialogHeader>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="edital">Edital</SelectItem>
                <SelectItem value="contrato">Contrato</SelectItem>
                <SelectItem value="aditivo">Termo aditivo</SelectItem>
                <SelectItem value="empenho">Nota de empenho</SelectItem>
                <SelectItem value="nota_fiscal">Nota fiscal</SelectItem>
                <SelectItem value="ata">Ata / portaria</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
            <Button asChild size="sm"><span><Upload className="h-4 w-4 mr-1" />{uploading ? "Enviando..." : "Anexar"}</span></Button>
          </label>
        </div>
        <div className="max-h-72 overflow-auto border rounded mt-3">
          <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Nome</TableHead><TableHead>Tamanho</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><Badge variant="secondary">{d.tipo}</Badge></TableCell>
                  <TableCell className="text-xs">{d.nome}</TableCell>
                  <TableCell className="text-xs">{d.tamanho_bytes ? `${Math.round(d.tamanho_bytes / 1024)} KB` : "—"}</TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => baixar(d)}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remover(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!docs.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nenhum documento</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Faturamento por contrato (relatório CSV) ───────────────────────────── */

function FaturamentoDialog({ open, onOpenChange, contrato }: { open: boolean; onOpenChange: (v: boolean) => void; contrato: Contrato }) {
  const hoje = new Date();
  const primDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const ultDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(primDia);
  const [fim, setFim] = useState(ultDia);
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const gerar = async () => {
    setLoading(true);
    const { data } = await db
      .from("consulta_contrato")
      .select("id, appointment_id, valor_repassado, patient_user_id, created_at")
      .eq("contrato_id", contrato.id)
      .gte("created_at", `${inicio}T00:00:00`)
      .lte("created_at", `${fim}T23:59:59`)
      .order("created_at", { ascending: false });
    setLinhas(data ?? []);
    setLoading(false);
  };

  const total = linhas.reduce((sum, l) => sum + (Number(l.valor_repassado) || 0), 0);

  const exportCsv = () => {
    // Bloco de medição (para empenho/NF — Lei 14.133/2021)
    const valorUnit = linhas.length ? (total / linhas.length) : 0;
    const medicao = [
      `Relatório de Medição`,
      `Contrato,${contrato.nome}`,
      `CNPJ,${contrato.cnpj ?? ""}`,
      `Competência,${inicio} a ${fim}`,
      `Consultas realizadas,${linhas.length}`,
      `Valor unitário médio,${valorUnit.toFixed(2).replace(".", ",")}`,
      `Valor total,${total.toFixed(2).replace(".", ",")}`,
      ``, // linha em branco separando do detalhamento
    ];
    const header = ["Data", "Appointment", "Paciente", "Valor"].join(",");
    const rows = linhas.map((l) => [
      new Date(l.created_at).toLocaleString("pt-BR"),
      l.appointment_id,
      l.patient_user_id,
      (l.valor_repassado ?? 0).toString().replace(".", ","),
    ].join(","));
    const csv = [...medicao, header, ...rows, `Total,,,${total.toString().replace(".", ",")}`].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faturamento-${contrato.nome.replace(/\s+/g, "-")}-${inicio}-a-${fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Faturamento — {contrato.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div><Label>Início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button onClick={gerar} disabled={loading}>{loading ? "Gerando..." : "Gerar"}</Button>
            <Button variant="outline" onClick={exportCsv} disabled={!linhas.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
          </div>
        </div>
        <div className="mt-3 text-sm">
          <strong>{linhas.length}</strong> consulta(s) — Total: <strong>R$ {total.toFixed(2).replace(".", ",")}</strong>
        </div>
        <div className="max-h-72 overflow-auto border rounded mt-2">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Paciente</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-xs font-mono">{l.patient_user_id.slice(0, 8)}</TableCell>
                  <TableCell>R$ {(l.valor_repassado ?? 0).toFixed(2).replace(".", ",")}</TableCell>
                </TableRow>
              ))}
              {!linhas.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Selecione o período e clique em "Gerar"</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
