import { logError } from "@/lib/logger";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "@/components/admin/adminNav";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  MessageCircle, QrCode, RefreshCw, Wifi, WifiOff, Trash2, Plus, Smartphone,
  Zap, Bell, CalendarCheck, Clock, Star, Stethoscope, FileText, ShieldCheck,
  Send, AlertTriangle, Settings2
} from "lucide-react";

interface Instance {
  instanceName: string;
  state?: string;
}

interface AutomationConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "appointment" | "notification" | "marketing";
  defaultTemplate: string;
  enabled: boolean;
}

const DEFAULT_AUTOMATIONS: AutomationConfig[] = [
  {
    key: "wpp_appointment_confirmed",
    label: "Consulta Confirmada",
    description: "Envia mensagem quando o pagamento é confirmado e a consulta agendada.",
    icon: <CalendarCheck className="w-4 h-4 text-green-500" />,
    category: "appointment",
    defaultTemplate:
      "🩺 *Allo Médico* - Consulta Confirmada!\n\nOlá, {{patient_name}}!\nSua consulta foi agendada para *{{scheduled_date}}*.\n\n📹 Link de acesso:\n{{jitsi_link}}\n\nAcesse o link no horário marcado. Até lá! 💚",
    enabled: true,
  },
  {
    key: "wpp_appointment_reminder_1h",
    label: "Lembrete 1h Antes",
    description: "Envia lembrete 1 hora antes da consulta.",
    icon: <Clock className="w-4 h-4 text-amber-500" />,
    category: "appointment",
    defaultTemplate:
      "⏰ *Lembrete* — Allo Médico\n\nOlá, {{patient_name}}!\nSua consulta começa em *1 hora* ({{scheduled_date}}).\n\n📹 Acesse: {{jitsi_link}}\n\nEsteja pronto(a)! 💚",
    enabled: true,
  },
  {
    key: "wpp_appointment_reminder_15m",
    label: "Lembrete 15min Antes",
    description: "Envia lembrete 15 minutos antes.",
    icon: <Clock className="w-4 h-4 text-red-500" />,
    category: "appointment",
    defaultTemplate:
      "🔔 *Atenção* — Allo Médico\n\nOlá, {{patient_name}}!\nSua consulta começa em *15 minutos*!\n\n📹 Entre agora: {{jitsi_link}}\n\nEstamos te esperando! 💚",
    enabled: true,
  },
  {
    key: "wpp_appointment_cancelled",
    label: "Consulta Cancelada",
    description: "Notifica o paciente quando a consulta é cancelada.",
    icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
    category: "appointment",
    defaultTemplate:
      "❌ *Consulta Cancelada* — Allo Médico\n\nOlá, {{patient_name}}.\nSua consulta de {{scheduled_date}} foi cancelada.\n\nMotivo: {{cancel_reason}}\n\nPara reagendar, acesse: https://aloclinica.com.br/dashboard/book",
    enabled: false,
  },
  {
    key: "wpp_post_consultation",
    label: "Pós-Consulta (Avaliação)",
    description: "Pede avaliação NPS após a consulta ser concluída.",
    icon: <Star className="w-4 h-4 text-yellow-500" />,
    category: "notification",
    defaultTemplate:
      "⭐ *Como foi sua consulta?* — Allo Médico\n\nOlá, {{patient_name}}!\nSua opinião é muito importante para nós.\n\nAvalie sua experiência: https://aloclinica.com.br/dashboard/rate/{{appointment_id}}?role=patient\n\nObrigado! 💚",
    enabled: true,
  },
  {
    key: "wpp_prescription_ready",
    label: "Receita Disponível",
    description: "Avisa o paciente quando uma receita é emitida.",
    icon: <FileText className="w-4 h-4 text-primary" />,
    category: "notification",
    defaultTemplate:
      "📋 *Receita Pronta* — Allo Médico\n\nOlá, {{patient_name}}!\nSua receita médica está disponível.\n\nAcesse: https://aloclinica.com.br/dashboard/paciente/prescriptions\n\n💚 Cuide da sua saúde!",
    enabled: false,
  },
  {
    key: "wpp_exam_report_ready",
    label: "Laudo de Exame Pronto",
    description: "Notifica quando o laudo do exame está assinado.",
    icon: <Stethoscope className="w-4 h-4 text-primary" />,
    category: "notification",
    defaultTemplate:
      "🔬 *Laudo Pronto* — Allo Médico\n\nOlá, {{patient_name}}!\nO laudo do seu exame de {{exam_type}} está disponível.\n\nAcesse: https://aloclinica.com.br/dashboard/paciente/health\n\n💚",
    enabled: false,
  },
  {
    key: "wpp_doctor_approved",
    label: "Médico Aprovado",
    description: "Notifica o médico quando seu cadastro é aprovado.",
    icon: <ShieldCheck className="w-4 h-4 text-green-500" />,
    category: "notification",
    defaultTemplate:
      "🎉 *Cadastro Aprovado!* — Allo Médico\n\nParabéns, Dr(a). {{doctor_name}}!\nSeu perfil foi aprovado. Você já pode atender pacientes.\n\nAcesse: https://aloclinica.com.br/medico\n\n💚 Bem-vindo(a) à equipe!",
    enabled: false,
  },
  {
    key: "wpp_return_reminder",
    label: "Lembrete de Retorno",
    description: "Lembra o paciente quando o prazo de retorno se aproxima.",
    icon: <Bell className="w-4 h-4 text-primary" />,
    category: "marketing",
    defaultTemplate:
      "🩺 *Retorno Médico* — Allo Médico\n\nOlá, {{patient_name}}!\nSeu prazo de retorno vence em {{return_date}}.\n\nAgende agora: https://aloclinica.com.br/dashboard/book?doctor={{doctor_id}}\n\nCuide-se! 💚",
    enabled: false,
  },
  {
    key: "wpp_inactive_patient",
    label: "Reengajamento (90 dias)",
    description: "Envia mensagem para pacientes inativos há 90+ dias.",
    icon: <MessageCircle className="w-4 h-4 text-muted-foreground" />,
    category: "marketing",
    defaultTemplate:
      "💚 *Sentimos sua falta!* — Allo Médico\n\nOlá, {{patient_name}}!\nFaz tempo que você não agenda uma consulta.\n\nCuide da sua saúde: https://aloclinica.com.br/dashboard/book\n\nEstamos aqui por você! 🩺",
    enabled: false,
  },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  appointment: { label: "Agendamento", icon: <CalendarCheck className="w-4 h-4" /> },
  notification: { label: "Notificações", icon: <Bell className="w-4 h-4" /> },
  marketing: { label: "Marketing / Reengajamento", icon: <Zap className="w-4 h-4" /> },
};

