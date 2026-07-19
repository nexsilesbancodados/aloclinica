import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalOrService, getCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // SECURITY: bloqueia anônimos. Aceita cron/serviço interno OU usuário autenticado
  // (é chamada tanto por cron quanto pelo fluxo de confirmação no app).
  if (!isInternalOrService(req)) {
    const caller = await getCaller(req);
    if (!caller.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const { appointment_id, resend_only } = await req.json();
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: "appointment_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get appointment details
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select("id, scheduled_at, patient_id, doctor_id, status, price_at_booking, payment_status, payment_method, payment_id, payment_confirmed_at")
      .eq("id", appointment_id)
      .single();

    if (apptErr || !appt) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get patient profile
    const { data: patient } = appt.patient_id
      ? await supabase.from("profiles").select("first_name, last_name, phone, cpf, user_id").eq("user_id", appt.patient_id).single()
      : { data: null };

    // Get doctor profile
    const { data: doctorProfile } = await supabase
      .from("doctor_profiles").select("user_id, crm, crm_state").eq("id", appt.doctor_id).single();

    const { data: doctorName } = doctorProfile
      ? await supabase.from("profiles").select("first_name, last_name, phone").eq("user_id", doctorProfile.user_id).single()
      : { data: null };

    // Get patient email
    let patientEmail = "";
    if (appt.patient_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(appt.patient_id);
      patientEmail = authUser?.user?.email ?? "";
    }

    const scheduledDate = new Date(appt.scheduled_at);
    const dateStr = scheduledDate.toLocaleDateString("pt-BR");
    const timeStr = scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";
    const drName = doctorName ? `Dr(a). ${doctorName.first_name} ${doctorName.last_name}` : "Médico";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "https://aloclinica.com.br";
    const receiptUrl = `${appBaseUrl}/dashboard/appointments/${appt.id}/recibo`;
    const roomLink = `${appBaseUrl}/dashboard/consultation/${appt.id}`;
    const amountBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(Number(appt.price_at_booking ?? 0));
    const issuedAt = new Date(appt.payment_confirmed_at ?? Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const isPaid = ["approved", "confirmed", "received", "paid"].includes(String(appt.payment_status));

    const results: string[] = [];

    // 1. Send email via send-email edge function (Resend)
    if (patientEmail) {
      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({
            type: "appointment_confirmation",
            to: patientEmail,
            data: { patient_name: patientName, doctor_name: drName, date: dateStr, time: timeStr, room_link: roomLink },
          }),
        });
        const emailBody = await emailRes.text();
        results.push(`email: ${emailRes.ok ? "sent" : "failed"} ${emailBody}`);
      } catch (error: any) {
        results.push(`email: error - ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // 1b. Send payment receipt email (only if payment was approved and not resend_only)
    if (!resend_only && patientEmail && isPaid && Number(appt.price_at_booking ?? 0) > 0) {
      try {
        const receiptRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({
            type: "payment_receipt",
            to: patientEmail,
            data: {
              patient_name: patientName,
              patient_cpf: patient?.cpf ?? "",
              doctor_name: drName,
              doctor_crm: doctorProfile?.crm ? `${doctorProfile.crm_state ?? ""} ${doctorProfile.crm}`.trim() : "",
              date: dateStr,
              time: timeStr,
              amount: amountBRL,
              payment_method: appt.payment_method ?? "Cartão / Pix",
              payment_id: appt.payment_id ?? "",
              receipt_number: String(appt.id).slice(0, 8).toUpperCase(),
              issued_at: issuedAt,
              appointment_id: appt.id,
              receipt_url: receiptUrl,
            },
          }),
        });
        results.push(`receipt_email: ${receiptRes.ok ? "sent" : "failed"}`);
      } catch (error: any) {
        results.push(`receipt_email: error - ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // 2. Send WhatsApp via Evolution API (skip on resend_only)
    if (!resend_only && patient?.phone) {
      try {
        const receiptBlock = isPaid && Number(appt.price_at_booking ?? 0) > 0
          ? `\n\n🧾 *Recibo de pagamento:* ${receiptUrl}\nValor: ${amountBRL} · Nº ${String(appt.id).slice(0, 8).toUpperCase()}`
          : "";
        const msg = `✅ *Consulta Confirmada!*\n\nOlá ${patientName},\nSua consulta com ${drName} foi confirmada.\n\n📅 Data: ${dateStr}\n⏰ Horário: ${timeStr}\n\n📹 *Entrar na sala:* ${roomLink}${receiptBlock}\n\n_Você precisa estar logado(a) na AloClínica. Acesse 5 min antes._ 🏥`;
        const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({ phone: patient.phone, message: msg }),
        });
        results.push(`whatsapp: ${waRes.ok ? "sent" : "failed"}`);
      } catch (error: any) {
        results.push(`whatsapp: error - ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // 2b. Mensagem dedicada com link do recibo (somente se pago) — facilita encaminhamento ao plano de saúde (skip on resend_only)
    if (!resend_only && patient?.phone && isPaid && Number(appt.price_at_booking ?? 0) > 0) {
      try {
        const receiptMsg = `🧾 *Recibo AloClínica*\n\nOlá ${patientName}, seu pagamento foi confirmado.\n\nValor: *${amountBRL}*\nNº do recibo: *${String(appt.id).slice(0, 8).toUpperCase()}*\nEmitido em: ${issuedAt}\n\n📄 Acessar e baixar:\n${receiptUrl}\n\n_Login obrigatório. Use este recibo para reembolso junto ao seu plano de saúde._`;
        const waReceiptRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({ phone: patient.phone, message: receiptMsg }),
        });
        results.push(`whatsapp_receipt: ${waReceiptRes.ok ? "sent" : "failed"}`);
      } catch (error: any) {
        results.push(`whatsapp_receipt: error - ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // 3. Create in-app notification (skip on resend_only)
    if (!resend_only && appt.patient_id) {
      await supabase.from("notifications").insert({
        user_id: appt.patient_id,
        title: "Consulta Confirmada",
        message: `Sua consulta com ${drName} em ${dateStr} às ${timeStr} foi confirmada.`,
        type: "appointment",
        link: "/dashboard",
      });
      results.push("notification: created");
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
