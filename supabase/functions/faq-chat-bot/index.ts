import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getCaller, isInternalOrService, checkRateLimit } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    // Authorize + rate-limit to curb LLM cost abuse. Internal/service calls
    // bypass; everyone else must be an authenticated user. Fail closed.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req)
      if (!caller.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const allowed = await checkRateLimit(`user:${caller.user.id}`, 'faq-chat-bot', 30, 1, { failClosed: true })
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } })
      }
    }

    const { question } = await req.json()
    if (!question || typeof question !== 'string') {
      return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (question.length > 8000) {
      return new Response(JSON.stringify({ error: 'input muito grande' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: faqs } = await supabase.from('faq_items').select('question, answer').eq('is_active', true).limit(50)
    const ctx = (faqs || []).map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: `Você é o assistente da Aloclinica. Responda APENAS com base nas FAQs abaixo. Se não souber, diga "Vou abrir um ticket de suporte para você". Seja breve e gentil.\n\nFAQs:\n${ctx}` },
          { role: 'user', content: question },
        ],
      }),
    })
    const data = await r.json()
    const answer = data?.choices?.[0]?.message?.content || 'Desculpe, tente novamente.'
    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})