import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // SECURITY: só cron/serviço interno (antes: qualquer anônimo disparava e-mails).
  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find prescriptions expiring in 7 days or less
    const today = new Date();
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: expiringPrescriptions } = await supabase
      .from("ophthalmology_prescriptions")
      .select("id, patient_id, expiry_date, doctor:doctor_id(full_name)")
      .lte("expiry_date", sevenDaysFromNow.toISOString().split("T")[0])
      .gt("expiry_date", today.toISOString().split("T")[0])
      .eq("notified", false);

    if (!expiringPrescriptions || expiringPrescriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let notified = 0;

    for (const prescription of expiringPrescriptions as any[]) {
      const daysUntilExpiry = Math.ceil(
        (new Date(prescription.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const doctorName = Array.isArray(prescription.doctor)
        ? prescription.doctor[0]?.full_name
        : prescription.doctor?.full_name;

      // Insert notification
      await supabase.from("notifications").insert({
        user_id: prescription.patient_id,
        title: "Prescrição Oftalmológica em Vencimento",
        message: `Sua prescrição vence em ${daysUntilExpiry} dia(s). Solicite uma nova consulta com ${doctorName || "seu oftalmologista"} para renovar.`,
        type: "warning",
        link: `/meu-perfil/exames-oftalmologicos`,
      });

      // Mark as notified
      await supabase
        .from("ophthalmology_prescriptions")
        .update({ notified: true })
        .eq("id", prescription.id);

      notified++;
    }

    // Send emails (non-blocking)
    try {
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

      for (const prescription of expiringPrescriptions as any[]) {
        const { data: user } = await supabase.auth.admin.getUserById(prescription.patient_id);
        if (user?.user?.email) {
          const drName = Array.isArray(prescription.doctor)
            ? prescription.doctor[0]?.full_name
            : prescription.doctor?.full_name;
          fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              type: "prescription_expiring",
              to: user.user.email,
              data: {
                doctor_name: drName || "Oftalmologista",
                expiry_date: new Date(prescription.expiry_date).toLocaleDateString("pt-BR"),
              },
            }),
          }).catch((e) => console.warn("Email failed:", e));
        }
      }
    } catch (e: any) {
      console.warn("Email send failed:", e);
    }

    return new Response(
      JSON.stringify({ success: true, notified }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
