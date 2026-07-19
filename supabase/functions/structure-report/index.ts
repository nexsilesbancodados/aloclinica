import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { getCaller, isInternalOrService, checkRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(mode: string, exam_type: string, clinical_info: string): string {
  if (mode === "structure") {
    return `Você é um radiologista assistente especializado em laudos médicos brasileiros.

Sua tarefa é receber uma transcrição bruta de voz de um médico laudista e transformá-la em um laudo médico estruturado e profissional.

FORMATO OBRIGATÓRIO DO LAUDO:
**TÉCNICA:**
[Descrição da técnica utilizada]

**ACHADOS:**
[Achados detalhados, organizados por sistema/região anatômica]

**IMPRESSÃO DIAGNÓSTICA:**
[Conclusão objetiva dos achados]

REGRAS:
1. Corrija erros de transcrição e terminologia médica
2. Use terminologia radiológica padrão (BIRADS, TIRADS, Fleischner, etc. quando aplicável)
3. Organize os achados de forma lógica por região anatômica
4. Mantenha as medidas e valores citados pelo médico
5. Adicione "Sem alterações" para estruturas normais mencionadas
6. Use linguagem técnica formal (terceira pessoa, tempo presente)
7. NÃO invente achados que o médico não mencionou
8. Tipo de exame: ${exam_type || "Não especificado"}
${clinical_info ? `9. Informações clínicas do paciente: ${clinical_info}` : ""}`;
  }

  if (mode === "improve") {
    return `Você é um assistente de redação médica radiológica. Melhore o texto do laudo abaixo:
- Corrija erros gramaticais e de terminologia
- Melhore a clareza e a objetividade
- Mantenha a estrutura existente
- NÃO altere os achados clínicos
- NÃO invente informações novas
- Tipo de exame: ${exam_type || "Não especificado"}`;
  }

  if (mode === "suggest_conclusion") {
    return `Você é um radiologista assistente. Com base nos achados descritos abaixo, sugira uma IMPRESSÃO DIAGNÓSTICA concisa e profissional.
- Use terminologia radiológica padrão
- Seja objetivo e direto
- Liste os achados mais relevantes primeiro
- Inclua classificações padronizadas quando aplicável (BIRADS, TIRADS, etc.)
- Tipo de exame: ${exam_type || "Não especificado"}
${clinical_info ? `- Contexto clínico: ${clinical_info}` : ""}`;
  }

  if (mode === "differential") {
    return `Você é um radiologista assistente. Com base nos achados do laudo abaixo, liste os diagnósticos diferenciais mais relevantes em ordem de probabilidade.
- Use terminologia médica padrão
- Cite a classificação de cada entidade quando aplicável
- Inclua breve justificativa para cada diferencial
- Tipo de exame: ${exam_type || "Não especificado"}
${clinical_info ? `- Contexto clínico: ${clinical_info}` : ""}`;
  }

  if (mode === "checklist") {
    return `Você é um revisor de laudos radiológicos. Analise o laudo abaixo e verifique se todos os itens essenciais foram abordados para o tipo de exame "${exam_type || "não especificado"}".

Retorne uma checklist no formato:
✅ Item abordado adequadamente
⚠️ Item incompleto ou que merece mais detalhes
❌ Item não mencionado (mas deveria estar)

Inclua:
- Técnica descrita?
- Todas as estruturas anatômicas pertinentes avaliadas?
- Medidas relevantes incluídas?
- Classificações padronizadas aplicadas?
- Conclusão presente e consistente com achados?
- Recomendações de acompanhamento quando indicado?`;
  }

  throw new Error("Modo inválido. Use: structure, improve, suggest_conclusion, differential ou checklist");
}

async function callAI(systemPrompt: string, userText: string) {
  try {
    return await callClaude({
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
      temperature: 0.2,
      max_tokens: 3000,
    });
  } catch (err: any) {
    if (err?.status === 429) throw { status: 429, message: "Rate limited" };
    throw err;
  }
}

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
      const allowed = await checkRateLimit(`user:${caller.user.id}`, "structure-report", 20, 1, { failClosed: true });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }

    const { raw_text, exam_type, clinical_info, mode } = await req.json();

    if (!raw_text?.trim()) {
      return new Response(JSON.stringify({ error: "Texto vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof raw_text === "string" && raw_text.length > 8000) {
      return new Response(JSON.stringify({ error: "input muito grande" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(mode || "structure", exam_type || "", clinical_info || "");

    const structured = await callAI(systemPrompt, raw_text);

    return new Response(JSON.stringify({ structured_text: structured }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("structure-report error:", error);
    const status = typeof error === "object" && error !== null && "status" in error ? (error as { status: number }).status : 500;
    const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? (error as { message: string }).message : "Erro desconhecido";

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
