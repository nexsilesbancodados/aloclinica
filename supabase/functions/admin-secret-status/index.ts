import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getCaller } from "../_shared/auth.ts";
// Catálogo compartilhado com o painel (AdminMaintenanceCenter) — fonte única.
import { SECRET_DEFINITIONS, RUNTIME_FLAGS } from "../_shared/secret-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const caller = await getCaller(req);
  if (!caller.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }
  if (!caller.isAdmin) {
    return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), {
      status: 403,
      headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    checkedAt: new Date().toISOString(),
    secrets: SECRET_DEFINITIONS.map((secret) => ({
      ...secret,
      configured: isConfigured(secret.key),
    })),
    flags: RUNTIME_FLAGS.map((flag) => ({
      ...flag,
      enabled: Deno.env.get(flag.key)?.trim().toLowerCase() === "true",
    })),
  }), {
    headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});
