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
    // (e.g. auto-clinical-summary) bypass; everyone else must be an
    // authenticated user. Fail closed on rate-limit backend errors.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowed = await checkRateLimit(`user:${caller.user.id}`, "clinical-summary", 20, 1, { failClosed: true });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }

    const { notes, diagnosis, medications } = await req.json();

    const totalLen =
      (typeof notes === "string" ? notes.length : 0) +
      (typeof diagnosis === "string" ? diagnosis.length : 0) +
      (typeof medications === "string" ? medications.length : JSON.stringify(medications ?? "").length);
    if (totalLen > 8000) {
      return new Response(JSON.stringify({ error: "input muito grande" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const medsText = Array.isArray(medications)
      ? medications.map((m: Record<string, string>) => typeof m === "string" ? m : `${m.name || m.medication || ""} ${m.dosage || ""} ${m.instructions || ""}`).join("; ")
      : "";

    const systemPrompt = `Você é um assistente médico da plataforma AloClínica. Gere um resumo clínico em linguagem SIMPLES e acessível para o paciente (leigo). O resumo deve:
1. Explicar o que o médico encontrou (sem jargão)
2. Listar os medicamentos prescritos com orientações simples
3. Dar 2-3 recomendações gerais de cuidado
Seja empático, use linguagem acolhedora. Máximo 200 palavras. NÃO faça diagnósticos novos.`;

    let summary = "Resumo indisponível no momento.";
    try {
      summary = (await callClaude({
        model: FAST_CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Notas do médico: ${notes || "Não informado"}\nDiagnóstico: ${diagnosis || "Não informado"}\nMedicamentos: ${medsText || "Nenhum prescrito"}`,
        }],
        temperature: 0.3,
        max_tokens: 600,
      })) || summary;
    } catch (err: any) {
      if (err?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Clinical summary error:", error);
    return new Response(JSON.stringify({ error: "Não foi possível gerar o resumo." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
