import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * WhatsApp proxy — supports both WAHA and Evolution API as backend.
 * - If WAHA_API_URL + WAHA_API_KEY are set: uses WAHA (engine WEBJS, Puppeteer-based, more stable).
 * - Falls back to EVOLUTION_API_URL + EVOLUTION_API_KEY otherwise.
 *
 * WAHA Core (free) supports only "default" session — name param is ignored when using WAHA Core.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WAHA_URL = Deno.env.get("WAHA_API_URL");
    const WAHA_KEY = Deno.env.get("WAHA_API_KEY");
    const WAHA_SESSION = Deno.env.get("WAHA_SESSION") || "default";

    const useWaha = !!(WAHA_URL && WAHA_KEY);

    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!useWaha && (!EVOLUTION_API_URL || !EVOLUTION_API_KEY)) {
      return new Response(
        JSON.stringify({ error: "Neither WAHA nor Evolution API configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, instanceName } = body;

    if (useWaha) {
      const baseUrl = WAHA_URL!.replace(/\/+$/, "");
      const headers = { "Content-Type": "application/json", "X-Api-Key": WAHA_KEY! };
      const sessionName = instanceName || WAHA_SESSION;

      if (action === "create") {
        const startRes = await fetch(`${baseUrl}/api/sessions/${sessionName}/start`, {
          method: "POST", headers,
        });
        let data = await startRes.json();
        if (!startRes.ok && (data?.message || "").includes("not found")) {
          const createRes = await fetch(`${baseUrl}/api/sessions`, {
            method: "POST", headers,
            body: JSON.stringify({ name: sessionName, start: true }),
          });
          data = await createRes.json();
        }
        return new Response(JSON.stringify({ success: true, data, instanceName: sessionName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "qrcode") {
        const sess = sessionName;
        const res = await fetch(`${baseUrl}/api/${sess}/auth/qr?format=image`, {
          method: "GET", headers,
        });
        if (!res.ok) {
          const txt = await res.text();
          return new Response(JSON.stringify({ error: "Failed to get QR", details: txt }), {
            status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const buf = await res.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return new Response(
          JSON.stringify({ success: true, data: { base64: `data:image/png;base64,${base64}` } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "status") {
        const res = await fetch(`${baseUrl}/api/sessions/${sessionName}`, {
          method: "GET", headers,
        });
        const raw = await res.json();
        const wahaState = raw?.status as string | undefined;
        const mapped =
          wahaState === "WORKING" ? "open" :
          wahaState === "SCAN_QR_CODE" ? "connecting" :
          wahaState === "STARTING" ? "connecting" :
          wahaState === "FAILED" ? "close" :
          wahaState === "STOPPED" ? "close" : "unknown";
        return new Response(
          JSON.stringify({ success: true, data: { instance: { state: mapped }, raw, state: mapped } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "list") {
        const res = await fetch(`${baseUrl}/api/sessions`, { method: "GET", headers });
        const raw = await res.json();
        const mapped = (Array.isArray(raw) ? raw : []).map((s: any) => ({
          instance: {
            instanceName: s.name,
            status:
              s.status === "WORKING" ? "open" :
              s.status === "SCAN_QR_CODE" ? "connecting" :
              s.status === "STARTING" ? "connecting" :
              s.status === "FAILED" ? "close" :
              s.status === "STOPPED" ? "close" : s.status,
          },
        }));
        return new Response(JSON.stringify({ success: true, data: mapped }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "delete") {
        const stopRes = await fetch(`${baseUrl}/api/sessions/${sessionName}/stop`, {
          method: "POST", headers,
        });
        const data = await stopRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: "Invalid action. Use: create, qrcode, status, list, delete" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Evolution API fallback (legacy) ──────────────────────────────────────
    const baseUrl = EVOLUTION_API_URL!.replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY! };

    if (action === "create") {
      const name = instanceName || `allo-medico-${Date.now()}`;
      const res = await fetch(`${baseUrl}/instance/create`, {
        method: "POST", headers,
        body: JSON.stringify({ instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      });
      const data = await res.json();
      return new Response(JSON.stringify({ success: res.ok, data, instanceName: name }), {
        status: res.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "qrcode" && instanceName) {
      const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, { method: "GET", headers });
      const data = await res.json();
      return new Response(JSON.stringify({ success: res.ok, data }), {
        status: res.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "status" && instanceName) {
      const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, { method: "GET", headers });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "list") {
      const res = await fetch(`${baseUrl}/instance/fetchInstances`, { method: "GET", headers });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "delete" && instanceName) {
      const res = await fetch(`${baseUrl}/instance/delete/${instanceName}`, { method: "DELETE", headers });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("whatsapp-qr error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
