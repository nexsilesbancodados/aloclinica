import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isPlaceholder = (value?: string | null) =>
  !value || value.includes("PLACEHOLDER_VALUE_TO_BE_REPLACED") || value.trim() === "";

const normalizeEvolutionUrl = (value?: string | null) => {
  if (isPlaceholder(value)) return null;
  const trimmed = value!.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Sensitive: can create/delete the WhatsApp session. Admin user only, or a
  // trusted server-to-server caller (x-internal-secret / service role).
  if (!isInternalOrService(req) && !(await getCaller(req)).isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    const baseUrl = normalizeEvolutionUrl(EVOLUTION_API_URL);

    if (!baseUrl || isPlaceholder(EVOLUTION_API_KEY)) {
      console.warn("Evolution API is not configured or still has placeholder values.");
      return jsonResponse({
        success: false,
        configured: false,
        error: "Evolution API not configured",
        code: "EVOLUTION_API_CONFIG_INVALID",
        message: "Configure EVOLUTION_API_URL with the real Evolution API URL and EVOLUTION_API_KEY with the real API key.",
      });
    }

    const body = await req.json();
    const { action, instanceName } = body;

    const headers = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    };

    // Create instance
    if (action === "create") {
      const name = instanceName || `allo-medico-${Date.now()}`;
      const res = await fetchEvo(`${baseUrl}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Create instance error:", data);
        return jsonResponse({ success: false, error: "Failed to create instance", details: data }, res.status);
      }
      return jsonResponse({ success: true, data, instanceName: name });
    }

    // Get QR code
    if (action === "qrcode") {
      if (!instanceName) {
        return jsonResponse({ success: false, error: "instanceName is required" }, 400);
      }
      const res = await fetchEvo(`${baseUrl}/instance/connect/${instanceName}`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("QR code error:", data);
        return jsonResponse({ success: false, error: "Failed to get QR code", details: data }, res.status);
      }
      return jsonResponse({ success: true, data });
    }

    // Check connection status
    if (action === "status") {
      if (!instanceName) {
        return jsonResponse({ success: false, error: "instanceName is required" }, 400);
      }
      const res = await fetchEvo(`${baseUrl}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // List instances
    if (action === "list") {
      const res = await fetchEvo(`${baseUrl}/instance/fetchInstances`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // Delete instance
    if (action === "delete") {
      if (!instanceName) {
        return jsonResponse({ success: false, error: "instanceName is required" }, 400);
      }
      const res = await fetchEvo(`${baseUrl}/instance/delete/${instanceName}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    return jsonResponse({ success: false, error: "Invalid action. Use: create, qrcode, status, list, delete" }, 400);
  } catch (error: any) {
    console.error("Error:", error);
    return jsonResponse({ success: false, error: error.message || "Unexpected WhatsApp integration error" }, 500);
  }
});
