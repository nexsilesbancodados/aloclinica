import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * register-signature
 * Registra uma assinatura digital ICP-Brasil concluída no banco canônico.
 * Faz upload do PDF assinado para Storage e cria registro auditável.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Autorização: o chamador precisa ser um médico autenticado OU uma chamada
    // interna/service (server-to-server). A identidade do médico é derivada do
    // PRÓPRIO usuário autenticado — os campos de identidade vindos do body são
    // ignorados/sobrescritos para impedir spoofing de identidade médica.
    const caller = await getCaller(req);
    const internal = isInternalOrService(req);

    let derivedDoctorName: string | null = null;
    let derivedDoctorCrm: string | null = null;
    let derivedDoctorCpf: string | null = null;
    let isDoctor = false;

    if (caller.user) {
      const { data: docProfile } = await supabase
        .from("doctor_profiles")
        .select("crm, crm_state")
        .eq("user_id", caller.user.id)
        .maybeSingle();
      const { data: selfProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name, cpf")
        .eq("user_id", caller.user.id)
        .maybeSingle();

      if (docProfile) {
        isDoctor = true;
        const composed = `${selfProfile?.first_name ?? ""} ${selfProfile?.last_name ?? ""}`.trim();
        // Prefixo "Dr(a)." para casar com o nome já embutido no PDF assinado.
        derivedDoctorName = composed ? `Dr(a). ${composed}` : null;
        derivedDoctorCrm = docProfile.crm_state
          ? `${docProfile.crm ?? ""}/${docProfile.crm_state}`
          : `${docProfile.crm ?? ""}`;
        derivedDoctorCpf = selfProfile?.cpf ?? null;
      }
    }

    if (!isDoctor && !internal) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      document_id,
      document_type,
      related_record_id,
      doctor_name,
      doctor_crm,
      doctor_cpf,
      patient_name,
      document_hash,
      signature_data,
      certificate_alias,
      pdf_base64,
    } = body;

    // Identidade efetiva do médico: para médicos autenticados prioriza SEMPRE os
    // valores derivados do banco (anti-spoofing). O CPF pode ser legitimamente
    // ausente no perfil (o cliente envia fallback), então faz fallback pro body
    // para não bloquear assinaturas válidas. Chamadas internas/service usam o body.
    const effectiveDoctorName = isDoctor ? (derivedDoctorName ?? doctor_name) : doctor_name;
    const effectiveDoctorCrm = isDoctor ? (derivedDoctorCrm ?? doctor_crm) : doctor_crm;
    const effectiveDoctorCpf = isDoctor ? (derivedDoctorCpf ?? doctor_cpf ?? null) : doctor_cpf;
    const effectiveUserId = caller.user?.id ?? null;

    // Validações obrigatórias (cpf NÃO é obrigatório — pode faltar no perfil).
    if (!document_id || !document_type || !effectiveDoctorName || !effectiveDoctorCrm || !document_hash) {
      return new Response(
        JSON.stringify({
          error: "Campos obrigatórios faltando",
          required: ["document_id", "document_type", "doctor_name", "doctor_crm", "document_hash"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload do PDF assinado para Storage (se fornecido)
    let storagePath: string | null = null;
    let publicUrl: string | null = null;

    if (pdf_base64) {
      try {
        const cleanBase64 = pdf_base64.replace(/^data:application\/pdf;base64,/, "");
        const bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));

        storagePath = `signed/${document_type}/${document_id}.pdf`;

        const { error: uploadErr } = await supabase.storage
          .from("prescriptions")
          .upload(storagePath, bytes, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr);
        } else {
          const { data: urlData } = supabase.storage
            .from("prescriptions")
            .getPublicUrl(storagePath);
          publicUrl = urlData?.publicUrl ?? null;
        }
      } catch (e) {
        console.error("PDF upload failed:", e);
      }
    }

    // Registrar assinatura
    const { data: signature, error: sigErr } = await supabase
      .from("digital_signatures")
      .insert({
        document_id,
        document_type,
        related_record_id: related_record_id || null,
        user_id: effectiveUserId,
        doctor_name: effectiveDoctorName,
        doctor_crm: effectiveDoctorCrm,
        doctor_cpf: effectiveDoctorCpf,
        patient_name: patient_name || null,
        document_hash,
        signature_data: signature_data || {},
        certificate_alias: certificate_alias || null,
        provider: "vidaas",
        storage_path: storagePath,
        public_url: publicUrl,
        is_valid: true,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sigErr) {
      // Se já existe, retornar conflito mas não erro
      if (sigErr.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Documento já assinado", document_id }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw sigErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        verification_url: `${new URL(req.url).origin.replace("functions", "")}/validar-receita/${document_id}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("register-signature error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});