/**
 * no-show-reminder-tick — disparada por pg_cron a cada hora.
 *
 * Busca appointments dentro da janela de 22h–26h (próximas 24h, ±2h),
 * computa risco heurístico no servidor e, se for médio/alto, envia
 * lembrete EXTRA via WhatsApp (whatsapp-notify) e push.
 *
 * Idempotente: marca em appointments.lembrete_enviado para não duplicar.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_MS = 86_400_000;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}

interface Appt {
  id: string;
  patient_id: string | null;
  scheduled_at: string;
  payment_status: string | null;
  created_at: string;
  lembrete_enviado: boolean | null;
}

async function computeRisk(sb: any, appt: Appt) {
  const since = new Date(Date.now() - 365 * DAY_MS).toISOString();
  const { data: hist } = await sb.from("appointments").select("status")
    .eq("patient_id", appt.patient_id)
    .lt("scheduled_at", appt.scheduled_at)
    .gte("scheduled_at", since)
    .neq("id", appt.id).limit(40);
  const total = (hist ?? []).length;
  const ns = (hist ?? []).filter((a: any) => a.status === "no_show").length;
  const rate = total > 0 ? ns / total : 0;

  const leadDays = (new Date(appt.scheduled_at).getTime() - new Date(appt.created_at).getTime()) / DAY_MS;
  const pending = ["pending", "failed", "expired", null, "", undefined].includes(appt.payment_status as any);
  const h = new Date(appt.scheduled_at).getHours();
  const offHour = h < 8 || h >= 20;

  let score = rate * 0.4;
  if (leadDays > 14) score += 0.2;
  if (pending) score += 0.2;
  if (offHour) score += 0.1;
  score = Math.min(1, Math.max(0, score));
  const band = score >= 0.6 ? "alto" : score >= 0.3 ? "medio" : "baixo";
  return { score, band, reasons: { rate, leadDays, pending, offHour } };
}

Deno.serve(async (req) => {
  try {
    const expected = Deno.env.get("AUTO_PAYOUT_TICK_SECRET"); // reaproveita o mesmo secret de cron
    if (!expected || req.headers.get("x-tick-secret") !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const now = new Date();
    const start = new Date(now.getTime() + 22 * 3600_000);
    const end   = new Date(now.getTime() + 26 * 3600_000);

    const { data: appts, error: aErr } = await sb.from("appointments")
      .select("id, patient_id, scheduled_at, payment_status, created_at, lembrete_enviado")
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .in("status", ["scheduled", "waiting"])
      .neq("lembrete_enviado", true);
    if (aErr) throw aErr;

    let sent = 0;
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const a of (appts ?? []) as Appt[]) {
      if (!a.patient_id) { skipped.push({ id: a.id, reason: "no_patient" }); continue; }
      const risk = await computeRisk(sb, a);
      if (risk.band === "baixo") { skipped.push({ id: a.id, reason: "low_risk" }); continue; }

      // WhatsApp via whatsapp-notify
      try {
        await fetch(`${supaUrl}/functions/v1/whatsapp-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anon}`,
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({
            tipo: "lembrete_1h",
            user_id: a.patient_id,
            dados: { appointment_id: a.id },
          }),
        });
      } catch (e) { console.warn("WhatsApp falhou:", e); }

      // Push via send-push-notification
      try {
        await fetch(`${supaUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
          body: JSON.stringify({
            user_id: a.patient_id,
            title: "📅 Sua consulta é amanhã",
            message: risk.band === "alto"
              ? "Falta menos de 24h — confirme presença ou reagende com 2h de antecedência para evitar taxa de no-show."
              : "Lembrete amigável: consulta agendada nas próximas 24h.",
            link: `/dashboard/appointments/${a.id}`,
          }),
        });
      } catch (e) { console.warn("Push falhou:", e); }

      await sb.from("appointments").update({ lembrete_enviado: true } as any).eq("id", a.id);
      sent++;
    }

    return json({ ok: true, ran_at: now.toISOString(), sent, skipped_count: skipped.length });
  } catch (e: any) {
    console.error("no-show-reminder-tick error:", e?.message);
    return json({ error: e?.message ?? "internal" }, 500);
  }
});
