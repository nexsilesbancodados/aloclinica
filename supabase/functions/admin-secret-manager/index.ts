import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getCaller, checkRateLimit, type Caller } from "../_shared/auth.ts";
import { RUNTIME_FLAGS, SECRET_DEFINITIONS } from "../_shared/secret-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
});

const manualOnly = new Set([
  "PROJECT_SECRETS_MANAGEMENT_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
]);

const editableKeys = new Set(
  SECRET_DEFINITIONS
    .filter((secret) => secret.editable === true && !manualOnly.has(secret.key) && !secret.key.startsWith("SUPABASE_"))
    .map((secret) => secret.key),
);

const isConfigured = (key: string) => {
  const value = Deno.env.get(key)?.trim();
  if (!value) return false;
  const normalized = value.toLowerCase();
  return ![
    "placeholder",
    "change_me",
    "change-me",
    "your_",
    "your-",
    "sua_",
    "sua-",
    "seu_",
    "seu-",
    "value_to_be_replaced",
  ].some((token) => normalized.includes(token));
};

type HealthStatus = "ok" | "down" | "unconfigured";
type HealthCheck = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs?: number;
  critical?: boolean;
};

const timedFetch = async (url: string, headers: Record<string, string> = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    return await fetch(url, { method: "GET", headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const httpHealth = async (
  key: string,
  label: string,
  url: string | undefined,
  headers: Record<string, string>,
  critical = false,
): Promise<HealthCheck> => {
  if (!url) return { key, label, status: "unconfigured", detail: "Endpoint não configurado", critical };
  const started = performance.now();
  try {
    const response = await timedFetch(url, headers);
    const latencyMs = Math.round(performance.now() - started);
    if (response.status >= 500) {
      return { key, label, status: "down", detail: `HTTP ${response.status}`, latencyMs, critical };
    }
    if (response.status === 401 || response.status === 403) {
      return { key, label, status: "down", detail: `Credencial recusada (HTTP ${response.status})`, latencyMs, critical };
    }
    return { key, label, status: "ok", detail: `Respondendo (HTTP ${response.status})`, latencyMs, critical };
  } catch (error) {
    return {
      key,
      label,
      status: "down",
      detail: error instanceof Error && error.name === "AbortError" ? "Timeout após 6s" : "Sem resposta",
      latencyMs: Math.round(performance.now() - started),
      critical,
    };
  }
};

type AdminCaller = Caller & { user: NonNullable<Caller["user"]>; client: NonNullable<Caller["client"]> };

const runHealthChecks = async (caller: AdminCaller) => {
  const services: HealthCheck[] = [];

  const dbStarted = performance.now();
  const { error: dbError } = await caller.client.from("specialties").select("id").limit(1);
  services.push({
    key: "database",
    label: "Banco de dados",
    status: dbError ? "down" : "ok",
    detail: dbError?.message ?? "Respondendo",
    latencyMs: Math.round(performance.now() - dbStarted),
    critical: true,
  });

  const authStarted = performance.now();
  services.push({
    key: "auth",
    label: "Autenticação",
    status: "ok",
    detail: "Sessão administrativa válida",
    latencyMs: Math.round(performance.now() - authStarted),
    critical: true,
  });

  const storageStarted = performance.now();
  const { error: storageError } = await caller.client.storage.from("avatars").list("", { limit: 1 });
  services.push({
    key: "storage",
    label: "Armazenamento",
    status: storageError ? "down" : "ok",
    detail: storageError?.message ?? "Bucket avatars acessível",
    latencyMs: Math.round(performance.now() - storageStarted),
    critical: true,
  });

  const integrationChecks = await Promise.all([
    httpHealth(
      "email",
      "E-mail / Brevo",
      isConfigured("BREVO_API_KEY") ? "https://api.brevo.com/v3/account" : undefined,
      Deno.env.get("BREVO_API_KEY") ? { "api-key": Deno.env.get("BREVO_API_KEY")! } : {},
      true,
    ),
    httpHealth(
      "whatsapp",
      "WhatsApp / Evolution",
      isConfigured("EVOLUTION_API_URL") ? Deno.env.get("EVOLUTION_API_URL") : undefined,
      Deno.env.get("EVOLUTION_API_KEY") ? { apikey: Deno.env.get("EVOLUTION_API_KEY")! } : {},
    ),
    httpHealth(
      "payments",
      "Pagamentos / Mercado Pago",
      isConfigured("MERCADOPAGO_ACCESS_TOKEN") ? "https://api.mercadopago.com/users/me" : undefined,
      Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ? { Authorization: `Bearer ${Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!}` } : {},
      true,
    ),
    httpHealth(
      "video",
      "Vídeo / MiroTalk",
      isConfigured("MIROTALK_URL") ? Deno.env.get("MIROTALK_URL") : undefined,
      Deno.env.get("MIROTALK_API_KEY") ? { Authorization: `Bearer ${Deno.env.get("MIROTALK_API_KEY")!}` } : {},
    ),
    httpHealth(
      "kyc",
      "KYC / CompreFace",
      isConfigured("COMPREFACE_URL") ? Deno.env.get("COMPREFACE_URL") : undefined,
      (Deno.env.get("COMPREFACE_VERIFY_KEY") ?? Deno.env.get("COMPREFACE_API_KEY"))
        ? { "x-api-key": (Deno.env.get("COMPREFACE_VERIFY_KEY") ?? Deno.env.get("COMPREFACE_API_KEY"))! }
        : {},
    ),
  ]);
  services.push(...integrationChecks);

  if (isConfigured("FOCUS_NFE_TOKEN")) {
    services.push({ key: "nfse", label: "NFS-e / Focus", status: "ok", detail: "Credencial presente; endpoint não testado", critical: false });
  } else {
    services.push({ key: "nfse", label: "NFS-e / Focus", status: "unconfigured", detail: "Credencial não configurada", critical: false });
  }

  const { data: backupLog } = await caller.client
    .from("activity_logs")
    .select("created_at, details")
    .eq("action", "daily_backup_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const backupDate = backupLog?.created_at ? new Date(backupLog.created_at) : null;
  const backupAgeHours = backupDate ? (Date.now() - backupDate.getTime()) / 3_600_000 : Infinity;
  services.push({
    key: "backup",
    label: "Backup diário",
    status: backupAgeHours <= 26 ? "ok" : backupDate ? "down" : "unconfigured",
    detail: backupDate ? `Último backup ${backupDate.toISOString()}` : "Nenhum backup registrado",
    latencyMs: 0,
    critical: true,
  });

  return {
    checkedAt: new Date().toISOString(),
    services,
    backup: backupLog ? { lastRunAt: backupLog.created_at, details: backupLog.details } : null,
  };
};

const projectRefFromUrl = () => {
  const configured = Deno.env.get("SUPABASE_PROJECT_REF")?.trim();
  if (configured && /^[a-z0-9]+$/.test(configured)) return configured;

  try {
    const hostname = new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname;
    const inferred = hostname.split(".")[0];
    return /^[a-z0-9]+$/.test(inferred) ? inferred : null;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const caller = await getCaller(req);
  if (!caller.user) return json({ error: "Não autenticado" }, 401);
  if (!caller.isAdmin) return json({ error: "Acesso restrito a administradores" }, 403);

  let body: { action?: unknown; updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // Keep inventory and writes in this single protected function so the panel
  // does not need another Edge Function slot in the project quota.
  if (body.action === "status") {
    return json({
      checkedAt: new Date().toISOString(),
      secrets: SECRET_DEFINITIONS.map((secret) => ({
        ...secret,
        configured: isConfigured(secret.key),
      })),
      flags: RUNTIME_FLAGS.map((flag) => ({
        ...flag,
        enabled: Deno.env.get(flag.key)?.trim().toLowerCase() === "true",
      })),
    });
  }

  if (body.action === "health") {
    if (!caller.user || !caller.client) return json({ error: "Sessão administrativa indisponível" }, 401);
    return json(await runHealthChecks({
      user: caller.user,
      isAdmin: caller.isAdmin,
      client: caller.client,
    }));
  }

  if (!await checkRateLimit(caller.user.id, "admin-secret-manager", 10, 10)) {
    return json({ error: "Muitas alterações. Aguarde alguns minutos." }, 429);
  }

  const managementToken = Deno.env.get("PROJECT_SECRETS_MANAGEMENT_TOKEN")?.trim();
  if (!managementToken) {
    return json({ error: "Configure manualmente PROJECT_SECRETS_MANAGEMENT_TOKEN antes de usar o painel." }, 503);
  }

  const projectRef = projectRefFromUrl();
  if (!projectRef) return json({ error: "Projeto Supabase não identificado" }, 500);

  if (!Array.isArray(body.updates) || body.updates.length === 0 || body.updates.length > 60) {
    return json({ error: "Envie entre 1 e 60 secrets" }, 400);
  }

  const updates: { name: string; value: string }[] = [];
  const seen = new Set<string>();
  const rejectedKeys: string[] = [];
  for (const item of body.updates) {
    if (!item || typeof item !== "object") return json({ error: "Formato de secret inválido" }, 400);
    const name = (item as { key?: unknown }).key;
    const value = (item as { value?: unknown }).value;
    if (typeof name !== "string" || !editableKeys.has(name) || seen.has(name)) {
      if (typeof name === "string") rejectedKeys.push(name.slice(0, 128));
      continue;
    }
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    if (!normalizedValue || new TextEncoder().encode(normalizedValue).byteLength > 48 * 1024) {
      return json({ error: `Valor inválido para ${name}` }, 400);
    }
    seen.add(name);
    updates.push({ name, value: normalizedValue });
  }

  if (rejectedKeys.length > 0) {
    return json({ error: "Há secrets não permitidos pelo catálogo", rejectedKeys }, 400);
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      console.error("[admin-secret-manager] Management API rejected update", { status: response.status, count: updates.length });
      return json({ error: "O Supabase recusou a atualização. Verifique o token fine-grained e o escopo edge_functions_secrets_write." }, response.status === 429 ? 429 : 502);
    }

    // Audit only metadata. Secret values must never enter the database, response,
    // or logs. A successful Management API write remains successful if the
    // secondary audit insert is unavailable, but the failure is visible server-side.
    const { error: auditError } = await caller.client!.from("activity_logs").insert({
      user_id: caller.user.id,
      performed_by: caller.user.id,
      action: "admin_secrets_updated",
      entity_type: "system",
      details: {
        secret_names: updates.map(({ name }) => name),
        count: updates.length,
        source: "admin-maintenance",
      },
    });
    if (auditError) {
      console.error("[admin-secret-manager] audit log failed", { message: auditError.message, count: updates.length });
    }

    return json({ updated: updates.length, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[admin-secret-manager] Management API unavailable", { message: error instanceof Error ? error.message : "unknown" });
    return json({ error: "Não foi possível alcançar o gerenciamento de secrets do Supabase" }, 502);
  }
});
