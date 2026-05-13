import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VIDAAS_BASE = "https://certificado.vidaas.com.br";

// Generate PKCE code_verifier and code_challenge (S256)
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = base64UrlEncode(array);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = base64Encode(buffer);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // ─── ACTION: status ───
    // Health-check leve: a função verifica se VIDAAS_CLIENT_ID/SECRET
    // estão configurados nos secrets. Usado pelo front pra decidir entre
    // "ICP-Brasil real" e "assinatura simplificada (hash local)".
    if (action === "status") {
      const hasClientId = !!Deno.env.get("VIDAAS_CLIENT_ID");
      const hasClientSecret = !!Deno.env.get("VIDAAS_CLIENT_SECRET");
      return new Response(
        JSON.stringify({
          configured: hasClientId && hasClientSecret,
          has_client_id: hasClientId,
          has_client_secret: hasClientSecret,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: register_app ───
    // Cadastra a aplicação no VIDaaS (feito uma única vez)
    if (action === "register_app") {
      const { app_name, email, redirect_uris } = body;

      const res = await fetch(`${VIDAAS_BASE}/v0/oauth/application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: app_name || "Allo Médico",
          comments: "Plataforma de telemedicina Allo Médico - assinatura digital ICP-Brasil",
          redirect_uris: redirect_uris || [
            `${supabaseUrl}/functions/v1/vidaas-callback`,
          ],
          email: email || "plenasaudebv@gmail.com",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao registrar app no VIDaaS", details: data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the registration
      await supabase.from("activity_logs").insert({
        action: "vidaas_app_registered",
        entity_type: "integration",
        details: {
          client_id: data.client_id,
          app_name: app_name || "Allo Médico",
          registered_at: new Date().toISOString(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Aplicação registrada com sucesso no VIDaaS!",
          client_id: data.client_id,
          client_secret: data.client_secret,
          instructions: "Salve o client_id e client_secret como secrets VIDAAS_CLIENT_ID e VIDAAS_CLIENT_SECRET.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: user_discovery ───
    // Verifica se um CPF/CNPJ tem certificado no VIDaaS
    if (action === "user_discovery") {
      const VIDAAS_CLIENT_ID = Deno.env.get("VIDAAS_CLIENT_ID");
      const VIDAAS_CLIENT_SECRET = Deno.env.get("VIDAAS_CLIENT_SECRET");

      if (!VIDAAS_CLIENT_ID || !VIDAAS_CLIENT_SECRET) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "VIDaaS não configurado. Execute register_app primeiro e salve as credenciais.",
            configured: false,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { cpf_cnpj, type } = body; // type: "CPF" or "CNPJ"

      const res = await fetch(`${VIDAAS_BASE}/v0/oauth/user-discovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: VIDAAS_CLIENT_ID,
          client_secret: VIDAAS_CLIENT_SECRET,
          user_cpf_cnpj: type || "CPF",
          val_cpf_cnpj: cpf_cnpj.replace(/[.\-\/]/g, ""),
        }),
      });

      const data = await res.json();

      return new Response(
        JSON.stringify({
          success: data.status === "S",
          found: data.status === "S",
          slots: data.slots || [],
          message: data.status === "S"
            ? `Certificado encontrado! ${data.slots?.length || 0} certificado(s) disponível(is).`
            : "Nenhum certificado encontrado para este CPF/CNPJ no VIDaaS.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: authorize ───
    // Gera URL de autorização com PKCE para o médico autenticar
    if (action === "authorize") {
      const VIDAAS_CLIENT_ID = Deno.env.get("VIDAAS_CLIENT_ID");

      if (!VIDAAS_CLIENT_ID) {
        return new Response(
          JSON.stringify({ success: false, error: "VIDAAS_CLIENT_ID não configurado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { login_hint, scope, lifetime, redirect_uri } = body;
      const { codeVerifier, codeChallenge } = await generatePKCE();

      const callbackUri = redirect_uri || `${supabaseUrl}/functions/v1/vidaas-callback`;

      const params = new URLSearchParams({
        client_id: VIDAAS_CLIENT_ID,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        response_type: "code",
        scope: scope || "signature_session",
        redirect_uri: callbackUri,
      });

      if (login_hint) params.set("login_hint", login_hint.replace(/[.\-\/]/g, ""));
      if (lifetime) params.set("lifetime", String(lifetime));

      const authUrl = `${VIDAAS_BASE}/v0/oauth/authorize?${params.toString()}`;

      return new Response(
        JSON.stringify({
          success: true,
          auth_url: authUrl,
          code_verifier: codeVerifier,
          message: "Redirecione o médico para auth_url. Guarde code_verifier para o passo do token.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: callback ───
    // Recebe o redirect do VIDaaS com o authorization code
    if (action === "callback") {
      const url = new URL(req.url);
      const code = url.searchParams.get("code") || body.code;

      if (!code) {
        return new Response(
          JSON.stringify({ success: false, error: "Código de autorização não recebido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If it's a browser redirect, send to frontend with the code
      if (req.method === "GET") {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/dashboard?vidaas_code=${code}`,
            ...corsHeaders,
          },
        });
      }

      // If it's a POST, exchange code for token
      const VIDAAS_CLIENT_ID = Deno.env.get("VIDAAS_CLIENT_ID");
      const VIDAAS_CLIENT_SECRET = Deno.env.get("VIDAAS_CLIENT_SECRET");

      if (!VIDAAS_CLIENT_ID || !VIDAAS_CLIENT_SECRET) {
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais VIDaaS não configuradas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { code_verifier } = body;

      const tokenRes = await fetch(`${VIDAAS_BASE}/v0/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: VIDAAS_CLIENT_ID,
          client_secret: VIDAAS_CLIENT_SECRET,
          code,
          code_verifier: code_verifier || "",
          redirect_uri: `${supabaseUrl}/functions/v1/vidaas-callback`,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao obter token VIDaaS", details: tokenData }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in,
          scope: tokenData.scope,
          authorized_cpf: tokenData.authorized_identification,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: sign ───
    // Assina hash(es) com certificado ICP-Brasil via VIDaaS
    if (action === "sign") {
      const { access_token, hashes, document_type, doctor_name, doctor_crm, verification_code } = body;

      if (!access_token || !hashes || !hashes.length) {
        return new Response(
          JSON.stringify({ success: false, error: "access_token e hashes são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Format hashes for VIDaaS API
      const formattedHashes = hashes.map((h: any, i: number) => ({
        id: h.id || `doc-${i}`,
        alias: h.alias || `Documento ${i + 1}`,
        hash: h.hash,
        hash_algorithm: h.hash_algorithm || "2.16.840.1.101.3.4.2.1", // SHA-256
        signature_format: h.signature_format || "CAdES_AD_RB", // Padrão ICP-Brasil
      }));

      const signRes = await fetch(`${VIDAAS_BASE}/v0/oauth/signature`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({ hashes: formattedHashes }),
      });

      const signData = await signRes.json();

      if (!signRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "Falha na assinatura ICP-Brasil", details: signData }),
          { status: signRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the signature
      await supabase.from("activity_logs").insert({
        action: "icp_brasil_signature",
        entity_type: "document",
        details: {
          document_type,
          doctor_name,
          doctor_crm,
          verification_code,
          hashes_signed: formattedHashes.length,
          certificate_alias: signData.certificate_alias || "N/A",
          signed_at: new Date().toISOString(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          signatures: signData.signatures,
          certificate_alias: signData.certificate_alias,
          signed_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: status ───
    // Verifica se VIDaaS está configurado
    if (action === "status") {
      const VIDAAS_CLIENT_ID = Deno.env.get("VIDAAS_CLIENT_ID");
      const VIDAAS_CLIENT_SECRET = Deno.env.get("VIDAAS_CLIENT_SECRET");

      return new Response(
        JSON.stringify({
          configured: !!(VIDAAS_CLIENT_ID && VIDAAS_CLIENT_SECRET),
          has_client_id: !!VIDAAS_CLIENT_ID,
          has_client_secret: !!VIDAAS_CLIENT_SECRET,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Ação inválida.",
        available_actions: ["register_app", "user_discovery", "authorize", "callback", "sign", "status"],
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("VIDaaS sign error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
