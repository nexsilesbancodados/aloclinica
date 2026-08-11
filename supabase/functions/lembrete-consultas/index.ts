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

  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find appointments starting in ~1h (between 55 and 65 minutes from now)
    const now = new Date();
    const from = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id, scheduled_at, lembrete_enviado")
      .in("status", ["confirmed", "scheduled"])
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .eq("lembrete_enviado", false);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];

    for (const appt of appointments || []) {
      // Lock atômico: evita lembretes duplicados na janela 1h para esta consulta
      const { error: lockErr } = await supabase
        .from("appointment_reminder_log")
        .insert({ appointment_id: appt.id, window_label: "1h", channel: "whatsapp" });
      if (lockErr) {
        results.push(`${appt.id}: skipped (duplicate window 1h) - ${lockErr.message}`);
        continue;
      }

      // Get doctor name
      const { data: docProfile } = await supabase
        .from("doctor_profiles")
        .select("user_id")
        .eq("id", appt.doctor_id)
        .single();

      let doctorName = "Médico";
      if (docProfile) {
        const { data: docP } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", docProfile.user_id)
          .single();
        if (docP) doctorName = `${docP.first_name} ${docP.last_name}`;
      }

      const scheduledDate = new Date(appt.scheduled_at);
      const hora = scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

      // Send reminder to patient
      if (appt.patient_id) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-notify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
              "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
            },
            body: JSON.stringify({
              tipo: "lembrete_1h",
              user_id: appt.patient_id,
              dados: { nome_medico: doctorName, hora, appointment_id: appt.id },
            }),
          });
          results.push(`${appt.id}: sent`);
        } catch (err: any) {
          results.push(`${appt.id}: error - ${err}`);
        }
      }

      // Mark as sent
      await supabase
        .from("appointments")
        .update({ lembrete_enviado: true })
        .eq("id", appt.id);
    }

    return new Response(
      JSON.stringify({ success: true, processed: appointments?.length || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("lembrete-consultas error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
