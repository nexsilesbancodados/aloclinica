import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isInternalOrService } from '../_shared/auth.ts'

const TABLES = ['profiles','doctor_profiles','appointments','prescriptions','exam_requests','exam_reports','medical_records','subscriptions','doctor_payouts']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // SECURITY: só cron/serviço interno. Antes: dump público de PII de todos os pacientes.
  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await supabase.storage.createBucket('backups', { public: false }).catch(() => {})
    const date = new Date().toISOString().slice(0, 10)
    const summary: Record<string, number> = {}
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select('*').limit(50000)
      if (error) { summary[t] = -1; continue }
      const json = JSON.stringify(data || [])
      const path = `${date}/${t}.json`
      await supabase.storage.from('backups').upload(path, new Blob([json], { type: 'application/json' }), { upsert: true })
      summary[t] = (data || []).length
    }
    await supabase.from('activity_logs').insert({
      action: 'daily_backup_run', entity_type: 'system', details: { date, summary },
    })
    return new Response(JSON.stringify({ ok: true, date, summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})