import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Copy,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Video,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { AdminPageHeader } from "./AdminPageHeader";
import { getAdminNav } from "./adminNav";
import { AdminEmpty, AdminLoading } from "./AdminStateBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/integrations/supabase/untyped";
import { SUPABASE_PROJECT_ID } from "@/lib/supabase-config";
import { useServiceHealth, type ServiceCheck } from "@/hooks/use-service-health";
import {
  SECRET_DEFINITIONS as SECRET_CATALOG,
  RUNTIME_FLAGS as RUNTIME_FLAG_CATALOG,
} from "../../../supabase/functions/_shared/secret-catalog";

type SecretStatus = boolean | null;
type SecretFilter = "all" | "configured" | "missing" | "editable";

interface SecretRow {
  key: string;
  label: string;
  group: string;
  required: boolean;
  description: string;
  configured: SecretStatus;
  editable?: boolean;
}

interface RuntimeFlag {
  key: string;
  label: string;
  severity: "danger" | "warning";
  description: string;
  enabled: boolean | null;
}

const serviceIcons: Record<string, ReactNode> = {
  database: <Database className="h-4 w-4" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
  email: <Mail className="h-4 w-4" aria-hidden="true" />,
  video: <Video className="h-4 w-4" aria-hidden="true" />,
  payments: <Activity className="h-4 w-4" aria-hidden="true" />,
  auth: <LockKeyhole className="h-4 w-4" aria-hidden="true" />,
  storage: <Database className="h-4 w-4" aria-hidden="true" />,
  kyc: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
  nfse: <FileCheck2 className="h-4 w-4" aria-hidden="true" />,
  backup: <ClipboardCheck className="h-4 w-4" aria-hidden="true" />,
};

const serviceLabel: Record<string, string> = {
  database: "Banco de dados",
  whatsapp: "WhatsApp / Evolution",
  email: "E-mail / Brevo",
  video: "Vídeo / MiroTalk",
  payments: "Mercado Pago",
  auth: "Autenticação",
  storage: "Armazenamento",
  kyc: "KYC / CompreFace",
  nfse: "NFS-e / Focus",
  backup: "Backup diário",
};

const formatDate = (value?: string | null) => {
  if (!value) return "Ainda não verificado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
};

const copyText = async (value: string, label: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("Não foi possível copiar", { description: "Copie o texto manualmente." });
  }
};

const statusMeta = (status: ServiceCheck["status"]) => {
  if (status === "ok") return { label: "Operacional", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> };
  if (status === "down") return { label: "Falha", className: "bg-destructive/10 text-destructive border-destructive/20", icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> };
  return { label: "Não configurado", className: "bg-amber-500/10 text-amber-700 border-amber-500/20", icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> };
};

