import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller } from "../_shared/auth.ts";

/**
 * Registro de consentimento com IP capturado no SERVIDOR.
 *
 * Por que esta função existe: o front registrava o aceite chamando
 * `https://api.ipify.org` a partir do navegador para descobrir o próprio IP.
 * Isso falhava por três motivos, e o resultado era `ip_address: null` em todos
 * os registros de produção:
 *
 *   1. `api.ipify.org` não está no `connect-src` de nenhum dos CSPs
 *      (nginx.conf, vercel.json, public/_headers). O navegador bloqueia a
 *      requisição, o `catch` devolve null e o aceite é gravado sem IP.
 *   2. Mesmo liberado no CSP, um IP informado pelo cliente é falsificável —
 *      qualquer um pode interceptar a resposta. Para servir de prova de aceite
 *      isso não vale.
 *   3. Consultar um terceiro expõe o IP do titular a um serviço externo sem
 *      base legal para esse compartilhamento.
 *
 * Aqui o IP vem do cabeçalho da requisição que chega ao servidor, que o
 * titular não controla, e nunca sai da infraestrutura da plataforma.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Tipos aceitos — espelha ConsentType em src/lib/consent.ts. */
const ALLOWED_TYPES = new Set([
  "terms_of_use",
  "privacy_policy",
  "lgpd_data_processing",
  "biometric_kyc",
  "tcle_telemedicine",
  "cookies_essential",
  "cookies_analytics",
  "cookies_marketing",
  "cookies_all",
  "cookies_rejected",
]);

/**
 * O primeiro IP de `x-forwarded-for` é o do cliente; os seguintes são os
 * proxies do caminho. `x-real-ip` cobre o caso de proxy que não preenche o
 * encadeamento.
 */
const clientIp = (req: Request): string | null => {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { consent_type, version, accepted, document_url, metadata } = body ?? {};

    if (typeof consent_type !== "string" || !ALLOWED_TYPES.has(consent_type)) {
      return json({ error: "consent_type inválido" }, 400);
    }
    if (typeof version !== "string" || !version.trim()) {
      return json({ error: "version é obrigatória" }, 400);
    }

    // Aceite de cookies pode ocorrer antes do login; os demais exigem sessão,
    // senão qualquer visitante poderia gravar aceite em nome de terceiro.
    const isCookieConsent = consent_type.startsWith("cookies_");
    const caller = await getCaller(req);
    if (!caller.user && !isCookieConsent) {
      return json({ error: "Não autenticado" }, 401);
    }

    // Escrita com service_role: `consent_logs` é append-only e o titular não
    // deve poder alterar o próprio registro de aceite depois de gravado.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await admin.from("consent_logs").insert({
      user_id: caller.user?.id ?? null,
      consent_type,
      version: version.trim(),
      accepted: accepted !== false,
      document_url: typeof document_url === "string" ? document_url : null,
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent"),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });

    if (error) {
      console.error("[record-consent] insert falhou:", error.message);
      return json({ error: "Falha ao registrar consentimento" }, 500);
    }

    return json({ success: true });
  } catch (e) {
    console.error("[record-consent] erro:", e instanceof Error ? e.message : e);
    return json({ error: "Erro interno" }, 500);
  }
});
