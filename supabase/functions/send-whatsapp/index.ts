import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Workaround: Evolution API server has an invalid TLS certificate.
// Try HTTPS first, if cert error, retry with HTTP.
const fetchEvo = async (url: string, opts: RequestInit = {}): Promise<Response> => {
  try {
    return await fetch(url, opts);
  } catch (error: any) {
    const errStr = String(error);
    if (errStr.includes("certificate") || errStr.includes("tls") || errStr.includes("CaUsedAsEndEntity")) {
      console.warn("TLS error, retrying with HTTP:", error);
      const httpUrl = url.replace(/^https:\/\//, "http://");
      return await fetch(httpUrl, opts);
    }
    throw error;
  }
};

interface WhatsAppRequest {
  phone: string;
  message: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: 20 req/min por IP
    const identifier = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const since = new Date(Date.now() - 60000).toISOString();
      const { count } = await sb.from("rate_limits").select("id", { count: "exact", head: true })
        .eq("identifier", identifier).eq("endpoint", "send-whatsapp").gte("window_start", since);
      if ((count ?? 0) >= 20) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde um momento." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
      await sb.from("rate_limits").insert({ identifier, endpoint: "send-whatsapp", window_start: new Date().toISOString() });
    } catch { /* rate limit check failure is non-blocking */ }

    const WAHA_URL = Deno.env.get("WAHA_API_URL");
    const WAHA_KEY = Deno.env.get("WAHA_API_KEY");
    const WAHA_SESSION = Deno.env.get("WAHA_SESSION") || "default";
    const useWaha = !!(WAHA_URL && WAHA_KEY);

    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!useWaha && (!EVOLUTION_API_URL || !EVOLUTION_API_KEY)) {
      console.info("[DEV] WhatsApp would be sent but no provider configured");
      const body: WhatsAppRequest = await req.json();
      console.info("[DEV] Message:", JSON.stringify(body));
      return new Response(
        JSON.stringify({ success: true, dev: true, message: "WhatsApp logged (no provider configured)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: WhatsAppRequest = await req.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    let res: Response;
    let apiUrl: string;

    if (useWaha) {
      const wahaBase = WAHA_URL!.replace(/\/+$/, "");
      apiUrl = `${wahaBase}/api/sendText`;
      res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_KEY! },
        body: JSON.stringify({
          chatId: `${fullPhone}@c.us`,
          text: message,
          session: WAHA_SESSION,
        }),
      });
    } else {
      const baseUrl = EVOLUTION_API_URL!.replace(/\/+$/, "");
      const apiHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY! };
      const instancesRes = await fetchEvo(`${baseUrl}/instance/fetchInstances`, { method: "GET", headers: apiHeaders });
      const allInstances = await instancesRes.json();
      const connectedInstance = Array.isArray(allInstances)
        ? allInstances.find((i: Record<string, Record<string, string>>) => i?.instance?.status === "open")
        : null;
      if (!connectedInstance) {
        return new Response(
          JSON.stringify({ error: "Nenhuma instância WhatsApp conectada. Configure no painel admin." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const instanceName = connectedInstance.instance.instanceName;
      apiUrl = `${baseUrl}/message/sendText/${instanceName}`;
      res = await fetchEvo(apiUrl, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ number: fullPhone, text: message }),
      });
    }

    const result = await res.json();

    if (!res.ok) {
      console.error("Evolution API error:", result);
      return new Response(JSON.stringify({ error: "Failed to send WhatsApp", details: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
