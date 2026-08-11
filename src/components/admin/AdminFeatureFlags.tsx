import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, History, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { AdminPageHeader } from "./AdminPageHeader";
import { getAdminNav } from "./adminNav";
import { AdminEmpty, AdminLoading } from "./AdminStateBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

type FlagStatus = "on" | "off" | "percentage";

interface FeatureFlag {
  key: string;
  label: string;
  description: string | null;
  status: FlagStatus;
  rollout_percentage: number;
  default_value: boolean;
  updated_at: string;
}

interface FlagRule {
  id: string;
  flag_key: string;
  scope_type: "user" | "role";
  scope_value: string;
  enabled: boolean;
}

interface FlagAudit {
  id: string;
  flag_key: string;
  changed_by: string | null;
  action: string;
  reason: string | null;
  created_at: string;
}

// Papéis que podem receber regra de escopo. Alinhado ao enum app_role usado em
// user_roles — a avaliação server-side casa scope_value com ur.role::text.
const ROLE_OPTIONS = ["patient", "doctor", "clinic", "admin", "receptionist", "support", "partner", "affiliate"];

const STATUS_META: Record<FlagStatus, { label: string; className: string }> = {
  on: { label: "Ativa", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  off: { label: "Desligada", className: "bg-muted text-muted-foreground border-border" },
  percentage: { label: "Gradual", className: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
};

const AdminFeatureFlags = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [rules, setRules] = useState<FlagRule[]>([]);
  const [audit, setAudit] = useState<FlagAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [flagRes, ruleRes, auditRes] = await Promise.all([
        db.from("feature_flags").select("*").order("key"),
        db.from("feature_flag_rules").select("*"),
        db.from("feature_flag_audit").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      const queryError = flagRes.error ?? ruleRes.error ?? auditRes.error;
      if (queryError) throw queryError;
      setFlags((flagRes.data ?? []) as FeatureFlag[]);
      setRules((ruleRes.data ?? []) as FlagRule[]);
      setAudit((auditRes.data ?? []) as FlagAudit[]);
    } catch (err) {
      logError("AdminFeatureFlags load", err);
      setLoadError("A migration de Feature Flags ainda não foi aplicada ou o serviço não respondeu.");
      toast.error("Não foi possível carregar as flags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * Toda alteração passa pelo RPC set_feature_flag para que o MOTIVO entre na
   * auditoria — o gatilho lê o motivo de um GUC de transação que só a função
   * consegue definir. Um UPDATE direto na tabela seria auditado sem motivo.
   */
  const changeFlag = async (flag: FeatureFlag, status: FlagStatus, rollout?: number) => {
    const reason = window.prompt(
      `Motivo da alteração em "${flag.label}"\n(entra no histórico de auditoria)`,
      "",
    );
    if (reason === null) return; // cancelou

    setSaving(flag.key);
    try {
      const { error } = await db.rpc("set_feature_flag", {
        p_key: flag.key,
        p_status: status,
        p_rollout: rollout ?? flag.rollout_percentage,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success(`"${flag.label}" atualizada`);
      await load();
    } catch (err) {
      logError("AdminFeatureFlags change", err);
      toast.error("Falha ao salvar", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(null);
    }
  };

  const addRule = async (flagKey: string, scopeType: "user" | "role", scopeValue: string, enabled: boolean) => {
    if (!scopeValue.trim()) { toast.error("Informe o valor do escopo"); return; }
    const reason = window.prompt("Motivo da alteração da regra\n(entra no histórico de auditoria)", "");
    if (reason === null) return;
    try {
      const { error } = await db.rpc("set_feature_flag_rule", {
        p_flag_key: flagKey,
        p_scope_type: scopeType,
        p_scope_value: scopeValue.trim(),
        p_enabled: enabled,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Regra adicionada");
      await load();
    } catch (err) {
      logError("AdminFeatureFlags addRule", err);
      toast.error("Falha ao adicionar regra", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const removeRule = async (id: string) => {
    const reason = window.prompt("Motivo da remoção da regra\n(entra no histórico de auditoria)", "");
    if (reason === null) return;
    try {
      const { error } = await db.rpc("delete_feature_flag_rule", { p_rule_id: id, p_reason: reason.trim() || null });
      if (error) throw error;
      toast.success("Regra removida");
      await load();
    } catch (err) {
      logError("AdminFeatureFlags removeRule", err);
      toast.error("Falha ao remover regra");
    }
  };

  const rulesByFlag = useMemo(() => {
    return rules.reduce<Record<string, FlagRule[]>>((acc, rule) => {
      (acc[rule.flag_key] ??= []).push(rule);
      return acc;
    }, {});
  }, [rules]);

  const activeCount = flags.filter((f) => f.status === "on").length;
  const gradualCount = flags.filter((f) => f.status === "percentage").length;

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("feature-flags")} role="admin">
      <div className="space-y-6 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Flag}
          eyebrow="Plataforma"
          title="Feature Flags"
          description="Ligue, desligue ou libere recursos gradualmente sem precisar de deploy."
          accent="from-violet-500 to-indigo-600"
          actions={
            <div className="flex gap-2">
              <NewFlagDialog onCreated={load} />
              <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                Atualizar
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Flags cadastradas</p>
            <p className="text-2xl font-bold tabular-nums">{flags.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ativas</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{activeCount}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em rollout gradual</p>
            <p className="text-2xl font-bold tabular-nums text-amber-600">{gradualCount}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recursos</CardTitle>
            <CardDescription>
              A avaliação acontece no servidor. Precedência: regra de usuário &gt; regra de papel &gt; estado global.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <AdminLoading variant="list" count={4} /> : loadError ? (
              <AdminEmpty title="Feature Flags indisponíveis" description={loadError} />
            ) : flags.length === 0 ? (
              <AdminEmpty
                title="Nenhuma flag cadastrada"
                description="Crie a primeira flag para controlar um recurso sem depender de deploy."
              />
            ) : (
              <div className="space-y-3">
                {flags.map((flag) => {
                  const meta = STATUS_META[flag.status];
                  const flagRules = rulesByFlag[flag.key] ?? [];
                  const isOpen = expanded === flag.key;
                  return (
                    <div key={flag.key} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{flag.label}</p>
                            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                            {flag.default_value && (
                              <Badge variant="outline" className="text-[10px]">kill switch</Badge>
                            )}
                          </div>
                          <code className="text-[11px] text-muted-foreground">{flag.key}</code>
                          {flag.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{flag.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Select
                            value={flag.status}
                            onValueChange={(v) => changeFlag(flag, v as FlagStatus)}
                            disabled={saving === flag.key}
                          >
                            <SelectTrigger className="w-[150px]" aria-label={`Estado de ${flag.label}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="on">Ativa</SelectItem>
                              <SelectItem value="off">Desligada</SelectItem>
                              <SelectItem value="percentage">Gradual (%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpanded(isOpen ? null : flag.key)}
                          >
                            {flagRules.length > 0 ? `${flagRules.length} regra(s)` : "Regras"}
                          </Button>
                        </div>
                      </div>

                      {flag.status === "percentage" && (
                        <div className="mt-4 rounded-lg bg-muted/30 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <Label className="text-xs">Percentual de usuários</Label>
                            <span className="text-sm font-bold tabular-nums">{flag.rollout_percentage}%</span>
                          </div>
                          <Slider
                            value={[flag.rollout_percentage]}
                            max={100}
                            step={5}
                            aria-label={`Percentual de rollout de ${flag.label}`}
                            onValueCommit={(v) => changeFlag(flag, "percentage", v[0])}
                          />
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            O sorteio é estável por usuário: aumentar o percentual só acrescenta pessoas,
                            ninguém perde o acesso que já tinha.
                          </p>
                        </div>
                      )}

                      {isOpen && (
                        <div className="mt-4">
                          <Separator className="mb-3" />
                          <RuleEditor
                            flagKey={flag.key}
                            rules={flagRules}
                            onAdd={addRule}
                            onRemove={removeRule}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" aria-hidden="true" /> Histórico
            </CardTitle>
            <CardDescription>Últimas 50 alterações, com responsável e motivo.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {audit.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs">
                    <Badge variant="outline" className="shrink-0 text-[10px]">{entry.action}</Badge>
                    <code className="shrink-0">{entry.flag_key}</code>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {entry.reason || "sem motivo informado"}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

/** Editor de regras de escopo de uma flag. */
const RuleEditor = ({
  flagKey,
  rules,
  onAdd,
  onRemove,
}: {
  flagKey: string;
  rules: FlagRule[];
  onAdd: (flagKey: string, scopeType: "user" | "role", scopeValue: string, enabled: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) => {
  const [scopeType, setScopeType] = useState<"user" | "role">("role");
  const [scopeValue, setScopeValue] = useState("");
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 text-xs">
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {rule.scope_type === "role" ? "papel" : "usuário"}
              </Badge>
              <code className="min-w-0 flex-1 truncate">{rule.scope_value}</code>
              <Badge
                variant="outline"
                className={rule.enabled
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"}
              >
                {rule.enabled ? "libera" : "bloqueia"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={`Remover regra ${rule.scope_value}`}
                onClick={() => onRemove(rule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-[11px]">Escopo</Label>
          <Select value={scopeType} onValueChange={(v) => { setScopeType(v as "user" | "role"); setScopeValue(""); }}>
            <SelectTrigger className="mt-1 w-[130px]" aria-label="Tipo de escopo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="role">Papel</SelectItem>
              <SelectItem value="user">Usuário</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[200px] flex-1">
          <Label className="text-[11px]">{scopeType === "role" ? "Papel" : "ID do usuário"}</Label>
          {scopeType === "role" ? (
            <Select value={scopeValue} onValueChange={setScopeValue}>
              <SelectTrigger className="mt-1" aria-label="Papel"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="mt-1"
              placeholder="UUID do usuário"
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
            />
          )}
        </div>

        <div>
          <Label className="text-[11px]">Efeito</Label>
          <Select value={enabled ? "on" : "off"} onValueChange={(v) => setEnabled(v === "on")}>
            <SelectTrigger className="mt-1 w-[130px]" aria-label="Efeito da regra"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Libera</SelectItem>
              <SelectItem value="off">Bloqueia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          className="gap-1.5"
          onClick={async () => { await onAdd(flagKey, scopeType, scopeValue, enabled); setScopeValue(""); }}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar
        </Button>
      </div>
    </div>
  );
};

/** Criação de uma nova flag. */
const NewFlagDialog = ({ onCreated }: { onCreated: () => Promise<void> }) => {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [killSwitch, setKillSwitch] = useState(false);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!key.trim() || !label.trim()) { toast.error("Preencha chave e nome"); return; }
    setSaving(true);
    try {
      const { error } = await db.from("feature_flags").insert({
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || null,
        // Nasce desligada: nenhum recurso é liberado sem decisão explícita.
        status: "off",
        default_value: killSwitch,
      });
      if (error) throw error;
      toast.success("Flag criada", { description: "Ela nasce desligada — ative quando estiver pronta." });
      setOpen(false);
      setKey(""); setLabel(""); setDescription(""); setKillSwitch(false);
      await onCreated();
    } catch (err) {
      logError("AdminFeatureFlags create", err);
      toast.error("Falha ao criar", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova flag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova feature flag</DialogTitle>
          <DialogDescription>
            A chave é usada no código: <code>useFeatureFlag(&quot;sua_chave&quot;)</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="flag-key">Chave</Label>
            <Input
              id="flag-key"
              placeholder="nova_agenda"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "_"))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Minúsculas, números, <code>_</code>, <code>.</code> e <code>-</code>.
            </p>
          </div>
          <div>
            <Label htmlFor="flag-label">Nome</Label>
            <Input id="flag-label" placeholder="Nova agenda" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="flag-desc">Descrição</Label>
            <Input id="flag-desc" placeholder="O que este recurso controla" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={killSwitch}
              onChange={(e) => setKillSwitch(e.target.checked)}
            />
            <span>
              <strong>É um kill switch</strong> — o recurso já existe e a flag serve para desligá-lo.
              Nesse caso o padrão em caso de falha na avaliação é <em>ligado</em>, para que uma queda
              de rede não derrube o recurso.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={create} disabled={saving}>{saving ? "Criando..." : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminFeatureFlags;
