import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // SECURITY: só cron/serviço interno (antes: envio em massa disparável por qualquer um).
  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    // Find consultations completed between 1h and 1h10m ago
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneHour10Ago = new Date(now.getTime() - 70 * 60 * 1000).toISOString();

    const { data: completed } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id, scheduled_at, duration_minutes")
      .eq("status", "completed")
      .gte("updated_at", oneHour10Ago)
      .lte("updated_at", oneHourAgo);

    if (!completed || completed.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const appt of completed) {
      if (!appt.patient_id) continue;

      // Check if survey already exists for this appointment
      const { data: existing } = await supabase
        .from("satisfaction_surveys")
        .select("id")
        .eq("appointment_id", appt.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Get patient info
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, phone")
        .eq("user_id", appt.patient_id)
        .single();

      const { data: authUser } = await supabase.auth.admin.getUserById(appt.patient_id);
      const patientEmail = authUser?.user?.email ?? "";
      const patientName = profile?.first_name ?? "Paciente";

      // Get doctor name
      const { data: doctorProfile } = await supabase
        .from("doctor_profiles")
        .select("user_id")
        .eq("id", appt.doctor_id)
        .single();
      let drName = "seu médico";
      if (doctorProfile) {
        const { data: docName } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", doctorProfile.user_id)
          .single();
        if (docName) drName = `Dr(a). ${docName.first_name} ${docName.last_name}`;
      }

      const surveyLink = `https://allo-medico-care.lovable.app/rate/${appt.id}`;

      // Send email
      if (patientEmail) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
              "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
            },
            body: JSON.stringify({
              type: "appointment_reminder",
              to: patientEmail,
              data: {
                patient_name: patientName,
                doctor_name: drName,
                subject: "⭐ Como foi sua consulta na AloClinica?",
                custom_message: `Olá ${patientName}! Sua consulta com ${drName} foi finalizada. Gostaríamos muito de saber como foi sua experiência. Avalie de 1 a 5 estrelas!`,
                time_until: "avaliação",
              },
            }),
          });
          sent++;
        } catch (error: any) {
          console.error(`Survey email failed for ${appt.id}:`, error);
        }
      }

      // Send WhatsApp
      if (profile?.phone) {
        try {
          const msg = `⭐ *AloClinica - Como foi sua consulta?*\n\nOlá ${patientName}!\nSua consulta com ${drName} foi finalizada.\n\nGostaríamos de saber como foi! Avalie em poucos segundos:\n${surveyLink}\n\nSua opinião nos ajuda a melhorar! 💚`;
          await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
              "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
            },
            body: JSON.stringify({ phone: profile.phone, message: msg }),
          });
        } catch (error: any) {
          console.error(`Survey WhatsApp failed for ${appt.id}:`, error);
        }
      }

      // Create in-app notification
      await supabase.from("notifications").insert({
        user_id: appt.patient_id,
        title: "⭐ Avalie sua consulta",
        message: `Como foi sua consulta com ${drName}? Avalie agora!`,
        type: "survey",
        link: `/rate/${appt.id}`,
      });
    }

    console.info(`Post-consultation survey: processed ${completed.length}, sent ${sent}`);
    return new Response(JSON.stringify({ processed: completed.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Post-consultation survey error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
