import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { prescription_id } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Autorização ──────────────────────────────────────────────────────────
    // Sem isto, qualquer um obtinha a receita (nome+CPF+diagnóstico+medicação) de
    // qualquer paciente por um prescription_id. O chamador tem de ser o médico ou
    // o paciente da receita. verify_jwt não basta (a anon key é um JWT válido).
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await authed.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: rx, error } = await supabase.from('prescriptions').select('*').eq('id', prescription_id).maybeSingle()
    if (error || !rx) throw new Error('Prescription not found')

    const { data: patient } = await supabase.from('profiles').select('first_name,last_name,cpf').eq('user_id', rx.patient_id).maybeSingle()
    const { data: doctor } = await supabase.from('doctor_profiles').select('crm,crm_state,user_id').eq('id', rx.doctor_id).maybeSingle()

    // Só o médico da receita ou o próprio paciente.
    if (caller.id !== rx.patient_id && doctor?.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: 'Sem permissão para acessar esta receita.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: doctorProfile } = doctor ? await supabase.from('profiles').select('first_name,last_name').eq('user_id', doctor.user_id).maybeSingle() : { data: null }

    const code = rx.verification_code || crypto.randomUUID().slice(0, 8).toUpperCase()
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prescription_id + code))
    const sigHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595, 842])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    let y = 800
    const draw = (t: string, f = font, s = 11) => { page.drawText(t, { x: 50, y, size: s, font: f, color: rgb(0.1, 0.1, 0.2) }); y -= s + 6 }

    draw('RECEITUÁRIO MÉDICO', bold, 16); y -= 6
    draw(`Dr(a). ${doctorProfile?.first_name || ''} ${doctorProfile?.last_name || ''} — CRM ${doctor?.crm || ''}/${doctor?.crm_state || ''}`, bold)
    y -= 8
    draw(`Paciente: ${patient?.first_name || ''} ${patient?.last_name || ''}`)
    if (patient?.cpf) draw(`CPF: ${patient.cpf}`)
    if (rx.diagnosis) draw(`Diagnóstico: ${rx.diagnosis}`)
    y -= 10
    draw('Medicamentos:', bold, 13)
    const meds = Array.isArray(rx.medications) ? rx.medications : []
    meds.forEach((m: any, i: number) => {
      draw(`${i + 1}. ${m.name || ''} ${m.dosage || ''}`)
      if (m.posology) draw(`   ${m.posology}`)
    })
    if (rx.instructions) { y -= 8; draw('Instruções:', bold); draw(rx.instructions) }
    y = 100
    draw(`Assinatura digital: ${sigHash}`, font, 9)
    draw(`Código de verificação: ${code}`, font, 9)
    draw(`Verifique em: aloclinica.com.br/verify/${code}`, font, 9)

    const bytes = await pdf.save()
    const path = `${rx.patient_id}/${prescription_id}.pdf`
    await supabase.storage.from('prescriptions').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
    const { data: pub } = supabase.storage.from('prescriptions').getPublicUrl(path)

    await supabase.from('prescriptions').update({
      pdf_url: pub.publicUrl, is_signed: true, signature_hash: sigHash,
      signed_at: new Date().toISOString(), verification_code: code,
    }).eq('id', prescription_id)

    await supabase.from('document_verifications').upsert({
      verification_code: code, document_type: 'prescription',
      document_id: prescription_id, is_valid: true,
      patient_name: `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim(),
      doctor_name: `${doctorProfile?.first_name || ''} ${doctorProfile?.last_name || ''}`.trim(),
      doctor_crm: `${doctor?.crm || ''}/${doctor?.crm_state || ''}`,
      verified_at: new Date().toISOString(),
    }, { onConflict: 'verification_code' })

    return new Response(JSON.stringify({ ok: true, url: pub.publicUrl, code }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})