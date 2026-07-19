import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { callClaude, FAST_CLAUDE_MODEL } from "../_shared/anthropic.ts";
import { getCaller, isInternalOrService, checkRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authorize + rate-limit to curb LLM cost abuse. Internal/service calls
    // bypass; every other caller must be an authenticated user. Autocomplete
    // fires while typing, so use a generous per-minute cap. Fail closed.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowed = await checkRateLimit(`user:${caller.user.id}`, "medical-autocomplete", 60, 1, { failClosed: true });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }

    const { text, field } = await req.json();

    if (typeof text === "string" && text.length > 8000) {
      return new Response(JSON.stringify({ error: "input muito grande" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!text || text.length < 5) {
      return new Response(JSON.stringify({ suggestion: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = field === "diagnosis"
      ? "Você é um assistente médico. Complete o diagnóstico médico abaixo com a continuação mais provável em português brasileiro. Responda APENAS com a continuação do texto, sem repetir o que já foi escrito. Máximo 50 palavras. Inclua CID-10 quando possível."
      : "Você é um assistente médico. Complete a anotação clínica abaixo em português brasileiro. Responda APENAS com a continuação natural do texto. Máximo 80 palavras. Use termos médicos adequados.";

    let suggestion = "";
    try {
      suggestion = (await callClaude({
        model: FAST_CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
        max_tokens: 200,
        temperature: 0.3,
      })).trim();
    } catch (err: any) {
      if (err?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Anthropic error:", err);
      return new Response(JSON.stringify({ suggestion: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("medical-autocomplete error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
