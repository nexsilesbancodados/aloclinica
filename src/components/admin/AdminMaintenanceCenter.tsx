import { useCallback, useEffect, useMemo, useState } from "react";
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
  Server,
  ShieldAlert,
  Settings2,
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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/integrations/supabase/untyped";
import { SUPABASE_PROJECT_ID } from "@/lib/supabase-config";
import { useServiceHealth, type ServiceCheck } from "@/hooks/use-service-health";
import {
  SECRET_DEFINITIONS as SECRET_CATALOG,
  RUNTIME_FLAGS as RUNTIME_FLAG_CATALOG,
} from "../../../supabase/functions/_shared/secret-catalog";

type SecretStatus = boolean | null;

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

// O catálogo vive em supabase/functions/_shared/secret-catalog.ts e é a FONTE
// ÚNICA, compartilhada com a Edge Function admin-secret-manager. Antes havia uma
// cópia aqui: chave adicionada só no servidor não aparecia na tela, e chave
// adicionada só aqui ficava presa em "N/D". O módulo é de dados puros (sem APIs
// do Deno), então entra no bundle do navegador sem problema.
//
// Em operação normal o estado vem do servidor; este catálogo só descreve O QUE
// se espera enquanto a função não está publicada.

const serviceIcons: Record<string, React.ReactNode> = {
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

const AdminMaintenanceCenter = () => {
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
  const nav = getAdminNav("maintenance");
  const managementReady = secrets.some((secret) => secret.key === "PROJECT_SECRETS_MANAGEMENT_TOKEN" && secret.configured === true);

  const loadSecrets = useCallback(async () => {
    setSecretLoading(true);
    setSecretError(null);
    try {
      const { data, error } = await db.functions.invoke("admin-secret-manager", { body: { action: "status" } });
      if (error || !Array.isArray(data?.secrets)) {
        setSecrets(SECRET_CATALOG.map((secret) => ({ ...secret, configured: null })));
        setFlags(RUNTIME_FLAG_CATALOG.map((flag) => ({ ...flag, enabled: null })));
        setSecretError("A função de inventário ainda não está publicada ou não respondeu. Nenhum valor de secret é lido pelo navegador.");
      } else {
        const serverSecrets = data.secrets.filter((row: Partial<SecretRow>) =>
          typeof row.key === "string" && typeof row.label === "string" && typeof row.group === "string" && typeof row.required === "boolean" && typeof row.description === "string" && typeof row.configured === "boolean",
        ) as SecretRow[];
        setSecrets(serverSecrets);
        const serverFlags = Array.isArray(data.flags) ? data.flags.filter((row: Partial<RuntimeFlag>) =>
          typeof row.key === "string" && typeof row.label === "string" && (row.severity === "danger" || row.severity === "warning") && typeof row.description === "string" && typeof row.enabled === "boolean",
        ) as RuntimeFlag[] : [];
        setFlags(serverFlags);
      }
    } catch {
      setSecrets(SECRET_CATALOG.map((secret) => ({ ...secret, configured: null })));
      setFlags(RUNTIME_FLAG_CATALOG.map((flag) => ({ ...flag, enabled: null })));
      setSecretError("Não foi possível consultar o inventário de secrets. Nenhum valor de secret é lido pelo navegador.");
    } finally {
      setSecretLoading(false);
    }
  }, []);

  const loadBackupStatus = useCallback(async () => {
    const { data } = await db
      .from("activity_logs")
      .select("created_at")
      .eq("action", "daily_backup_run")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
      toast.success("Backup concluído", { description: `${Object.keys(data?.summary ?? {}).length} conjuntos de dados processados.` });
    } catch (error) {
      toast.error("Não foi possível executar o backup", { description: error instanceof Error ? error.message : "Verifique os logs da função daily-backup." });
    } finally {
      setBackupRunning(false);
    }
  };

  const saveSecrets = async () => {
    if (!managementReady) {
      toast.error("Configure primeiro o token de gerenciamento", { description: "Preencha PROJECT_SECRETS_MANAGEMENT_TOKEN no Supabase Secrets e atualize o diagnóstico." });
      return;
    }

    const updates = Object.entries(secretDrafts)
      .filter(([, value]) => value.length > 0)
      .map(([key, value]) => ({ key, value }));

    if (updates.length === 0) {
      toast.error("Nenhuma chave preenchida", { description: "Cole pelo menos um valor antes de salvar." });
      return;
    }

    setSavingSecrets(true);
    try {
      const { data, error } = await db.functions.invoke("admin-secret-manager", { body: { updates } });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Não foi possível salvar os secrets");
      }
      setSecretDrafts({});
      setRevealedSecrets({});
      await loadSecrets();
      toast.success(`${data?.updated ?? updates.length} secret(s) atualizado(s)`, { description: "Os valores foram enviados ao Supabase e removidos desta tela." });
    } catch (error) {
      toast.error("Não foi possível salvar os secrets", { description: error instanceof Error ? error.message : "Verifique a configuração do painel." });
    } finally {
      setSavingSecrets(false);
    }
  };

  const groupedSecrets = useMemo(() => {
    return secrets.reduce<Record<string, SecretRow[]>>((groups, secret) => {
      (groups[secret.group] ??= []).push(secret);
      return groups;
    }, {});
  }, [secrets]);

  const requiredMissing = secrets.filter((secret) => secret.required && secret.configured === false).length;
  const configuredSecrets = secrets.filter((secret) => secret.configured === true).length;
  const services = health.services;
  const serviceFailures = services.filter((service) => service.status === "down").length;
  const servicePending = services.filter((service) => service.status === "unconfigured").length;
  const dangerousFlags = flags.filter((flag) => flag.enabled === true && flag.severity === "danger").length;
  const enabledFlags = flags.filter((flag) => flag.enabled === true).length;
  const overallTone = serviceFailures > 0 || requiredMissing > 0 || dangerousFlags > 0 ? "danger" : servicePending > 0 || secretError || enabledFlags > 0 ? "warning" : "success";

  return (
    <DashboardLayout title="Administração" nav={nav} role="admin">
      <div className="space-y-6 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Settings2}
          eyebrow="Operação e infraestrutura"
          title="Centro de manutenção"
          description="Verifique serviços, acompanhe secrets e siga o runbook operacional da plataforma."
          accent="from-slate-600 to-slate-900"
          actions={
            <Button variant="outline" size="sm" className="gap-2" onClick={refreshAll} disabled={refreshing || health.loading || secretLoading}>
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              Atualizar diagnóstico
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Activity className="h-5 w-5" aria-hidden="true" /></div>
              <div><p className="text-xs text-muted-foreground">Serviços verificados</p><p className="text-2xl font-bold tabular-nums">{services.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></div>
              <div><p className="text-xs text-muted-foreground">Operacionais</p><p className="text-2xl font-bold tabular-nums">{health.summary.ok}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600"><KeyRound className="h-5 w-5" aria-hidden="true" /></div>
              <div><p className="text-xs text-muted-foreground">Secrets presentes</p><p className="text-2xl font-bold tabular-nums">{configuredSecrets}/{secrets.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-xl p-2.5 ${overallTone === "danger" ? "bg-destructive/10 text-destructive" : overallTone === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
              <div><p className="text-xs text-muted-foreground">Postura operacional</p><p className="text-sm font-bold">{overallTone === "danger" ? "Ação necessária" : overallTone === "warning" ? "Revisar configuração" : "Sem alertas locais"}</p></div>
            </CardContent>
          </Card>
        </div>

        <Card className={overallTone === "danger" ? "border-destructive/30" : overallTone === "warning" ? "border-amber-500/30" : "border-emerald-500/30"}>
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              {overallTone === "danger" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : overallTone === "warning" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />}
              <div>
                <p className="font-semibold">{overallTone === "danger" ? "Há itens que exigem intervenção" : overallTone === "warning" ? "A plataforma está verificável, mas há itens pendentes" : "Os sinais monitorados estão saudáveis"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{serviceFailures} falha(s), {servicePending} pendência(s) de serviço, {requiredMissing} secret(s) obrigatório(s) ausente(s) e {enabledFlags} flag(s) de risco ativa(s).</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Última verificação: {formatDate(health.lastRun?.toISOString())}</p>
          </CardContent>
        </Card>

        <Card id="backup" className="border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Database className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <p className="font-semibold">Backup operacional</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lastBackupAt ? `Último backup registrado em ${formatDate(lastBackupAt)}.` : "Nenhum backup registrado no histórico ainda."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">A cópia é privada no Storage e a execução fica registrada na auditoria.</p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0 gap-2" onClick={runBackup} disabled={backupRunning}>
              <Database className={backupRunning ? "h-4 w-4 animate-pulse" : "h-4 w-4"} aria-hidden="true" />
              {backupRunning ? "Executando..." : "Executar backup agora"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-primary" aria-hidden="true" /> Saúde dos serviços</CardTitle>
              <CardDescription>Diagnóstico server-side dos serviços críticos, com fallback limitado no navegador quando a função não estiver disponível.</CardDescription>
            </CardHeader>
            <CardContent>
              {health.loading && services.length === 0 ? <AdminLoading variant="list" count={5} /> : services.length === 0 ? <AdminEmpty title="Nenhum diagnóstico disponível" description="Execute uma verificação ou publique as funções operacionais." /> : (
                <div className="space-y-2">
                  {services.map((service) => {
                    const meta = statusMeta(service.status);
                    return (
                      <div key={service.key} className="flex items-center gap-3 rounded-xl border p-3">
                        <div className="rounded-lg bg-muted p-2 text-muted-foreground">{serviceIcons[service.key] ?? <Server className="h-4 w-4" aria-hidden="true" />}</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{serviceLabel[service.key] ?? service.label}</p><p className="truncate text-xs text-muted-foreground">{service.detail ?? "Sem detalhe"}{service.latencyMs ? ` · ${service.latencyMs}ms` : ""}</p></div>
                        <Badge variant="outline" className={`shrink-0 gap-1 ${meta.className}`}>{meta.icon}{meta.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              {health.mode === "browser" && <p className="mt-3 text-xs text-amber-700">Modo fallback: secrets de servidor não podem ser verificados pelo navegador.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/dashboard/admin/health?role=admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Abrir saúde detalhada <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                <Link to="/dashboard/admin/logs?role=admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Ver logs <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" /> Inventário de secrets</CardTitle>
              <CardDescription>A consulta de inventário retorna somente presença. Nenhum valor existente é retornado ou lido pelo navegador.</CardDescription>
            </CardHeader>
            <CardContent>
              {secretLoading ? <AdminLoading variant="list" count={5} /> : (
                <div className="space-y-2">
                  {Object.entries(groupedSecrets).map(([group, rows]) => (
                    <div key={group} className="rounded-xl border p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                      <div className="space-y-2">
                        {rows.map((secret) => (
                          <div key={secret.key} className="flex items-center gap-2">
                            {secret.configured === true ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : secret.configured === false ? <XCircle className={`h-3.5 w-3.5 ${secret.required ? "text-destructive" : "text-amber-600"}`} aria-hidden="true" /> : <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                            <span className="min-w-0 flex-1 truncate text-xs">{secret.label}</span>
                            <span className="text-[10px] text-muted-foreground">{secret.configured === true ? "OK" : secret.configured === false ? "Ausente" : "N/D"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {secretError && <p className="mt-3 text-xs text-amber-700">{secretError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Abrir Supabase Secrets <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
                <Link to="/dashboard/settings?role=admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Configurações públicas <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Configurar chaves nesta tela</CardTitle>
            <CardDescription>Você pode colar uma ou várias chaves. Campos vazios não alteram o valor já configurado. O painel não mostra valores existentes e limpa os campos depois de salvar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Configuração inicial obrigatória:</strong> antes do primeiro uso, configure manualmente o <code>PROJECT_SECRETS_MANAGEMENT_TOKEN</code> no Supabase Secrets. Ele deve ser um token fine-grained com apenas o escopo <code>edge_functions_secrets_write</code>. O próprio token não pode ser alterado por este painel.</p>
            </div>
            <div className="space-y-5">
              {Object.entries(groupedSecrets).map(([group, rows]) => (
                <section key={group} aria-labelledby={`secret-group-${group}`}>
                  <h3 id={`secret-group-${group}`} className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {rows.map((secret) => {
                      const editable = secret.editable === true;
                      const revealed = revealedSecrets[secret.key] === true;
                      return (
                        <div key={secret.key} className="space-y-1.5">
                          <label htmlFor={`secret-input-${secret.key}`} className="flex items-center justify-between gap-2 text-xs font-medium">
                            <span>{secret.label}</span>
                            <span className="font-normal text-muted-foreground">{secret.configured === true ? "Já configurado" : secret.required ? "Obrigatório" : "Opcional"}</span>
                          </label>
                          <div className="relative">
                            <Input
                              id={`secret-input-${secret.key}`}
                              type={revealed ? "text" : "password"}
                              autoComplete="new-password"
                              disabled={!editable || savingSecrets}
                              value={secretDrafts[secret.key] ?? ""}
                              onChange={(event) => setSecretDrafts((current) => ({ ...current, [secret.key]: event.target.value }))}
                              placeholder={editable ? secret.configured === true ? "Cole para substituir o valor atual" : "Cole o valor aqui" : "Configure manualmente no Supabase"}
                              aria-describedby={`secret-help-${secret.key}`}
                              className="pr-10"
                            />
                            {editable && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" onClick={() => setRevealedSecrets((current) => ({ ...current, [secret.key]: !revealed }))} aria-label={revealed ? `Ocultar ${secret.label}` : `Mostrar ${secret.label}`}><span aria-hidden="true">{revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span></Button>}
                          </div>
                          <p id={`secret-help-${secret.key}`} className="text-[11px] leading-relaxed text-muted-foreground">{secret.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Os valores são enviados somente por HTTPS à Edge Function protegida. Nunca serão retornados, exibidos em logs ou armazenados no navegador.</p>
              <Button onClick={saveSecrets} disabled={savingSecrets || secretLoading || !managementReady} className="shrink-0 gap-2"><Save className="h-4 w-4" />{savingSecrets ? "Salvando..." : "Salvar chaves"}</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Configuração segura de integrações</CardTitle>
            <CardDescription>Use o Supabase Dashboard ou CLI. Nunca cole chaves em código, banco público, ticket ou conversa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { title: "1. Cadastre secrets", text: "Defina as credenciais na área Secrets do Supabase. O valor não passa pelo navegador.", icon: LockKeyhole },
                { title: "2. Publique funções", text: "Depois de alterar secrets, publique as Edge Functions para que o runtime receba a configuração.", icon: TerminalSquare },
                { title: "3. Rode o diagnóstico", text: "Volte aqui, atualize e confirme saúde, webhooks e integrações críticas.", icon: Activity },
              ].map(({ title, text, icon: Icon }) => (
                <div key={title} className="rounded-xl border bg-muted/20 p-4"><Icon className="mb-3 h-5 w-5 text-primary" /><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3 lg:grid-cols-2">
              {[
                "supabase secrets set BREVO_API_KEY=\"<valor>\"",
                "supabase secrets set MERCADOPAGO_ACCESS_TOKEN=\"<valor>\" MERCADOPAGO_WEBHOOK_SECRET=\"<valor>\"",
                "supabase secrets set EVOLUTION_API_URL=\"https://<seu-host>\" EVOLUTION_API_KEY=\"<valor>\"",
                "supabase secrets set METERED_APP_NAME=\"<valor>\" METERED_SECRET_KEY=\"<valor>\"",
              ].map((command) => (
                <div key={command} className="flex items-center gap-2 rounded-xl border bg-slate-950 p-3 text-slate-100">
                  <code tabIndex={0} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px]">{command}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => copyText(command, "Comando")} aria-label="Copiar comando"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Os comandos usam placeholders intencionais. Substitua localmente e não registre o terminal em histórico compartilhado.</p>
          </CardContent>
        </Card>

        <Card className={dangerousFlags > 0 ? "border-destructive/30" : enabledFlags > 0 ? "border-amber-500/30" : "border-emerald-500/30"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" /> Flags de risco do runtime</CardTitle>
            <CardDescription>Flags de desenvolvimento ou transporte inseguro são verificadas server-side e devem permanecer desativadas em produção.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {flags.map((flag) => {
                const active = flag.enabled === true;
                const unknown = flag.enabled === null;
                return (
                  <div key={flag.key} className="flex items-start gap-3 rounded-xl border p-3">
                    {unknown ? <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : active ? <XCircle className={`mt-0.5 h-4 w-4 shrink-0 ${flag.severity === "danger" ? "text-destructive" : "text-amber-600"}`} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{flag.label}</p><Badge variant="outline" className={active ? flag.severity === "danger" ? "border-destructive/30 text-destructive" : "border-amber-500/30 text-amber-700" : unknown ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700"}>{unknown ? "N/D" : active ? "Ativa" : "Desativada"}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{flag.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Modo manutenção", description: "Interromper acesso público com mensagem e previsão de retorno.", href: "/dashboard/admin/platform-settings?role=admin", icon: Settings2 },
            { title: "Segurança", description: "Auditar configurações, políticas e alertas de proteção.", href: "/dashboard/admin/security?role=admin", icon: ShieldCheck },
            { title: "Logs & auditoria", description: "Investigar ações administrativas e eventos da plataforma.", href: "/dashboard/admin/logs?role=admin", icon: FileCheck2 },
            { title: "Backups e migrations", description: "Consultar o último backup e o runbook antes de aplicar mudanças de banco.", href: "/dashboard/admin/maintenance?role=admin#backup", icon: Database },
          ].map(({ title, description, href, icon: Icon }) => (
            <Link key={title} to={href} className="group rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
              <Icon className="mb-3 h-5 w-5 text-primary" /><p className="text-sm font-semibold group-hover:text-primary">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p><span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">Abrir <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminMaintenanceCenter;
