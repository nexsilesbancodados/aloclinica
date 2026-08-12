import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendPrescriptionRequest {
  appointment_id: string;
  doctor_name: string;
  patient_name: string;
  medications: { name: string; dosage?: string; frequency?: string }[];
  diagnosis?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub as string;

    const body: SendPrescriptionRequest = await req.json();
    const { appointment_id, doctor_name, patient_name, medications, diagnosis } = body;

    // Input validation
    if (!appointment_id || typeof appointment_id !== "string" || appointment_id.length > 50) {
      return new Response(JSON.stringify({ error: "Invalid appointment_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch appointment and verify caller is the doctor
    const { data: appt } = await supabase
      .from("appointments")
      .select("patient_id, guest_patient_id, doctor_id")
      .eq("id", appointment_id)
      .single();

    if (!appt) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is the doctor for this appointment
    const { data: docProfile } = await supabase
      .from("doctor_profiles")
      .select("id")
      .eq("user_id", callerId)
      .eq("id", appt.doctor_id)
      .maybeSingle();

    if (!docProfile) {
      return new Response(JSON.stringify({ error: "Not authorized for this appointment" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let email: string | null = null;
    let phone: string | null = null;
    let recipientName = patient_name;

    if (appt.guest_patient_id) {
      const { data: guest } = await supabase
        .from("guest_patients")
        .select("email, phone, full_name")
        .eq("id", appt.guest_patient_id)
        .single();
      if (guest) {
        email = guest.email;
        phone = guest.phone;
        recipientName = guest.full_name;
      }
    }

    if (appt.patient_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, first_name, last_name")
        .eq("user_id", appt.patient_id)
        .single();
      if (profile) {
        phone = profile.phone;
        recipientName = `${profile.first_name} ${profile.last_name}`;
      }
      const { data: authUser } = await supabase.auth.admin.getUserById(appt.patient_id);
      if (authUser?.user?.email) email = authUser.user.email;
    }

    const medList = (medications || [])
      .filter((m) => m && m.name)
      .slice(0, 20) // Limit number of medications
      .map((m, i) => {
        let line = `${i + 1}. *${String(m.name).slice(0, 100)}*`;
        if (m.dosage) line += ` — ${String(m.dosage).slice(0, 100)}`;
        if (m.frequency) line += ` (${String(m.frequency).slice(0, 100)})`;
        return line;
      })
      .join("\n");

    const results: { email?: unknown; whatsapp?: unknown } = {};

    if (email) {
      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            type: "prescription_sent",
            to: email,
            data: {
              patient_name: recipientName,
              doctor_name: String(doctor_name).slice(0, 200),
              medications: medList,
              diagnosis: String(diagnosis || "Não especificado").slice(0, 500),
            },
          }),
        });
        results.email = await emailRes.json();
      } catch (error: any) {
        console.error("Email send error:", error);
        results.email = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (phone) {
      try {
        // A lista de medicamentos VAI na mensagem: é o que o paciente precisa
        // ter à mão na farmácia, e obrigá-lo a abrir a plataforma só para saber
        // o que tomar é atrito sem ganho real de privacidade — ele já sabe o
        // que foi prescrito.
        //
        // O `diagnosis` NÃO vai. É a parte mais sensível (LGPD, Art. 5º, II) e
        // a menos acionável para o paciente naquele momento: não é preciso para
        // comprar o medicamento. O WhatsApp tem exposições que a plataforma
        // autenticada não tem — o gateway Evolution persiste toda mensagem no
        // banco dele (DATABASE_SAVE_DATA_NEW_MESSAGE=true), a prévia aparece na
        // tela bloqueada, e o número pode estar num aparelho compartilhado.
        // O diagnóstico continua disponível na plataforma.
        const whatsappMessage = [
          `🏥 *AloClinica — Receita Médica*`,
          ``,
          `Olá, *${recipientName}*!`,
          ``,
          `O(a) *${doctor_name}* prescreveu:`,
          ``,
          medList,
          ``,
          `Acesse a plataforma para ver a receita completa e baixar o PDF assinado.`,
          ``,
          `_Receita digital emitida pela AloClinica_`,
        ].filter(Boolean).join("\n");

        const whatsRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ phone, message: whatsappMessage }),
        });
        results.whatsapp = await whatsRes.json();
      } catch (error: any) {
        console.error("WhatsApp send error:", error);
        results.whatsapp = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent_to: { email: !!email, whatsapp: !!phone }, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
