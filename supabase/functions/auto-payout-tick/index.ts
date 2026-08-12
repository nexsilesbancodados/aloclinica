/**
 * auto-payout-tick — disparada diariamente pelo pg_cron.
 *
 * Para cada médico com `doctor_profiles.payout_frequency` definido,
 * verifica se HOJE é o "dia de repasse" (diário: D+1 útil; semanal:
 * segunda; mensal: dia 5). Se for, e o saldo disponível ≥ R$ 50,
 * cria um `withdrawal_requests` (pending) que o financeiro ou um
 * worker do Mercado Pago Marketplace processa.
 *
 * Auth: header `x-tick-secret` deve bater com AUTO_PAYOUT_TICK_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/auth.ts";

const MIN_WITHDRAWAL = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Hoje é o dia de repasse para essa frequência (BRT)? */
function isPayoutDay(freq: "daily" | "weekly" | "monthly", now: Date): boolean {
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dow = brtNow.getUTCDay();
  if (freq === "daily") return dow >= 1 && dow <= 5; // seg–sex (D+1 útil)
  if (freq === "weekly") return dow === 1;            // segunda-feira
  if (freq === "monthly") return brtNow.getUTCDate() === 5;
  return false;
}

Deno.serve(async (req) => {
  try {
    const expected = Deno.env.get("AUTO_PAYOUT_TICK_SECRET");
    if (!safeEqual(req.headers.get("x-tick-secret"), expected)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const { data: docs, error: docsErr } = await sb
      .from("doctor_profiles")
      .select("id, user_id, payout_frequency, pix_key")
      .eq("is_active", true)
      .not("payout_frequency", "is", null);
    if (docsErr) throw docsErr;

    let createdCount = 0;
    const created: Array<{ doctor_user_id: string; amount: number }> = [];
    const skipped: Array<{ doctor_user_id: string; reason: string }> = [];

    for (const d of docs ?? []) {
      const freq = (d as any).payout_frequency as "daily" | "weekly" | "monthly" | null;
      if (!freq || !isPayoutDay(freq, now)) continue;
      const userId = (d as any).user_id as string;

      // Evita duplicidade no mesmo dia
      const startToday = new Date(now); startToday.setUTCHours(0, 0, 0, 0);
      const { count: todayCount } = await sb
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startToday.toISOString());
      if ((todayCount ?? 0) > 0) {
        skipped.push({ doctor_user_id: userId, reason: "already_requested_today" });
        continue;
      }

      // Saldo: soma das wallet_transactions menos saques pendentes/aprovados
      const { data: tx } = await sb.from("wallet_transactions").select("amount").eq("user_id", userId);
      const credit = (tx ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const { data: pendApr } = await sb.from("withdrawal_requests")
        .select("amount").eq("user_id", userId).in("status", ["pending", "approved", "processing"]);
      const blocked = (pendApr ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const available = Math.max(0, credit - blocked);

      if (available < MIN_WITHDRAWAL) {
        skipped.push({ doctor_user_id: userId, reason: `below_min (R$ ${available.toFixed(2)})` });
        continue;
      }

      const { error: insErr } = await sb.from("withdrawal_requests").insert({
        user_id: userId,
        amount: available,
        status: "pending",
        pix_key: (d as any).pix_key ?? null,
      } as any);
      if (insErr) {
        skipped.push({ doctor_user_id: userId, reason: `insert_failed: ${insErr.message}` });
        continue;
      }

      createdCount++;
      created.push({ doctor_user_id: userId, amount: available });
    }

    return json({
      ok: true,
      ran_at: now.toISOString(),
      created: createdCount,
      created_details: created,
      skipped_count: skipped.length,
      skipped_sample: skipped.slice(0, 10),
    });
  } catch (e: any) {
    console.error("auto-payout-tick error:", e?.message);
    return json({ error: e?.message ?? "internal" }, 500);
  }
});
