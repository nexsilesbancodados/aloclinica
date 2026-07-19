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
  // SECURITY: só cron/serviço interno (antes: amplificador de spam disparável por qualquer um).
  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    // Find appointments with pending_payment older than 20 minutes
    const threshold = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

    const { data: abandoned } = await supabase
      .from("appointments")
      .select("id, scheduled_at, patient_id, guest_patient_id, doctor_id, payment_status, created_at")
      .eq("payment_status", "pending")
      .in("status", ["scheduled"])
      .lt("created_at", threshold);

    if (!abandoned || abandoned.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No abandoned carts found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const appt of abandoned) {
      const scheduledAt = new Date(appt.scheduled_at);
      const dateStr = scheduledAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const timeStr = scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      // Get patient info (registered or guest)
      let patientName = "Paciente";
      let patientEmail = "";
      let patientPhone = "";

      if (appt.patient_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone")
          .eq("user_id", appt.patient_id)
          .single();
        if (profile) {
          patientName = `${profile.first_name} ${profile.last_name}`.trim();
          patientPhone = profile.phone ?? "";
        }
        const { data: authUser } = await supabase.auth.admin.getUserById(appt.patient_id);
        patientEmail = authUser?.user?.email ?? "";
      } else if (appt.guest_patient_id) {
        const { data: guest } = await supabase
          .from("guest_patients")
          .select("full_name, email, phone")
          .eq("id", appt.guest_patient_id)
          .single();
        if (guest) {
          patientName = guest.full_name;
          patientEmail = guest.email;
          patientPhone = guest.phone;
        }
      }

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

      // Send email reminder
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
                date: dateStr,
                time: timeStr,
                time_until: "pagamento pendente",
                subject: "⏳ Seu agendamento está quase lá!",
                custom_message: `Vimos que você não concluiu o pagamento do seu agendamento na AloClinica com ${drName} em ${dateStr} às ${timeStr}. O horário ainda está reservado por mais 10 minutos. Precisa de ajuda?`,
              },
            }),
          });
          sent++;
        } catch (error: any) {
          console.error(`Email failed for ${appt.id}:`, error);
        }
      }

      // Send WhatsApp reminder
      if (patientPhone) {
        try {
          const msg = `⏳ *AloClinica - Pagamento Pendente*\n\nOlá ${patientName},\nVimos que não concluiu o pagamento do seu agendamento com ${drName}.\n\n📅 ${dateStr} às ${timeStr}\n\nO horário ainda está reservado por mais 10 minutos. Precisa de ajuda? 💚\n\nAcesse: https://allo-medico-care.lovable.app`;
          await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
              "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
            },
            body: JSON.stringify({ phone: patientPhone, message: msg }),
          });
        } catch (error: any) {
          console.error(`WhatsApp failed for ${appt.id}:`, error);
        }
      }

      // Create in-app notification
      if (appt.patient_id) {
        await supabase.from("notifications").insert({
          user_id: appt.patient_id,
          title: "Pagamento Pendente",
          message: `Seu agendamento com ${drName} em ${dateStr} às ${timeStr} aguarda pagamento. Complete agora!`,
          type: "payment",
          link: "/dashboard",
        });
      }
    }

    console.info(`Cart abandonment: processed ${abandoned.length}, sent ${sent} reminders`);
    return new Response(JSON.stringify({ processed: abandoned.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Cart abandonment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
