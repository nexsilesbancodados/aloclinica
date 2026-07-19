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
      const allowed = await checkRateLimit(`user:${caller.user.id}`, 'ai-symptom-triage', 20, 1, { failClosed: true })
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } })
      }
    }

    const { symptoms } = await req.json()
    if (!symptoms || typeof symptoms !== 'string') {
      return new Response(JSON.stringify({ error: 'symptoms required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (symptoms.length > 8000) {
      return new Response(JSON.stringify({ error: 'input muito grande' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const apiKey = Deno.env.get('LOVABLE_API_KEY')!
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é assistente de triagem médica. Dado um sintoma, sugira a especialidade mais adequada (apenas o nome em PT-BR, ex: "Clínico Geral", "Cardiologia", "Dermatologia") e nível de urgência (baixa/media/alta). Responda APENAS JSON: {"specialty":"...","urgency":"...","reason":"..."}' },
          { role: 'user', content: symptoms }
        ]
      })
    })
    const data = await res.json()
    let parsed: any = {}
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content?.replace(/```json|```/g,'').trim() || '{}') } catch {}
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})