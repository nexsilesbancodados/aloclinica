import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getCaller, checkRateLimit } from "../_shared/auth.ts";
import { SECRET_DEFINITIONS } from "../_shared/secret-catalog.ts";

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

  if (!await checkRateLimit(caller.user.id, "admin-secret-manager", 10, 10)) {
    return json({ error: "Muitas alterações. Aguarde alguns minutos." }, 429);
  }

  const managementToken = Deno.env.get("PROJECT_SECRETS_MANAGEMENT_TOKEN")?.trim();
  if (!managementToken) {
    return json({ error: "Configure manualmente PROJECT_SECRETS_MANAGEMENT_TOKEN antes de usar o painel." }, 503);
  }

  const projectRef = projectRefFromUrl();
  if (!projectRef) return json({ error: "Projeto Supabase não identificado" }, 500);

  let body: { updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

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
    if (typeof value !== "string" || value.length < 1 || new TextEncoder().encode(value).byteLength > 48 * 1024) {
      return json({ error: `Valor inválido para ${name}` }, 400);
    }
    seen.add(name);
    updates.push({ name, value });
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
