import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamClaudeAsOpenAI, DEFAULT_CLAUDE_MODEL } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function checkRateLimit(identifier: string, endpoint: string, maxReqs: number, windowMin: number): Promise<boolean> {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - windowMin * 60000).toISOString();
    const { count } = await sb.from("rate_limits").select("id", { count: "exact", head: true })
      .eq("identifier", identifier).eq("endpoint", endpoint).gte("window_start", since);
    if ((count ?? 0) >= maxReqs) return false;
    await sb.from("rate_limits").insert({ identifier, endpoint, window_start: new Date().toISOString() });
    return true;
  } catch { return true; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context, ticket_id, user_id } = await req.json();

    // Rate limit: 20 messages per 5 minutes per IP
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = await checkRateLimit(clientIP, "pingo-chat", 20, 5);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Muitas mensagens! Aguarde um momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const systemContent = `Você é o Pingo 🐧, o simpático pinguim assistente virtual da plataforma AloClinica. Sua função é realizar a teletriagem e suporte administrativo, seguindo estritamente as resoluções do CFM (2.314/2022) e a LGPD.

DIRETRIZES DE COMPORTAMENTO:

1. NÃO DÊ DIAGNÓSTICOS: Você nunca deve dizer ao paciente o que ele tem. Use termos como "seus sintomas sugerem a necessidade de avaliação médica" ou "recomendo agendar uma consulta para avaliação profissional".

2. NÃO PRESCREVA: É proibido sugerir dosagens, nomes de medicamentos ou tratamentos. Sempre oriente a agendar uma consulta com um médico.

3. TRIAGEM DE EMERGÊNCIA: Se o paciente relatar dor no peito, falta de ar grave, perda de consciência, sangramento intenso, sinais de AVC (dificuldade para falar, fraqueza em um lado do corpo) ou reação alérgica grave, instrua IMEDIATAMENTE:
"🚨 ATENÇÃO: Seus sintomas requerem atendimento URGENTE. Por favor, procure a UPA ou Hospital mais próximo ou ligue para o SAMU (192). Não aguarde uma teleconsulta."

4. TRANSFERÊNCIA PARA HUMANO: Se o usuário pedir para "falar com alguém", "suporte humano", "atendente", "pessoa real" ou demonstrar frustração repetida, responda EXATAMENTE:
"[TRANSFERINDO] Um de nossos atendentes assumirá este chat em instantes. Aguarde um momento. 🎧"
E encerre sua resposta.

5. LGPD: Não peça senhas, dados bancários ou dados sensíveis fora do contexto da triagem. Não armazene nem repita CPF ou dados pessoais na conversa.

6. TRIAGEM INTELIGENTE: Quando o paciente descrever sintomas, faça perguntas de esclarecimento antes de sugerir uma especialidade:
   - Há quanto tempo tem esse sintoma?
   - Qual a intensidade (leve, moderada ou forte)?
   - Já fez algum tratamento?
   Depois sugira a especialidade mais adequada e ofereça agendamento.

7. FORMATAÇÃO: Use **negrito** para destaque, listas com "•" para múltiplos itens e emojis com moderação. Seja conciso (máximo 4-5 frases).

PERSONALIDADE:
- Amigável, acolhedor e profissional
- Usa emojis com moderação para ser simpático
- Responde sempre em português brasileiro
- Faz analogias fofas com pinguins quando apropriado
- Seja breve e objetivo

CONHECIMENTO DA PLATAFORMA:
- AloClinica é uma plataforma de telemedicina com consultas por vídeo
- Oferece consultas agendadas (com cadastro) e consultas avulsas (sem cadastro, via checkout de convidado)
- Especialidades: Cardiologia, Neurologia, Ortopedia, Pediatria, Clínico Geral, Dermatologia, Endocrinologia
- Plano mensal disponível para consultas ilimitadas
- Pronto-atendimento 24h com fila inteligente (médico de plantão)
- Renovação de receitas online (sem nova consulta)
- Receitas digitais com assinatura eletrônica
- Dados protegidos com criptografia (LGPD compliant)
- Atendimento com vídeo em HD
- Contato: contato@aloclinica.com.br

FLUXOS DE NAVEGAÇÃO:
- Para agendar: /teleconsulta ou botão "Agendar Consulta"
- Para pronto-atendimento: /teleconsulta (aba "Pronto-atendimento")
- Para renovar receita: Dashboard do paciente > "Renovar Receita"
- Para ver receitas: Dashboard do paciente > "Prescrições"
- Para empresas: /empresas

OBJETIVO: Ajude o paciente a agendar consultas, tirar dúvidas sobre a plataforma, testar câmera/microfone e entender como acessar receitas médicas. Se o paciente tiver dúvidas sobre sintomas, conduza uma mini-triagem e sugira a especialidade ideal.
${context ? `\n--- CONTEXTO DO PACIENTE LOGADO ---\n${context}\n---\nUse essas informações para personalizar suas respostas. Se o paciente perguntar sobre suas consultas, use os dados acima.` : ""}`;

    let sseResponse: Response;
    try {
      sseResponse = await streamClaudeAsOpenAI({
        model: DEFAULT_CLAUDE_MODEL,
        system: systemContent,
        messages,
        temperature: 0.3,
        max_tokens: 800,
      });
    } catch (err: any) {
      if (err?.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas mensagens! Aguarde um momento e tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Anthropic error:", err);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI Triage: analyze the last user message for urgency keywords
    if (ticket_id && user_id) {
      const lastUserMsg = messages.filter((m: { role: string; content?: string }) => m.role === "user").pop()?.content?.toLowerCase() ?? "";
      const highPriorityKeywords = [
        "urgente", "emergência", "emergencia", "dor forte", "dor intensa", "sangramento",
        "desmaio", "desmaiou", "falta de ar", "peito", "avc", "convulsão", "convulsao",
        "inconsciente", "morrer", "morrendo", "suicídio", "suicidio"
      ];
      const mediumPriorityKeywords = [
        "pagamento", "pagar", "cobrado", "cobrança", "reembolso", "cancelar",
        "não consigo", "erro", "problema", "bug", "travou", "não funciona"
      ];

      let detectedPriority: string | null = null;
      if (highPriorityKeywords.some(kw => lastUserMsg.includes(kw))) {
        detectedPriority = "high";
      } else if (mediumPriorityKeywords.some(kw => lastUserMsg.includes(kw))) {
        detectedPriority = "medium";
      }

      if (detectedPriority) {
        try {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );

          await supabase
            .from("support_tickets")
            .update({ priority: detectedPriority })
            .eq("id", ticket_id);

          if (detectedPriority === "high") {
            await supabase
              .from("support_tickets")
              .update({ status: "waiting_human", priority: "high" })
              .eq("id", ticket_id);

            const { data: supportUsers } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("role", ["admin", "support"]);

            if (supportUsers) {
              for (const su of supportUsers) {
                await supabase.from("notifications").insert({
                  user_id: su.user_id,
                  title: "🚨 Ticket Alta Prioridade",
                  message: `Paciente reportou: "${lastUserMsg.substring(0, 80)}..."`,
                  type: "urgent",
                  link: "/dashboard/support",
                });
              }
            }
          }

          console.info(`Triage: ticket ${ticket_id} => priority: ${detectedPriority}`);
        } catch (triageErr) {
          console.error("Triage error:", triageErr);
        }
      }
    }

    return sseResponse;
  } catch (error: any) {
    console.error("chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
