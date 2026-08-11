import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { checkRateLimit, getCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMPREFACE_URL = Deno.env.get("COMPREFACE_URL") || "https://face.aloclinica.com.br";
const COMPREFACE_API_KEY = Deno.env.get("COMPREFACE_API_KEY") || "";
const VERIFY_API_KEY = Deno.env.get("COMPREFACE_VERIFY_KEY") || COMPREFACE_API_KEY;
const DETECT_API_KEY = Deno.env.get("COMPREFACE_DETECT_KEY") || COMPREFACE_API_KEY;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action"); // "detect" or "verify"

    if (!action || !["detect", "verify"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid action param (detect|verify)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const caller = await getCaller(req);
    if (!caller.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = await checkRateLimit(`user:${caller.user.id}`, `compreface:${action}`, 20, 15);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Muitas verificações. Aguarde alguns minutos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    // Forward the multipart form data as-is
    const formData = await req.formData();

    const targetPath =
      action === "detect"
        ? "/api/v1/detection/detect"
        : "/api/v1/verification/verify";

    const apiKey = action === "detect" ? DETECT_API_KEY : VERIFY_API_KEY;

    const proxyRes = await fetch(`${COMPREFACE_URL}${targetPath}`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: formData,
    });

    const body = await proxyRes.text();

    return new Response(body, {
      status: proxyRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": proxyRes.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err: any) {
    console.error("[compreface-proxy]", err);
    return new Response(
      JSON.stringify({ error: err.message || "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