const AdminMaintenanceCenterV2 = () => {
  const health = useServiceHealth({ poll: false });
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [flags, setFlags] = useState<RuntimeFlag[]>([]);
  const [secretLoading, setSecretLoading] = useState(true);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [secretFilter, setSecretFilter] = useState<SecretFilter>("all");
  const [secretSearch, setSecretSearch] = useState("");
  const nav = getAdminNav("maintenance");

  const loadSecrets = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setSecretLoading(true);
    setSecretError(null);
    try {
      const { data, error } = await db.functions.invoke("admin-secret-manager", { body: { action: "status" } });
      if (error || !Array.isArray(data?.secrets)) {
        setSecrets(SECRET_CATALOG.map((secret) => ({ ...secret, configured: null })));
        setFlags(RUNTIME_FLAG_CATALOG.map((flag) => ({ ...flag, enabled: null })));
        setSecretError("O inventário não respondeu. Nenhum valor de secret é lido pelo navegador.");
        return;
      }
      const serverSecrets = data.secrets.filter((row: Partial<SecretRow>) =>
        typeof row.key === "string" && typeof row.label === "string" && typeof row.group === "string" && typeof row.required === "boolean" && typeof row.description === "string" && typeof row.configured === "boolean",
      ) as SecretRow[];
      setSecrets(serverSecrets);
      const serverFlags = Array.isArray(data.flags) ? data.flags.filter((row: Partial<RuntimeFlag>) =>
        typeof row.key === "string" && typeof row.label === "string" && (row.severity === "danger" || row.severity === "warning") && typeof row.description === "string" && typeof row.enabled === "boolean",
      ) as RuntimeFlag[] : [];
      setFlags(serverFlags);
    } catch {
      setSecrets(SECRET_CATALOG.map((secret) => ({ ...secret, configured: null })));
      setFlags(RUNTIME_FLAG_CATALOG.map((flag) => ({ ...flag, enabled: null })));
      setSecretError("Não foi possível consultar o inventário. Nenhum valor de secret é lido pelo navegador.");
    } finally {
      setSecretLoading(false);
    }
  }, []);

  const loadBackupStatus = useCallback(async () => {
    const { data } = await db.from("activity_logs").select("created_at").eq("action", "daily_backup_run").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setLastBackupAt(data?.created_at ?? null);
  }, []);

  useEffect(() => {
    void Promise.allSettled([loadSecrets(), loadBackupStatus()]);
  }, [loadBackupStatus, loadSecrets]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.allSettled([health.refresh(), loadSecrets(), loadBackupStatus()]);
    setRefreshing(false);
    toast.success("Diagnóstico atualizado");
  };

  const runBackup = async () => {
    if (!window.confirm("Executar um backup completo agora? A operação lê os dados operacionais e grava uma cópia privada no Storage.")) return;
    setBackupRunning(true);
    try {
      const { data, error } = await db.functions.invoke("daily-backup", { body: { source: "admin-maintenance" } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Backup não executado");
      await loadBackupStatus();
      toast.success("Backup concluído", { description: `${Object.keys(data?.summary ?? {}).length} conjuntos processados.` });
    } catch (error) {
      toast.error("Não foi possível executar o backup", { description: error instanceof Error ? error.message : "Verifique os logs da função daily-backup." });
    } finally {
      setBackupRunning(false);
    }
  };

  const managementReady = secrets.some((secret) => secret.key === "PROJECT_SECRETS_MANAGEMENT_TOKEN" && secret.configured === true);
  const saveSecrets = async () => {
    if (!managementReady) {
      toast.error("Configure primeiro o token de gerenciamento", { description: "Preencha PROJECT_SECRETS_MANAGEMENT_TOKEN no Supabase e atualize o diagnóstico." });
      return;
    }
    const updates = Object.entries(secretDrafts)
      .map(([key, value]) => ({ key, value: value.trim() }))
      .filter(({ value }) => value.length > 0);
    if (updates.length === 0) {
      toast.error("Nenhuma chave preenchida", { description: "Cole pelo menos um valor antes de salvar." });
      return;
    }
    setSavingSecrets(true);
    try {
      const { data, error } = await db.functions.invoke("admin-secret-manager", { body: { updates } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Não foi possível salvar os secrets");
      setSecretDrafts({});
      setRevealedSecrets({});
      await loadSecrets({ showLoading: false });
      toast.success(`${data?.updated ?? updates.length} chave(s) atualizada(s)`, { description: "Os valores foram removidos desta tela." });
    } catch (error) {
      toast.error("Não foi possível salvar as chaves", { description: error instanceof Error ? error.message : "Verifique a configuração do painel." });
    } finally {
      setSavingSecrets(false);
    }
  };

  const filteredSecrets = useMemo(() => {
    const query = secretSearch.trim().toLowerCase();
    return secrets.filter((secret) => {
      const matchesQuery = !query || [secret.key, secret.label, secret.group].some((value) => value.toLowerCase().includes(query));
      const matchesFilter = secretFilter === "all" || (secretFilter === "configured" && secret.configured === true) || (secretFilter === "missing" && secret.configured !== true) || (secretFilter === "editable" && secret.editable === true);
      return matchesQuery && matchesFilter;
    });
  }, [secretFilter, secretSearch, secrets]);

  const groupedSecrets = useMemo(() => filteredSecrets.reduce<Record<string, SecretRow[]>>((groups, secret) => {
    (groups[secret.group] ??= []).push(secret);
    return groups;
  }, {}), [filteredSecrets]);

  const services = health.services;
  const requiredMissing = secrets.filter((secret) => secret.required && secret.configured === false).length;
  const configuredSecrets = secrets.filter((secret) => secret.configured === true).length;
  const missingSecrets = secrets.filter((secret) => secret.configured !== true);
  const editableSecrets = secrets.filter((secret) => secret.editable === true);
  const serviceFailures = services.filter((service) => service.status === "down").length;
  const servicePending = services.filter((service) => service.status === "unconfigured").length;
  const dangerousFlags = flags.filter((flag) => flag.enabled === true && flag.severity === "danger").length;
  const enabledFlags = flags.filter((flag) => flag.enabled === true).length;
  const overallTone = serviceFailures > 0 || requiredMissing > 0 || dangerousFlags > 0 ? "danger" : servicePending > 0 || secretError || enabledFlags > 0 ? "warning" : "success";

  const renderService = (service: ServiceCheck) => {
    const meta = statusMeta(service.status);
    return <div key={service.key} className="flex items-center gap-3 rounded-xl border p-3"><div className="rounded-lg bg-muted p-2 text-muted-foreground">{serviceIcons[service.key] ?? <Server className="h-4 w-4" aria-hidden="true" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{service.label}</p><p className="truncate text-xs text-muted-foreground">{service.detail ?? "Sem detalhe"}{service.latencyMs ? ` · ${service.latencyMs}ms` : ""}</p></div><Badge variant="outline" className={`shrink-0 gap-1 ${meta.className}`}>{meta.icon}{meta.label}</Badge></div>;
  };

  const renderFlag = (flag: RuntimeFlag) => {
    const active = flag.enabled === true;
    const unknown = flag.enabled === null;
    return <div key={flag.key} className="flex items-start gap-3 rounded-xl border p-3">{unknown ? <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : active ? <XCircle className={`mt-0.5 h-4 w-4 shrink-0 ${flag.severity === "danger" ? "text-destructive" : "text-amber-600"}`} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{flag.label}</p><Badge variant="outline" className={active ? flag.severity === "danger" ? "border-destructive/30 text-destructive" : "border-amber-500/30 text-amber-700" : unknown ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700"}>{unknown ? "N/D" : active ? "Ativa" : "Desativada"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{flag.description}</p></div></div>;
  };

  return (
    <DashboardLayout title="Administração" nav={nav} role="admin">
      <div className="space-y-6 pb-24 md:pb-8">
        <AdminPageHeader icon={Settings2} eyebrow="Operação e infraestrutura" title="Centro de manutenção" description="Acompanhe serviços, configure integrações e resolva pendências em um só lugar." accent="from-slate-600 to-slate-900" actions={<Button variant="outline" size="sm" className="gap-2" onClick={refreshAll} disabled={refreshing || health.loading || secretLoading}><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />Atualizar diagnóstico</Button>} />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          { label: "Serviços verificados", value: services.length, icon: Activity, tone: "text-primary bg-primary/10" },
          { label: "Operacionais", value: health.summary.ok, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
          { label: "Secrets configurados", value: `${configuredSecrets}/${secrets.length}`, icon: KeyRound, tone: "text-amber-600 bg-amber-500/10" },
          { label: "Pendências críticas", value: serviceFailures + requiredMissing, icon: ShieldAlert, tone: overallTone === "danger" ? "text-destructive bg-destructive/10" : "text-amber-600 bg-amber-500/10" },
        ].map(({ label, value, icon: Icon, tone }) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div></CardContent></Card>)}</div>

        <Card className={overallTone === "danger" ? "border-destructive/30" : overallTone === "warning" ? "border-amber-500/30" : "border-emerald-500/30"}><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3">{overallTone === "danger" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : overallTone === "warning" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />}<div><p className="font-semibold">{overallTone === "danger" ? "Há itens que exigem intervenção" : overallTone === "warning" ? "A plataforma está verificável, mas há itens pendentes" : "Os sinais monitorados estão saudáveis"}</p><p className="mt-1 text-sm text-muted-foreground">{serviceFailures} falha(s), {servicePending} serviço(s) pendente(s), {requiredMissing} secret(s) obrigatório(s) ausente(s) e {enabledFlags} flag(s) de risco ativa(s).</p></div></div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Última verificação: {formatDate(health.lastRun?.toISOString())}</p></CardContent></Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1"><TabsTrigger value="overview" onClick={() => setActiveTab("overview")} className="gap-1.5"><Activity className="h-4 w-4" aria-hidden="true" />Visão geral</TabsTrigger><TabsTrigger value="secrets" onClick={() => setActiveTab("secrets")} className="gap-1.5"><KeyRound className="h-4 w-4" aria-hidden="true" />Chaves <Badge variant="secondary" className="ml-1">{configuredSecrets}/{secrets.length}</Badge></TabsTrigger><TabsTrigger value="services" onClick={() => setActiveTab("services")} className="gap-1.5"><Server className="h-4 w-4" aria-hidden="true" />Serviços <Badge variant="secondary" className="ml-1">{health.summary.ok}/{services.length}</Badge></TabsTrigger><TabsTrigger value="maintenance" onClick={() => setActiveTab("maintenance")} className="gap-1.5"><Settings2 className="h-4 w-4" aria-hidden="true" />Manutenção</TabsTrigger></TabsList>

          <TabsContent value="overview" className="space-y-5"><div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-primary" aria-hidden="true" />Saúde resumida</CardTitle><CardDescription>Abra Serviços para ver detalhes, latência e diagnóstico completo.</CardDescription></CardHeader><CardContent className="space-y-2">{health.loading && services.length === 0 ? <AdminLoading variant="list" count={5} /> : services.length === 0 ? <AdminEmpty title="Nenhum diagnóstico disponível" description="Execute uma verificação ou publique as funções operacionais." /> : services.slice(0, 6).map(renderService)}<Button variant="link" className="h-auto px-0 text-xs" onClick={() => setActiveTab("services")}>Ver todos os serviços <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />Situação das chaves</CardTitle><CardDescription>Mostramos presença e estado, nunca os valores.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-emerald-500/10 p-3"><p className="text-lg font-bold text-emerald-700">{configuredSecrets}</p><p className="text-[11px] text-muted-foreground">Configuradas</p></div><div className="rounded-xl bg-amber-500/10 p-3"><p className="text-lg font-bold text-amber-700">{missingSecrets.length}</p><p className="text-[11px] text-muted-foreground">Pendentes</p></div><div className="rounded-xl bg-primary/10 p-3"><p className="text-lg font-bold text-primary">{editableSecrets.length}</p><p className="text-[11px] text-muted-foreground">Editáveis</p></div></div><div className="space-y-2">{Object.entries(groupedSecrets).slice(0, 5).map(([group, rows]) => { const ok = rows.filter((secret) => secret.configured === true).length; return <div key={group} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"><span className="truncate">{group}</span><Badge variant="outline">{ok}/{rows.length}</Badge></div>; })}</div><Button variant="link" className="h-auto px-0 text-xs" onClick={() => setActiveTab("secrets")}>Abrir configuração de chaves <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></CardContent></Card>
          </div><BackupCard lastBackupAt={lastBackupAt} backupRunning={backupRunning} onRun={runBackup} /></TabsContent>

          <TabsContent value="secrets" className="space-y-5"><Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />Chaves e integrações</CardTitle><CardDescription>Filtre o que já está configurado, encontre uma chave pelo nome e cole somente valores novos.</CardDescription></CardHeader><CardContent className="space-y-5"><div className={`flex items-start gap-3 rounded-xl border p-4 ${managementReady ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}><ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${managementReady ? "text-emerald-600" : "text-amber-600"}`} aria-hidden="true" /><div><p className="text-sm font-semibold">{managementReady ? "Gerenciador pronto para salvar" : "Ative o gerenciador antes de salvar"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{managementReady ? "O token está configurado. As chaves serão enviadas somente à Edge Function protegida." : "Configure PROJECT_SECRETS_MANAGEMENT_TOKEN manualmente no Supabase e clique em Atualizar diagnóstico. Esse token não é editável aqui."}</p></div></div><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl border bg-emerald-500/5 p-3"><p className="text-xs text-muted-foreground">Já configuradas</p><p className="text-xl font-bold text-emerald-700">{configuredSecrets}</p></div><div className="rounded-xl border bg-amber-500/5 p-3"><p className="text-xs text-muted-foreground">Ainda pendentes</p><p className="text-xl font-bold text-amber-700">{missingSecrets.length}</p></div><div className="rounded-xl border bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Editáveis</p><p className="text-xl font-bold text-primary">{editableSecrets.length}</p></div></div><div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input value={secretSearch} onChange={(event) => setSecretSearch(event.target.value)} placeholder="Buscar por chave, nome ou grupo..." aria-label="Buscar secrets" className="pl-9" /></div><div className="flex flex-wrap gap-1"><Button size="sm" variant={secretFilter === "all" ? "secondary" : "ghost"} onClick={() => setSecretFilter("all")}>Todas</Button><Button size="sm" variant={secretFilter === "configured" ? "secondary" : "ghost"} onClick={() => setSecretFilter("configured")}>Configuradas</Button><Button size="sm" variant={secretFilter === "missing" ? "secondary" : "ghost"} onClick={() => setSecretFilter("missing")}>Pendentes</Button><Button size="sm" variant={secretFilter === "editable" ? "secondary" : "ghost"} onClick={() => setSecretFilter("editable")}>Editáveis</Button></div></div>{secretLoading ? <AdminLoading variant="list" count={8} /> : Object.keys(groupedSecrets).length === 0 ? <AdminEmpty title="Nenhuma chave encontrada" description="Ajuste o texto ou o filtro para localizar uma integração." /> : <div className="space-y-6">{Object.entries(groupedSecrets).map(([group, rows]) => { const configuredInGroup = rows.filter((secret) => secret.configured === true).length; return <section key={group} aria-labelledby={`secret-group-${group}`} className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><div><h3 id={`secret-group-${group}`} className="text-sm font-semibold">{group}</h3><p className="text-xs text-muted-foreground">{configuredInGroup} configurada(s) · {rows.length - configuredInGroup} pendente(s)</p></div><Badge variant="outline">{rows.length} item(ns)</Badge></div><div className="grid gap-3 md:grid-cols-2">{rows.map((secret) => { const editable = secret.editable === true; const revealed = revealedSecrets[secret.key] === true; const configured = secret.configured === true; const unknown = secret.configured === null; return <div key={secret.key} className={`rounded-xl border p-3 ${configured ? "border-emerald-500/20 bg-emerald-500/[0.02]" : secret.required ? "border-amber-500/30 bg-amber-500/[0.03]" : "bg-card"}`}><div className="mb-2 flex items-start justify-between gap-2"><label htmlFor={`secret-input-${secret.key}`} className="min-w-0 text-sm font-medium"><span className="block truncate">{secret.label}</span><code className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{secret.key}</code></label><Badge variant="outline" className={`shrink-0 text-[10px] ${configured ? "border-emerald-500/30 text-emerald-700" : unknown ? "text-muted-foreground" : secret.required ? "border-destructive/30 text-destructive" : "border-amber-500/30 text-amber-700"}`}>{configured ? "Configurada" : unknown ? "N/D" : secret.required ? "Obrigatória" : "Pendente"}</Badge></div><div className="relative"><Input id={`secret-input-${secret.key}`} type={revealed ? "text" : "password"} autoComplete="new-password" disabled={!editable || savingSecrets} value={secretDrafts[secret.key] ?? ""} onChange={(event) => setSecretDrafts((current) => ({ ...current, [secret.key]: event.target.value }))} placeholder={editable ? configured ? "Cole para substituir o valor atual" : "Cole o valor aqui" : "Configure manualmente no Supabase"} aria-describedby={`secret-help-${secret.key}`} className="pr-10" />{editable && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" onClick={() => setRevealedSecrets((current) => ({ ...current, [secret.key]: !revealed }))} aria-label={revealed ? `Ocultar ${secret.label}` : `Mostrar ${secret.label}`}><span aria-hidden="true">{revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span></Button>}</div><p id={`secret-help-${secret.key}`} className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{secret.description}</p>{!editable && <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><LockKeyhole className="h-3 w-3" aria-hidden="true" />Gerenciada fora deste painel</p>}</div>; })}</div></section>; })}</div>} {secretError && <p className="text-xs text-amber-700">{secretError}</p>}<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-relaxed text-muted-foreground">Os valores nunca são retornados, exibidos em logs ou armazenados no navegador.</p><div className="flex flex-wrap gap-2"><a href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Abrir Supabase Secrets <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a><Button onClick={saveSecrets} disabled={savingSecrets || secretLoading || !managementReady} className="gap-2"><Save className="h-4 w-4" />{savingSecrets ? "Salvando..." : "Salvar chaves"}</Button></div></div></CardContent></Card></TabsContent>

          <TabsContent value="services" className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-primary" aria-hidden="true" />Diagnóstico completo dos serviços</CardTitle><CardDescription>Verificação server-side; credenciais nunca são exibidas.</CardDescription></CardHeader><CardContent>{health.loading && services.length === 0 ? <AdminLoading variant="list" count={8} /> : services.length === 0 ? <AdminEmpty title="Nenhum diagnóstico disponível" description="Execute uma atualização ou publique as funções administrativas." /> : <div className="grid gap-2 lg:grid-cols-2">{services.map(renderService)}</div>}{health.mode === "browser" && <p className="mt-4 text-xs text-amber-700">Modo fallback: secrets de servidor não podem ser verificados pelo navegador.</p>}<div className="mt-4 flex flex-wrap gap-3"><Link to="/dashboard/admin/health?role=admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Abrir saúde detalhada <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link to="/dashboard/admin/logs?role=admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Ver logs <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div></CardContent></Card><Card className="border-primary/20"><CardHeader><CardTitle className="text-base">Como interpretar o resultado</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-sm font-semibold text-emerald-700">Operacional</p><p className="mt-1 text-xs text-muted-foreground">O endpoint respondeu e a credencial não foi recusada.</p></div><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-sm font-semibold text-amber-700">Não configurado</p><p className="mt-1 text-xs text-muted-foreground">Falta uma chave ou configuração opcional.</p></div><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3"><p className="text-sm font-semibold text-destructive">Falha</p><p className="mt-1 text-xs text-muted-foreground">O serviço não respondeu ou rejeitou a credencial.</p></div></CardContent></Card></TabsContent>

          <TabsContent value="maintenance" className="space-y-5"><BackupCard lastBackupAt={lastBackupAt} backupRunning={backupRunning} onRun={runBackup} /><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />Runbook de configuração</CardTitle><CardDescription>Ordem recomendada para ativar uma integração sem expor credenciais.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 md:grid-cols-3">{[{ title: "1. Cadastre", text: "Cole as chaves na aba Chaves ou no Supabase quando forem gerenciadas externamente.", icon: LockKeyhole }, { title: "2. Publique", text: "As Edge Functions precisam receber a nova configuração no runtime.", icon: TerminalSquare }, { title: "3. Verifique", text: "Atualize o diagnóstico e confirme que o serviço está operacional.", icon: Activity }].map(({ title, text, icon: Icon }) => <div key={title} className="rounded-xl border bg-muted/20 p-4"><Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>)}</div><Separator /><div className="grid gap-3 lg:grid-cols-2">{["supabase secrets set BREVO_API_KEY=\"<valor>\"", "supabase secrets set MERCADOPAGO_ACCESS_TOKEN=\"<valor>\" MERCADOPAGO_WEBHOOK_SECRET=\"<valor>\"", "supabase secrets set EVOLUTION_API_URL=\"https://<seu-host>\" EVOLUTION_API_KEY=\"<valor>\"", "supabase secrets set METERED_APP_NAME=\"<valor>\" METERED_SECRET_KEY=\"<valor>\""].map((command) => <div key={command} className="flex items-center gap-2 rounded-xl border bg-slate-950 p-3 text-slate-100"><code tabIndex={0} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px]">{command}</code><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => copyText(command, "Comando")} aria-label="Copiar comando"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button></div>)}</div><p className="text-xs text-muted-foreground">Os comandos usam placeholders intencionais. Substitua localmente e não registre valores reais em histórico compartilhado.</p></CardContent></Card><Card className={dangerousFlags > 0 ? "border-destructive/30" : enabledFlags > 0 ? "border-amber-500/30" : "border-emerald-500/30"}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />Flags de risco do runtime</CardTitle><CardDescription>Devem permanecer desativadas em produção.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{flags.map(renderFlag)}</CardContent></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[{ title: "Modo manutenção", description: "Interromper acesso público com mensagem e previsão de retorno.", href: "/dashboard/admin/platform-settings?role=admin", icon: Settings2 }, { title: "Segurança", description: "Auditar configurações, políticas e alertas de proteção.", href: "/dashboard/admin/security?role=admin", icon: ShieldCheck }, { title: "Logs & auditoria", description: "Investigar ações administrativas e eventos da plataforma.", href: "/dashboard/admin/logs?role=admin", icon: FileCheck2 }, { title: "Feature Flags", description: "Controlar recursos e rollouts sem novo deploy.", href: "/dashboard/admin/feature-flags?role=admin", icon: Settings2 }].map(({ title, description, href, icon: Icon }) => <Link key={title} to={href} className="group rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"><Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm font-semibold group-hover:text-primary">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p><span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">Abrir <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></span></Link>)}</div></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const BackupCard = ({ lastBackupAt, backupRunning, onRun }: { lastBackupAt: string | null; backupRunning: boolean; onRun: () => void }) => (
  <Card id="backup" className="border-primary/20"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Database className="h-5 w-5" aria-hidden="true" /></div><div><p className="font-semibold">Backup operacional</p><p className="mt-1 text-sm text-muted-foreground">{lastBackupAt ? `Último backup registrado em ${formatDate(lastBackupAt)}.` : "Nenhum backup registrado no histórico ainda."}</p><p className="mt-1 text-xs text-muted-foreground">A cópia é privada no Storage e a execução fica registrada na auditoria.</p></div></div><Button variant="outline" className="shrink-0 gap-2" onClick={onRun} disabled={backupRunning}><Database className={backupRunning ? "h-4 w-4 animate-pulse" : "h-4 w-4"} aria-hidden="true" />{backupRunning ? "Executando..." : "Executar backup agora"}</Button></CardContent></Card>
);

export default AdminMaintenanceCenterV2;
