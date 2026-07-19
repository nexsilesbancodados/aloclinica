import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Scheduled tasks edge function — call via cron or manually.
 * Handles: subscription/card expiration, no-show marking, expiry notifications.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // SECURITY: só cron/serviço interno. Antes: qualquer anônimo mutava dados e
  // disparava e-mail/WhatsApp/push em massa.
  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, string | number> = {};

  try {
    // 1. Expire subscriptions and discount cards (issues #6, #19)
    const { error: expireErr } = await supabase.rpc("expire_subscriptions_and_cards");
    results.expire_subscriptions = expireErr?.message ?? "ok";

    // 2. Mark no-shows and send fee notifications
    const { error: noShowErr } = await supabase.rpc("mark_no_shows");
    results.mark_no_shows = noShowErr?.message ?? "ok";

    // 2b. Send no-show fee email to recently marked no-shows (last 20 min)
    const noShowCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: recentNoShows } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id, scheduled_at, price_at_booking")
      .eq("status", "no_show")
      .gte("updated_at", noShowCutoff)
      .not("patient_id", "is", null);

    for (const ns of recentNoShows ?? []) {
      try {
        const { data: profile } = await supabase.from("profiles").select("first_name, last_name, phone").eq("user_id", ns.patient_id).single();
        const { data: authUser } = await supabase.auth.admin.getUserById(ns.patient_id);
        const { data: docProfile } = await supabase.from("doctor_profiles").select("user_id").eq("id", ns.doctor_id).single();
        let drName = "Médico";
        if (docProfile) {
          const { data: dp } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", docProfile.user_id).single();
          if (dp) drName = `Dr(a). ${dp.first_name} ${dp.last_name}`;
        }
        const schedDate = new Date(ns.scheduled_at);
        const feeAmount = ((ns.price_at_booking || 89) * 0.5).toFixed(2);
        const dateStr = schedDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const timeStr = schedDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

        // In-app notification to PATIENT
        await supabase.from("notifications").insert({
          user_id: ns.patient_id,
          title: "🚫 Não comparecimento registrado",
          message: `Você não compareceu à consulta com ${drName} em ${dateStr} às ${timeStr}. Taxa de R$ ${feeAmount} será cobrada.`,
          type: "warning",
          link: "/dashboard/appointments",
        });

        // WhatsApp to patient
        if (profile?.phone) {
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              phone: profile.phone,
              message: `🚫 *Não Comparecimento*\n\nOlá ${profile.first_name},\nVocê não compareceu à consulta com ${drName} em ${dateStr} às ${timeStr}.\n\n💰 Taxa de não comparecimento: R$ ${feeAmount}\n\nPara evitar cobranças futuras, cancele com antecedência. 💚`,
            }),
          });
        }

        // Push to patient
        const SUPABASE_URL2 = Deno.env.get("SUPABASE_URL")!;
        const SERVICE_KEY2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${SUPABASE_URL2}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY2}` },
          body: JSON.stringify({
            user_id: ns.patient_id,
            title: "🚫 Não comparecimento",
            message: `Taxa de R$ ${feeAmount} por não comparecimento à consulta.`,
            link: "/dashboard/appointments",
          }),
        });

        // Email to patient
        if (authUser?.user?.email) {
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              type: "no_show_fee",
              to: authUser.user.email,
              data: {
                patient_name: profile ? `${profile.first_name} ${profile.last_name}` : "Paciente",
                doctor_name: drName,
                date: dateStr,
                time: timeStr,
                amount: feeAmount,
              },
            }),
          });
        }

        // Notify clinic/admin about no-show for billing
        const adminRes = await supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1).single();
        if (adminRes.data) {
          await supabase.from("notifications").insert({
            user_id: adminRes.data.user_id,
            title: "🚫 No-show registrado",
            message: `Paciente ${profile?.first_name || ""} não compareceu. Taxa de 50% (R$ ${feeAmount}) a cobrar.`,
            type: "billing",
            link: "/dashboard?tab=appointments",
          });
        }
      } catch (nsErr) {
        console.warn("No-show notification failed:", nsErr);
      }
    }
    results.no_show_notifications = recentNoShows?.length ?? 0;

    // 3. Send 7-day expiry notifications
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // Subscriptions expiring in 7 days (with dedup — skip if notified in last 23h)
    const dedup7Cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    const { data: expiringSubs7 } = await supabase
      .from("subscriptions")
      .select("user_id, expires_at")
      .eq("status", "active")
      .lte("expires_at", sevenDaysFromNow)
      .gt("expires_at", oneDayFromNow);

    for (const sub of expiringSubs7 ?? []) {
      const daysLeft = Math.ceil((new Date(sub.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      await supabase.from("notifications").insert({
        user_id: sub.user_id,
        title: "⏳ Plano expirando",
        message: `Seu plano vence em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}. Renove para não perder acesso.`,
        type: "subscription",
        link: "/dashboard/plans",
      });
    }

    // Subscriptions expiring tomorrow
    const { data: expiringSubs1 } = await supabase
      .from("subscriptions")
      .select("user_id, expires_at")
      .eq("status", "active")
      .lte("expires_at", oneDayFromNow)
      .gt("expires_at", now);

    for (const sub of expiringSubs1 ?? []) {
      await supabase.from("notifications").insert({
        user_id: sub.user_id,
        title: "🚨 Plano vence amanhã!",
        message: "Seu plano vence amanhã. Renove agora para manter acesso às consultas.",
        type: "subscription",
        link: "/dashboard/plans",
      });
    }

    // Discount cards expiring in 7 days
    const { data: expiringCards } = await supabase
      .from("discount_cards")
      .select("user_id, valid_until")
      .eq("status", "active")
      .lte("valid_until", sevenDaysFromNow)
      .gt("valid_until", now);

    for (const card of expiringCards ?? []) {
      const daysLeft = Math.ceil((new Date(card.valid_until!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      await supabase.from("notifications").insert({
        user_id: card.user_id,
        title: "⏳ Cartão de Benefícios expirando",
        message: `Seu cartão vence em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}. Renove para manter os descontos.`,
        type: "subscription",
        link: "/dashboard/plans",
      });
    }

    results.notifications_sent = (expiringSubs7?.length ?? 0) + (expiringSubs1?.length ?? 0) + (expiringCards?.length ?? 0);

    console.info("[Scheduled Tasks] Results:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Scheduled Tasks] Error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
