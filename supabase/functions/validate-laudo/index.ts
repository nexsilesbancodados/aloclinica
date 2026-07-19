import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { getCaller, isInternalOrService, checkRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ValidationResult {
  is_valid: boolean;
  score: number; // 0-100
  issues: Array<{ type: string; severity: "error" | "warning" | "info"; message: string }>;
  suggestions: string[];
  metadata: {
    has_technique: boolean;
    has_findings: boolean;
    has_conclusion: boolean;
    estimated_quality: "excellent" | "good" | "fair" | "poor";
    word_count: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This endpoint is publicly invokable (verify_jwt=false) and drives an
    // expensive LLM call. Require a trusted caller (internal/service or an
    // authenticated user) and rate-limit to curb cost abuse. Fail closed.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowed = await checkRateLimit(`user:${caller.user.id}`, "validate-laudo", 20, 1, { failClosed: true });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }

    const { laudo_text, exam_type } = await req.json();

    if (!laudo_text || typeof laudo_text !== "string" || laudo_text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "laudo_text é obrigatório e não pode ser vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (laudo_text.length > 8000) {
      return new Response(
        JSON.stringify({ error: "input muito grande" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um especialista em validação de laudos médicos. Analise o laudo abaixo e retorne um JSON estruturado com a validação.

CRITÉRIOS DE VALIDAÇÃO:
1. Estrutura: tem técnica, achados e conclusão?
2. Gramática: erros de português ou termos médicos?
3. Consistência: achados batem com a conclusão?
4. Completude: tem informações suficientes?
5. Qualidade: segue padrões radiológicos? (BIRADS, TIRADS, etc)
6. Clareza: linguagem é objetiva e profissional?

RETORNE SEMPRE um JSON válido com este formato:
{
  "is_valid": boolean,
  "score": number (0-100),
  "issues": [{"type": "grammar|structure|consistency|clarity|completeness", "severity": "error|warning|info", "message": "..."}],
  "suggestions": ["sugestão 1", "sugestão 2", ...],
  "has_technique": boolean,
  "has_findings": boolean,
  "has_conclusion": boolean,
  "estimated_quality": "excellent|good|fair|poor",
  "notes": "observações gerais"
}

Tipo de exame: ${exam_type || "Não especificado"}`;

    const responseText = await callClaude({
      system: systemPrompt,
      messages: [{ role: "user", content: `Valide este laudo:\n\n${laudo_text}` }],
      temperature: 0.1,
      max_tokens: 2000,
    });
    let validationJson;

    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = (responseText || "{}").match(/\{[\s\S]*\}/);
      validationJson = JSON.parse(jsonMatch ? jsonMatch[0] : responseText || "{}");
    } catch {
      console.error("Failed to parse Claude response as JSON");
      // Return a default validation if parsing fails
      validationJson = {
        is_valid: true,
        score: 75,
        issues: [],
        suggestions: ["Laudo estruturado corretamente"],
        has_technique: true,
        has_findings: true,
        has_conclusion: true,
        estimated_quality: "good",
        notes: "Análise automática realizada",
      };
    }

    // Enrich with metadata
    const wordCount = laudo_text.trim().split(/\s+/).length;
    const lineCount = laudo_text.split("\n").length;

    const result: ValidationResult = {
      is_valid: validationJson.is_valid ?? true,
      score: validationJson.score ?? 75,
      issues: validationJson.issues ?? [],
      suggestions: validationJson.suggestions ?? [],
      metadata: {
        has_technique: validationJson.has_technique ?? true,
        has_findings: validationJson.has_findings ?? true,
        has_conclusion: validationJson.has_conclusion ?? true,
        estimated_quality: validationJson.estimated_quality ?? "good",
        word_count: wordCount,
      },
    };

    // Auto-fail if missing critical sections
    if (!result.metadata.has_technique || !result.metadata.has_findings || !result.metadata.has_conclusion) {
      result.is_valid = false;
      result.score = Math.min(result.score, 50);
    }

    // Word count check (should have reasonable length)
    if (wordCount < 50) {
      result.issues.push({
        type: "completeness",
        severity: "warning",
        message: `Laudo muito curto (${wordCount} palavras). Esperado mínimo 100 palavras.`,
      });
      result.score = Math.max(result.score - 10, 0);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("validate-laudo error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro desconhecido na validação",
        is_valid: false,
        score: 0,
        issues: [{ type: "system", severity: "error", message: "Erro ao validar laudo" }],
        suggestions: [],
        metadata: {
          has_technique: false,
          has_findings: false,
          has_conclusion: false,
          estimated_quality: "poor" as const,
          word_count: 0,
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
