import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * TURN/STUN credentials para WebRTC P2P.
 *
 * Estratégia em 3 camadas:
 *   1. coturn próprio (VPS 72.62.138.208) — STUN + TURN com long-term credentials
 *   2. Metered.live (se MET_KEY configurado) — TURN dinâmico expira em 4h
 *   3. Google STUN público — fallback (apenas STUN, NÃO funciona atrás de NAT simétrico)
 *
 * A camada própria só é anunciada quando COTURN_PASS está configurado. Sem o
 * relay instalado, anunciar o IP da VPS cria um servidor ICE fantasma.
 */

// coturn rodando na VPS — credenciais long-term (não expiram)
const COTURN_HOST = Deno.env.get("COTURN_HOST") || "72.62.138.208";
const COTURN_PORT = Deno.env.get("COTURN_PORT") || "3478";
const COTURN_USER = Deno.env.get("COTURN_USER") || "mirotalk";
// No hardcoded fallback — credential must come from env (Supabase secrets).
const COTURN_PASS = Deno.env.get("COTURN_PASS") || "";

function ownIceServers() {
  const servers: Array<Record<string, unknown>> = [];
  // Só anunciar o relay próprio quando a credencial estiver configurada via env.
  if (COTURN_PASS) {
    servers.push({
      urls: [
        `stun:${COTURN_HOST}:${COTURN_PORT}`,
        `turn:${COTURN_HOST}:${COTURN_PORT}?transport=udp`,
        `turn:${COTURN_HOST}:${COTURN_PORT}?transport=tcp`,
      ],
      username: COTURN_USER,
      credential: COTURN_PASS,
    });
  }
  // Fallbacks STUN públicos
  servers.push({ urls: "stun:stun.l.google.com:19302" });
  servers.push({ urls: "stun:stun1.l.google.com:19302" });
  return servers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Camada própria só quando o relay está configurado.
    const iceServers = ownIceServers();

    // Camada 2: tentar Metered como reforço (não bloqueante)
    const meteredKey = Deno.env.get("METERED_SECRET_KEY");
    const meteredApp = Deno.env.get("METERED_APP_NAME");
    if (meteredKey && meteredApp) {
      try {
        const credRes = await fetch(
          `https://${meteredApp}.metered.live/api/v1/turn/credential?secretKey=${meteredKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expiryInSeconds: 14400 }),
          }
        );
        if (credRes.ok) {
          const cred = await credRes.json();
          const iceRes = await fetch(
            `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${cred.apiKey}`
          );
          if (iceRes.ok) {
            const meteredServers = await iceRes.json();
            if (Array.isArray(meteredServers)) {
              iceServers.push(...meteredServers);
            }
          }
        }
      } catch (e) {
        console.warn("[TURN] Metered enrichment failed (não-bloqueante):", e);
      }
    }

    console.info(`[TURN] ${iceServers.length} ICE servers para user ${user.id}`);

    return new Response(JSON.stringify({ iceServers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("TURN credentials error:", error);
    // Mesmo em erro, devolver os servidores públicos disponíveis para não
    // quebrar o fluxo de vídeo por causa de uma falha opcional do Metered.
    return new Response(JSON.stringify({ iceServers: ownIceServers() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
