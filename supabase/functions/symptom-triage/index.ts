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
    // bypass; everyone else must be an authenticated user. Fail closed.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowed = await checkRateLimit(`user:${caller.user.id}`, "symptom-triage", 20, 1, { failClosed: true });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }

    const { symptoms } = await req.json();

    if (typeof symptoms === "string" && symptoms.length > 8000) {
      return new Response(JSON.stringify({ error: "input muito grande" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um assistente de triagem médica da plataforma AloClínica. Com base nos sintomas descritos pelo paciente, sugira UMA especialidade médica adequada. Responda APENAS em JSON válido com este formato:
{"specialty": "nome da especialidade", "reason": "explicação curta de 1-2 frases", "urgency": "low|medium|high"}

Especialidades disponíveis: Clínico Geral, Dermatologia, Ortopedia, Neurologia, Cardiologia, Endocrinologia, Oftalmologia, Pediatria.
Se não conseguir determinar, sugira Clínico Geral.
NUNCA faça diagnóstico. Apenas sugira a especialidade mais adequada.`;

    let content = "";
    try {
      content = await callClaude({
        model: FAST_CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: "user", content: `Sintomas do paciente: ${symptoms}` }],
        temperature: 0.2,
        max_tokens: 300,
      });
    } catch (err: any) {
      if (err?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    let result;
    try {
      // Try to parse JSON from the response content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { specialty: "Clínico Geral", reason: "Recomendamos uma avaliação geral.", urgency: "low" };
    } catch {
      result = { specialty: "Clínico Geral", reason: "Recomendamos uma avaliação geral.", urgency: "low" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Triage error:", error);
    return new Response(JSON.stringify({ 
      specialty: "Clínico Geral", 
      reason: "Recomendamos uma avaliação geral com um clínico.", 
      urgency: "low" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
