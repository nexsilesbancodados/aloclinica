import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { appointment_id, days_off, cid_code, reason } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Autorização ──────────────────────────────────────────────────────────
    // Sem esta checagem, qualquer um emitia atestado assinado sob o CRM de um
    // médico real, com CID e dias de afastamento à escolha. O emissor precisa
    // ser o MÉDICO do próprio atendimento. verify_jwt não basta: a anon key é um
    // JWT válido publicado no bundle.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await authed.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: appt } = await supabase.from('appointments').select('*').eq('id', appointment_id).maybeSingle()
    if (!appt) throw new Error('Appointment not found')
    const { data: patient } = await supabase.from('profiles').select('first_name,last_name,cpf').eq('user_id', appt.patient_id).maybeSingle()
    const { data: doctor } = await supabase.from('doctor_profiles').select('crm,crm_state,user_id').eq('id', appt.doctor_id).maybeSingle()

    // O chamador tem de ser o médico deste atendimento.
    if (!doctor || doctor.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: 'Apenas o médico do atendimento pode emitir este documento.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: dProf } = doctor ? await supabase.from('profiles').select('first_name,last_name').eq('user_id', doctor.user_id).maybeSingle() : { data: null }

    const code = crypto.randomUUID().slice(0, 8).toUpperCase()
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(appointment_id + code))
    const sigHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32)

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595, 842])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    let y = 780
    const draw = (t: string, f = font, s = 11) => { page.drawText(t, { x: 50, y, size: s, font: f, color: rgb(0.1,0.1,0.2) }); y -= s + 8 }

    draw('ATESTADO MÉDICO', bold, 18); y -= 10
    draw(`Atesto, para os devidos fins, que o(a) paciente ${patient?.first_name||''} ${patient?.last_name||''}${patient?.cpf?` (CPF ${patient.cpf})`:''}`, font, 12)
    draw(`esteve sob meus cuidados profissionais em ${new Date().toLocaleDateString('pt-BR')},`, font, 12)
    draw(`necessitando de afastamento de suas atividades por ${days_off} dia(s).`, font, 12)
    if (cid_code) { y -= 6; draw(`CID: ${cid_code}`, font, 11) }
    if (reason) { y -= 6; draw(`Observação: ${reason}`, font, 11) }
    y = 200
    draw(`Dr(a). ${dProf?.first_name||''} ${dProf?.last_name||''}`, bold, 12)
    draw(`CRM ${doctor?.crm||''}/${doctor?.crm_state||''}`, font, 11)
    y -= 30
    draw(`Assinatura digital: ${sigHash}`, font, 9)
    draw(`Código de verificação: ${code}`, font, 9)
    draw(`Verifique em: aloclinica.com.br/verify/${code}`, font, 9)

    const bytes = await pdf.save()
    const path = `${appt.patient_id}/${appointment_id}-${code}.pdf`
    await supabase.storage.from('prescriptions').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
    const { data: pub } = supabase.storage.from('prescriptions').getPublicUrl(path)

    const { data: cert } = await supabase.from('medical_certificates').insert({
      appointment_id, patient_id: appt.patient_id, doctor_id: appt.doctor_id,
      days_off, cid_code, reason, pdf_url: pub.publicUrl,
      verification_code: code, signature_hash: sigHash, signed_at: new Date().toISOString(),
    }).select().maybeSingle()

    await supabase.from('document_verifications').upsert({
      verification_code: code, document_type: 'certificate', document_id: cert?.id,
      is_valid: true,
      patient_name: `${patient?.first_name||''} ${patient?.last_name||''}`.trim(),
      doctor_name: `${dProf?.first_name||''} ${dProf?.last_name||''}`.trim(),
      doctor_crm: `${doctor?.crm||''}/${doctor?.crm_state||''}`,
      verified_at: new Date().toISOString(),
    }, { onConflict: 'verification_code' })

    await supabase.from('notifications').insert({
      user_id: appt.patient_id, title: '📄 Atestado médico disponível',
      message: `${days_off} dia(s) de afastamento.`, type: 'document',
      link: pub.publicUrl,
    })

    return new Response(JSON.stringify({ ok: true, url: pub.publicUrl, code }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})