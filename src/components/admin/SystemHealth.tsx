import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "@/components/admin/adminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Database, Bot, Globe, Server, Users, FileText, Calendar, HardDrive, Shield, Monitor, Video, MessageCircle, CreditCard, Mail, Brain, Stethoscope, FileSignature, Eye, Bell, Plug } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";

interface HealthCheck {
  name: string;
  status: "ok" | "error" | "checking";
  latency?: number;
  message?: string;
  icon: React.ReactNode;
  group?: "core" | "vps" | "integration";
}

interface DbStats {
  patients: number;
  doctors: number;
  appointments: number;
  prescriptions: number;
  examReports: number;
  activeSubscriptions: number;
  queueWaiting: number;
  storageBuckets: number;
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const SystemHealth = () => {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { runChecks(); }, []);

  const fetchDbStats = async () => {
    const [patients, doctors, appts, prescriptions, reports, subs, queue] = await Promise.all([
      db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "patient"),
      db.from("doctor_profiles").select("id", { count: "exact", head: true }),
      db.from("appointments").select("id", { count: "exact", head: true }),
      db.from("prescriptions").select("id", { count: "exact", head: true }),
      db.from("exam_reports").select("id", { count: "exact", head: true }),
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("on_demand_queue").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    ]);
    setDbStats({
      patients: patients.count ?? 0,
      doctors: doctors.count ?? 0,
      appointments: appts.count ?? 0,
      prescriptions: prescriptions.count ?? 0,
      examReports: reports.count ?? 0,
      activeSubscriptions: subs.count ?? 0,
      queueWaiting: queue.count ?? 0,
      storageBuckets: 7,
    });
  };

  const runChecks = async () => {
    setRunning(true);
    const results: HealthCheck[] = [];

    // 1. Database
    const dbStart = performance.now();
    try {
      const { error } = await db.from("specialties").select("id").limit(1);
      const latency = Math.round(performance.now() - dbStart);
      results.push({
        name: "Banco de Dados (PostgreSQL)",
        status: error ? "error" : "ok",
        latency,
        message: error ? error.message : `Respondendo em ${latency}ms`,
        icon: <Database className="w-5 h-5" />,
        group: "core",
      });
    } catch (e: unknown) {
      results.push({ name: "Banco de Dados (PostgreSQL)", status: "error", message: e instanceof Error ? e.message : "Erro desconhecido", icon: <Database className="w-5 h-5" />, group: "core" });
    }

    // 2. Auth
    const authStart = performance.now();
    try {
      const { data } = await db.auth.getSession();
      const latency = Math.round(performance.now() - authStart);
      results.push({
        name: "Autenticação (GoTrue)",
        status: "ok",
        latency,
        message: data.session ? `Sessão ativa • ${latency}ms` : `Sem sessão • ${latency}ms`,
        icon: <Server className="w-5 h-5" />,
        group: "core",
      });
    } catch (e: unknown) {
      results.push({ name: "Autenticação (GoTrue)", status: "error", message: e instanceof Error ? e.message : "Erro desconhecido", icon: <Server className="w-5 h-5" />, group: "core" });
    }

    // 3. Edge Functions
    const efStart = performance.now();
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/calculate-shift-price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const latency = Math.round(performance.now() - efStart);
      results.push({
        name: "Edge Functions (Deno)",
        status: res.ok || res.status === 400 ? "ok" : "error",
        latency,
        message: `Gateway ativo • ${latency}ms`,
        icon: <Bot className="w-5 h-5" />,
        group: "core",
      });
    } catch (e: unknown) {
      results.push({ name: "Edge Functions (Deno)", status: "error", message: e instanceof Error ? e.message : "Erro desconhecido", icon: <Bot className="w-5 h-5" />, group: "core" });
    }

    // 4. Realtime
    const rtStart = performance.now();
    try {
      const channel = db.channel("health-check-ping");
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error("Timeout")); }, 5000);
        channel.subscribe((status) => {
          clearTimeout(timeout);
          if (status === "SUBSCRIBED") resolve();
          else reject(new Error(`Status: ${status}`));
        });
      });
      db.removeChannel(channel);
      const latency = Math.round(performance.now() - rtStart);
      results.push({
        name: "Realtime (WebSocket)",
        status: "ok",
        latency,
        message: `Conectado • ${latency}ms`,
        icon: <Globe className="w-5 h-5" />,
        group: "core",
      });
    } catch (e: unknown) {
      results.push({ name: "Realtime (WebSocket)", status: "error", message: e instanceof Error ? e.message : "Erro desconhecido", icon: <Globe className="w-5 h-5" />, group: "core" });
    }

    // 5. Storage
    const stStart = performance.now();
    try {
      const { error } = await db.storage.from("avatars").list("", { limit: 1 });
      const latency = Math.round(performance.now() - stStart);
      results.push({
        name: "Storage (S3)",
        status: error ? "error" : "ok",
        latency,
        message: error ? error.message : `Acessível • ${latency}ms`,
        icon: <HardDrive className="w-5 h-5" />,
        group: "core",
      });
    } catch (e: unknown) {
      results.push({ name: "Storage (S3)", status: "error", message: e instanceof Error ? e.message : "Erro desconhecido", icon: <HardDrive className="w-5 h-5" />, group: "core" });
    }

    // 6–10. VPS Services
    const vpsServices = [
      { name: "CompreFace (Biometria)", url: "http://72.62.138.208:8000", icon: <Shield className="w-5 h-5" /> },
      { name: "Orthanc PACS (DICOM)", url: "http://72.62.138.208:8042", icon: <Server className="w-5 h-5" /> },
      { name: "OHIF Viewer", url: "http://72.62.138.208:3001", icon: <Monitor className="w-5 h-5" /> },
      { name: "DocuSeal (Assinaturas)", url: "http://72.62.138.208:3200", icon: <FileText className="w-5 h-5" /> },
      { name: "Jitsi Meet (Vídeo)", url: "https://meet.telemedicinaaloclinica.sbs", icon: <Video className="w-5 h-5" /> },
    ];

    for (const svc of vpsServices) {
      const start = performance.now();
      try {
        const res = await fetch(svc.url, { mode: "no-cors", signal: AbortSignal.timeout(5000) });
        const latency = Math.round(performance.now() - start);
        results.push({ name: svc.name, status: "ok", latency, message: `Acessível • ${latency}ms`, icon: svc.icon, group: "vps" });
      } catch (e: unknown) {
        const latency = Math.round(performance.now() - start);
        results.push({ name: svc.name, status: "error", latency, message: e instanceof Error ? e.message : "Inacessível", icon: svc.icon, group: "vps" });
      }
    }

    // 11+. Integrações Externas (Edge Functions)
    const integrations = [
      { name: "WhatsApp (Evolution API)", fn: "whatsapp-notify", icon: <MessageCircle className="w-5 h-5" /> },
      { name: "Mercado Pago (Pagamentos)", fn: "mercadopago-create-payment", icon: <CreditCard className="w-5 h-5" /> },
      { name: "Lovable AI Gateway", fn: "ai-assistant", icon: <Brain className="w-5 h-5" /> },
      { name: "Sugestão de Laudo (Claude)", fn: "sugerir-laudo", icon: <Brain className="w-5 h-5" /> },
      { name: "Memed (Prescrições)", fn: "memed-prescriber", icon: <Stethoscope className="w-5 h-5" /> },
      { name: "DocuSeal (Assinatura digital)", fn: "docuseal-proxy", icon: <FileSignature className="w-5 h-5" /> },
      { name: "VidaaS (Assinatura ICP)", fn: "vidaas-sign", icon: <FileSignature className="w-5 h-5" /> },
      { name: "CompreFace Proxy (KYC)", fn: "compreface-proxy", icon: <Eye className="w-5 h-5" /> },
      { name: "Didit KYC", fn: "didit-kyc", icon: <Shield className="w-5 h-5" /> },
      { name: "Orthanc Proxy (DICOM)", fn: "orthanc-proxy", icon: <Server className="w-5 h-5" /> },
      { name: "Resend (E-mail)", fn: "send-email", icon: <Mail className="w-5 h-5" /> },
      { name: "Push Notifications", fn: "send-push-notification", icon: <Bell className="w-5 h-5" /> },
      { name: "Verify CRM (CFM)", fn: "verify-crm", icon: <Shield className="w-5 h-5" /> },
      { name: "Triagem por Sintomas (IA)", fn: "symptom-triage", icon: <Brain className="w-5 h-5" /> },
      { name: "Lembretes WhatsApp", fn: "appointment-reminders", icon: <MessageCircle className="w-5 h-5" /> },
    ];

    await Promise.all(integrations.map(async (svc) => {
      const start = performance.now();
      try {
        // OPTIONS preflight: confirma deploy + CORS sem efeitos colaterais
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${svc.fn}`, {
          method: "OPTIONS",
          headers: {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
            Origin: window.location.origin,
          },
          signal: AbortSignal.timeout(8000),
        });
        const latency = Math.round(performance.now() - start);
        const ok = res.status >= 200 && res.status < 500 && res.status !== 404;
        results.push({
          name: svc.name,
          status: ok ? "ok" : "error",
          latency,
          message: ok ? `Deployada • ${latency}ms` : `HTTP ${res.status}`,
          icon: svc.icon,
          group: "integration",
        });
      } catch (e: unknown) {
        const latency = Math.round(performance.now() - start);
        results.push({
          name: svc.name,
          status: "error",
          latency,
          message: e instanceof Error ? e.message : "Sem resposta",
          icon: svc.icon,
          group: "integration",
        });
      }
    }));

    setChecks(results);
    setLastCheck(new Date());
    setRunning(false);
    fetchDbStats();
  };

  const allOk = checks.length > 0 && checks.every(c => c.status === "ok");
  const hasErrors = checks.some(c => c.status === "error");
  const avgLatency = checks.length > 0 ? Math.round(checks.reduce((sum, c) => sum + (c.latency ?? 0), 0) / checks.length) : 0;

  const dbStatCards = dbStats ? [
    { label: "Pacientes", value: dbStats.patients, icon: Users, color: "text-primary" },
    { label: "Médicos", value: dbStats.doctors, icon: Users, color: "text-secondary" },
    { label: "Consultas", value: dbStats.appointments, icon: Calendar, color: "text-primary" },
    { label: "Receitas", value: dbStats.prescriptions, icon: FileText, color: "text-success" },
    { label: "Laudos", value: dbStats.examReports, icon: FileText, color: "text-warning" },
    { label: "Assinaturas", value: dbStats.activeSubscriptions, icon: Server, color: "text-success" },
    { label: "Fila Urgência", value: dbStats.queueWaiting, icon: Clock, color: dbStats.queueWaiting > 0 ? "text-destructive" : "text-muted-foreground" },
    { label: "Buckets", value: dbStats.storageBuckets, icon: HardDrive, color: "text-muted-foreground" },
  ] : [];

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("health")}>
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl space-y-6">
        <motion.div variants={fadeUp} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tabular-nums">Saúde do Sistema</h1>
            <p className="text-sm text-muted-foreground">Diagnóstico em tempo real · {checks.filter(c => c.status === "ok").length}/{checks.length} serviços ok</p>
          </div>
          <div className="flex items-center gap-3 pb-24 md:pb-8">
            {lastCheck && (
              <span className="text-xs text-muted-foreground">
                {format(lastCheck, "HH:mm:ss")}
              </span>
            )}
            <Button size="sm" variant="outline" className="rounded-xl" onClick={runChecks} disabled={running}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Verificando..." : "Verificar"}
            </Button>
          </div>
        </motion.div>

        {/* Overall status */}
        {checks.length > 0 && (
          <motion.div variants={fadeUp}>
            <Card className={`border-2 ${allOk ? "border-success/30 bg-success/5" : hasErrors ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
              <CardContent className="p-6 flex items-center gap-5">
                {allOk ? (
                  <CheckCircle2 className="w-14 h-14 text-success shrink-0" />
                ) : (
                  <XCircle className="w-14 h-14 text-destructive shrink-0" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    {allOk ? "Todos os sistemas operacionais" : `${checks.filter(c => c.status === "error").length} serviço(s) com falha`}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Latência média: {avgLatency}ms · Uptime: {allOk ? "100%" : `${Math.round((checks.filter(c => c.status === "ok").length / checks.length) * 100)}%`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Service checks agrupados */}
        {([
          { key: "core", label: "🧱 Núcleo Supabase", icon: <Database className="w-4 h-4" /> },
          { key: "vps", label: "🖥️ Servidores VPS", icon: <Server className="w-4 h-4" /> },
          { key: "integration", label: "🔌 Integrações & Edge Functions", icon: <Plug className="w-4 h-4" /> },
        ] as const).map((section) => {
          const items = checks.filter((c) => (c.group ?? "core") === section.key);
          if (items.length === 0) return null;
          const okCount = items.filter((c) => c.status === "ok").length;
          return (
            <motion.div key={section.key} variants={fadeUp}>
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  {section.icon} {section.label}
                </p>
                <Badge variant={okCount === items.length ? "default" : "destructive"} className="text-[10px] h-5">
                  {okCount}/{items.length}
                </Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {items.map((check, i) => (
                  <Card key={`${section.key}-${i}`} className={`border ${check.status === "ok" ? "border-success/20" : "border-destructive/30"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          check.status === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}>
                          {check.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground text-sm truncate">{check.name}</p>
                            <Badge variant={check.status === "ok" ? "default" : "destructive"} className="text-[10px] h-5 shrink-0">
                              {check.status === "ok" ? "ATIVO" : "FALHA"}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{check.message}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          );
        })}

        {/* DB Stats */}
        {dbStats && (
          <motion.div variants={fadeUp}>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">📊 Estatísticas do Banco</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dbStatCards.map((stat) => (
                <Card key={stat.label} className="border-border/50">
                  <CardContent className="p-4 text-center">
                    <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {checks.length === 0 && !running && (
          <Card className="border-border">
            <CardContent className="py-12 text-center">
              <Server className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Clique em "Verificar" para iniciar o diagnóstico.</p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default SystemHealth;