const AdminWhatsApp = () => {
  const confirm = useConfirm();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [polling, setPolling] = useState(false);

  const [automations, setAutomations] = useState<AutomationConfig[]>(DEFAULT_AUTOMATIONS);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [savingAutomations, setSavingAutomations] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  // Load saved automation settings from app_settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data } = await db
          .from("app_settings")
          .select("key, value")
          .like("key", "wpp_%");

        if (data && data.length > 0) {
          const settings: Record<string, string> = {};
          data.forEach((s) => { settings[s.key] = s.value; });

          setAutomations((prev) =>
            prev.map((a) => ({
              ...a,
              enabled: settings[a.key] !== undefined ? settings[a.key] === "true" : a.enabled,
            }))
          );

          const tpls: Record<string, string> = {};
          data.filter((s) => s.key.endsWith("_template")).forEach((s) => {
            tpls[s.key.replace("_template", "")] = s.value;
          });
          setTemplates(tpls);
        }
      } catch (err) {
        logError("Load WhatsApp settings", err);
      }
    };
    loadSettings();
  }, []);

  const toggleAutomation = (key: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.key === key ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const updateTemplate = (key: string, value: string) => {
    setTemplates((prev) => ({ ...prev, [key]: value }));
  };

  const saveAutomations = async () => {
    setSavingAutomations(true);
    try {
      const upserts: { key: string; value: string }[] = [];
      automations.forEach((a) => {
        upserts.push({ key: a.key, value: String(a.enabled) });
        if (templates[a.key]) {
          upserts.push({ key: `${a.key}_template`, value: templates[a.key] });
        }
      });

      for (const item of upserts) {
        await db.from("app_settings").upsert(
          { key: item.key, value: item.value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }

      toast.success("Automações salvas com sucesso!");
    } catch (err) {
      logError("Save WhatsApp automations", err);
      toast.error("Erro ao salvar automações");
    } finally {
      setSavingAutomations(false);
    }
  };

  const sendTestMessage = async (automationKey: string) => {
    if (!testPhone.trim()) {
      toast.error("Digite um número de telefone para teste");
      return;
    }
    setSendingTest(true);
    try {
      const auto = automations.find((a) => a.key === automationKey);
      const template = templates[automationKey] || auto?.defaultTemplate || "";
      const message = template
        .replace(/\{\{patient_name\}\}/g, "Paciente Teste")
        .replace(/\{\{doctor_name\}\}/g, "Dr. Teste")
        .replace(/\{\{scheduled_date\}\}/g, "28/03/2026 às 14:00")
        .replace(/\{\{jitsi_link\}\}/g, "https://meet.telemedicinaaloclinica.sbs/consulta-teste")
        .replace(/\{\{cancel_reason\}\}/g, "Motivo de teste")
        .replace(/\{\{appointment_id\}\}/g, "test-123")
        .replace(/\{\{exam_type\}\}/g, "Raio-X Tórax")
        .replace(/\{\{return_date\}\}/g, "15/04/2026")
        .replace(/\{\{doctor_id\}\}/g, "doctor-test-id");

      const { data, error } = await db.functions.invoke("send-whatsapp", {
        body: { phone: testPhone.trim(), message },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success("Mensagem de teste enviada!");
      } else {
        toast.error(data?.error || "Erro ao enviar teste");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar teste");
    } finally {
      setSendingTest(false);
    }
  };

  const callApi = async (action: string, instanceName?: string) => {
    const { data, error } = await db.functions.invoke("whatsapp-qr", {
      body: { action, instanceName },
    });
    if (error) throw error;
    if (data?.success === false) {
      const message = data.message || data.error || "Integração do WhatsApp indisponível";
      if (data.code === "EVOLUTION_API_CONFIG_INVALID") setIntegrationError(message);
      throw new Error(message);
    }
    setIntegrationError(null);
    return data;
  };

  const fetchInstances = useCallback(async () => {
    try {
      const res = await callApi("list");
      if (res?.success && Array.isArray(res.data)) {
        setInstances(
          res.data.map((i: any) => ({
            instanceName: i.instance?.instanceName || i.instanceName || "unknown",
            state: i.instance?.status || i.state || "unknown",
          }))
        );
      }
    } catch (err) {
      logError("AdminWhatsApp fetch instances error", err);
      setInstances([]);
    }
  }, []);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);

  const createInstance = async () => {
    if (!newInstanceName.trim()) { toast.error("Digite um nome para a instância"); return; }
    setLoading(true);
    try {
      const res = await callApi("create", newInstanceName.trim());
      if (res?.success) {
        toast.success(`Instância "${newInstanceName}" criada!`);
        setNewInstanceName("");
        setSelectedInstance(res.instanceName || newInstanceName.trim());
        await fetchInstances();
        await getQrCode(res.instanceName || newInstanceName.trim());
      } else {
        toast.error("Erro ao criar instância");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar instância");
    } finally { setLoading(false); }
  };

  const getQrCode = async (name: string) => {
    setLoading(true); setQrCode(null); setSelectedInstance(name);
    try {
      const res = await callApi("qrcode", name);
      if (res?.success && res.data) {
        const base64 = res.data.base64 || res.data.qrcode?.base64 || null;
        const pairingCode = res.data.pairingCode || res.data.code || null;
        if (base64) {
          setQrCode(base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`);
          setPolling(true);
        } else if (pairingCode) {
          setQrCode(null); setConnectionState("open");
          toast.success("Já conectado!"); setPolling(false);
        } else {
          toast.info("Nenhum QR retornado. Verifique se já está conectado.");
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao obter QR code");
    } finally { setLoading(false); }
  };

  const checkStatus = async (name: string) => {
    try {
      const res = await callApi("status", name);
      if (res?.success) {
        const state = res.data?.instance?.state || res.data?.state || "unknown";
        setConnectionState(state);
        if (state === "open") { setPolling(false); setQrCode(null); toast.success("WhatsApp conectado!"); }
        return state;
      }
    } catch (err) { logError("AdminWhatsApp status check error", err); }
    return null;
  };

  useEffect(() => {
    if (!polling || !selectedInstance) return;
    const interval = setInterval(async () => {
      const state = await checkStatus(selectedInstance);
      if (state === "open") { clearInterval(interval); fetchInstances(); }
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, selectedInstance]);

  const deleteInstance = async (name: string) => {
    const ok = await confirm({
      title: "Excluir instância WhatsApp?",
      description: `"${name}" será desconectado e removido. Mensagens em transit podem falhar.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await callApi("delete", name);
      toast.success("Instância excluída");
      if (selectedInstance === name) { setSelectedInstance(null); setQrCode(null); setConnectionState(null); }
      fetchInstances();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const connectedCount = instances.filter((i) => i.state === "open").length;

  return (
    <DashboardLayout title="WhatsApp" nav={getAdminNav("whatsapp")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={MessageCircle}
          eyebrow="Sistema"
          title="WhatsApp"
          description="Gerencie conexões e configure automações de mensagens."
          accent="from-green-500 to-emerald-600"
          badge={
            connectedCount > 0
              ? { label: `${connectedCount} conectada${connectedCount === 1 ? "" : "s"}`, tone: "success" }
              : { label: "Desconectado", tone: "danger" }
          }
        />

        <Tabs defaultValue="automations" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="automations" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Automações
            </TabsTrigger>
            <TabsTrigger value="connection" className="flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              Conexão
            </TabsTrigger>
          </TabsList>

          {/* ═════════ AUTOMATIONS TAB ═════════ */}
          <TabsContent value="automations" className="space-y-6 mt-4">
            {/* Test phone strip */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Telefone para teste</Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                  <Button onClick={saveAutomations} disabled={savingAutomations}>
                    <Settings2 className="w-4 h-4 mr-1" />
                    {savingAutomations ? "Salvando..." : "Salvar Configurações"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {(["appointment", "notification", "marketing"] as const).map((category) => {
              const catAutomations = automations.filter((a) => a.category === category);
              if (catAutomations.length === 0) return null;
              const cat = CATEGORY_LABELS[category];
              return (
                <div key={category} className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wide">
                    {cat.icon}
                    {cat.label}
                  </h2>
                  <div className="space-y-3">
                    {catAutomations.map((auto) => (
                      <Card key={auto.key} className={auto.enabled ? "border-primary/30" : "opacity-70"}>
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              {auto.icon}
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">{auto.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{auto.description}</p>
                              </div>
                            </div>
                            <Switch
                              checked={auto.enabled}
                              onCheckedChange={() => toggleAutomation(auto.key)}
                            />
                          </div>

                          {auto.enabled && (
                            <div className="space-y-2">
                              {editingTemplate === auto.key ? (
                                <>
                                  <Textarea
                                    value={templates[auto.key] || auto.defaultTemplate}
                                    onChange={(e) => updateTemplate(auto.key, e.target.value)}
                                    rows={6}
                                    className="text-xs font-mono"
                                    placeholder="Template da mensagem..."
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    Variáveis: {"{{patient_name}}"}, {"{{doctor_name}}"}, {"{{scheduled_date}}"}, {"{{jitsi_link}}"}, {"{{cancel_reason}}"}, {"{{appointment_id}}"}, {"{{exam_type}}"}, {"{{return_date}}"}, {"{{doctor_id}}"}
                                  </p>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingTemplate(null)}
                                    >
                                      Fechar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setTemplates((prev) => {
                                          const copy = { ...prev };
                                          delete copy[auto.key];
                                          return copy;
                                        });
                                        toast.info("Template restaurado ao padrão");
                                      }}
                                    >
                                      Restaurar Padrão
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs"
                                    onClick={() => setEditingTemplate(auto.key)}
                                  >
                                    ✏️ Editar Template
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs"
                                    disabled={sendingTest || !testPhone.trim()}
                                    onClick={() => sendTestMessage(auto.key)}
                                  >
                                    <Send className="w-3 h-3 mr-1" />
                                    Enviar Teste
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          {/* ═════════ CONNECTION TAB ═════════ */}
          <TabsContent value="connection" className="space-y-6 mt-4">
            {integrationError && (
              <Card className="border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="h-1 bg-amber-500" />
                <CardContent className="pt-6 pb-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-8 w-8 text-amber-600" />
                    </div>
                    <div className="space-y-3 flex-1 text-center md:text-left">
                      <div>
                        <h3 className="text-lg font-bold text-foreground">Configuração Necessária</h3>
                        <p className="text-sm text-muted-foreground max-w-2xl">
                          A integração com o WhatsApp via Evolution API ainda não foi configurada nos segredos do projeto (Secrets).
                        </p>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-background/50 p-3 rounded-lg border border-border/50">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Passo 1</p>
                          <p className="text-xs">Acesse o painel do seu Evolution API e copie a <strong>API Key</strong> e a <strong>URL</strong>.</p>
                        </div>
                        <div className="bg-background/50 p-3 rounded-lg border border-border/50">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Passo 2</p>
                          <p className="text-xs">No Lovable, vá em <strong>Cloud {"->"} Secrets</strong> e defina <code>EVOLUTION_API_URL</code> e <code>EVOLUTION_API_KEY</code>.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Create new instance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Nova Instância
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome da instância (ex: clinica-principal)"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createInstance()}
                  />
                  <Button onClick={createInstance} disabled={loading}>
                    <Plus className="w-4 h-4 mr-1" />
                    Criar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Instances list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      Instâncias ({instances.length})
                    </span>
                    <Button size="sm" variant="ghost" onClick={fetchInstances}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {instances.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma instância criada ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {instances.map((inst) => (
                        <div
                          key={inst.instanceName}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedInstance === inst.instanceName
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => {
                            setSelectedInstance(inst.instanceName);
                            checkStatus(inst.instanceName);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {inst.state === "open" ? (
                              <Wifi className="w-4 h-4 text-green-500" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium text-foreground">
                              {inst.instanceName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={inst.state === "open" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {inst.state === "open" ? "Conectado" : inst.state || "—"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteInstance(inst.instanceName);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* QR Code panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
                  {!selectedInstance ? (
                    <div className="text-center text-muted-foreground">
                      <QrCode className="w-16 h-16 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Selecione ou crie uma instância para gerar o QR Code</p>
                    </div>
                  ) : connectionState === "open" ? (
                    <div className="text-center">
                      <Wifi className="w-16 h-16 mx-auto mb-3 text-green-500" />
                      <p className="text-sm font-medium text-foreground">WhatsApp Conectado!</p>
                      <p className="text-xs text-muted-foreground mt-1">{selectedInstance}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => checkStatus(selectedInstance)}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" /> Verificar Status
                      </Button>
                    </div>
                  ) : qrCode ? (
                    <div className="text-center">
                      <img
                        src={qrCode}
                        alt="WhatsApp QR Code"
                        className="w-64 h-64 mx-auto rounded-lg border border-border"
                        loading="lazy"
                        decoding="async"
                      />
                      <p className="text-sm text-muted-foreground mt-3">
                        Escaneie com o WhatsApp do seu celular
                      </p>
                      {polling && (
                        <p className="text-xs text-primary mt-1 flex items-center justify-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Aguardando conexão...
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => getQrCode(selectedInstance)}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" /> Novo QR
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-3">
                        Instância: {selectedInstance}
                      </p>
                      <Button onClick={() => getQrCode(selectedInstance)} disabled={loading}>
                        {loading ? (
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <QrCode className="w-4 h-4 mr-1" />
                        )}
                        Gerar QR Code
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminWhatsApp;
