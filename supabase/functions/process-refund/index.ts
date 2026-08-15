/**
 * process-refund
 *
 * Internal refund handler — called by SQL functions (e.g. fn_handle_doctor_no_show)
 * via public.invoke_edge_function. Authenticated by service role.
 *
 * Body: { appointment_id: string, reason?: string, refund_type?: 'full' | 'partial', amount_cents?: number }
 *
 * Looks up the latest paid payment_transactions row linked to the appointment
 * and triggers a Mercado Pago refund via the MP API directly (bypassing the
 * user-scoped mercadopago-refund function so it can run from cron/triggers).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest } from "../_shared/mercadopago.ts";
import { getCaller, safeEqual } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Authorization ──
    // This endpoint triggers REAL Mercado Pago refunds. It is called by SQL
    // triggers/cron via invoke_edge_function (which sets x-internal-secret) OR
    // by an authenticated admin. Anonymous callers are rejected.
    const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    const internalAuthorized = !!INTERNAL_SECRET && safeEqual(providedSecret, INTERNAL_SECRET);

    if (!internalAuthorized) {
      const caller = await getCaller(req);
      if (!caller.user || !caller.isAdmin) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId: string | undefined = body.appointment_id ?? body.appointmentId;
    const reason: string = body.reason ?? "system_refund";
    const refundType: "full" | "partial" = body.refund_type === "partial" ? "partial" : "full";
    const requestedAmountCents: number | undefined = body.amount_cents;

    if (!appointmentId) {
      return json({ error: "appointment_id obrigatório" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find latest successful transaction for this appointment
    const { data: tx, error: txErr } = await admin
      .from("payment_transactions")
      .select("*")
      .eq("resource_type", "appointment")
      .eq("resource_id", appointmentId)
      .in("status", ["paid", "approved", "confirmed", "received"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (txErr) return json({ error: txErr.message }, 500);
    if (!tx) {
      console.warn("[process-refund] No paid transaction for appointment", appointmentId);
      return json({ ok: false, skipped: true, reason: "no_transaction" }, 200);
    }

    if (!tx.mp_payment_id) {
      return json({ error: "Transação sem mp_payment_id — não é possível estornar via MP" }, 422);
    }

    const refundAmountCents =
      refundType === "full"
        ? tx.amount_cents
        : Math.min(requestedAmountCents ?? tx.amount_cents, tx.amount_cents);

    // Build MP refund body. If refund_type=full, omit amount for total refund.
    const mpBody: Record<string, unknown> = {};
    if (refundType === "partial") {
      mpBody.amount = Number((refundAmountCents / 100).toFixed(2));
    }

    const mpRes = await mpRequest(
      "POST",
      `/v1/payments/${tx.mp_payment_id}/refunds`,
      Object.keys(mpBody).length ? mpBody : undefined,
      { idempotencyKey: `refund-${appointmentId}-${Date.now()}` },
    );

    if (!mpRes.ok) {
      console.error("[process-refund] MP refund failed", mpRes.status, mpRes.data);
      await admin.from("activity_logs").insert({
        action: "refund_failed",
        entity_type: "appointment",
        entity_id: appointmentId,
        details: { reason, mp_status: mpRes.status, mp_error: mpRes.data },
      });
      return json({ error: "MP refund failed", mp: mpRes.data }, 502);
    }

    // Update transaction
    await admin
      .from("payment_transactions")
      .update({
        status: refundType === "full" ? "refunded" : "partial_refund",
        raw_response: {
          ...(tx.raw_response ?? {}),
          refund: mpRes.data,
          refund_amount_cents: refundAmountCents,
          refund_reason: reason,
        },
      })
      .eq("id", tx.id);

    // Update appointment
    await admin
      .from("appointments")
      .update({
        payment_status: refundType === "full" ? "refunded" : "partially_refunded",
      })
      .eq("id", appointmentId);

    // Activity log
    await admin.from("activity_logs").insert({
      action: "refund_processed",
      entity_type: "appointment",
      entity_id: appointmentId,
      user_id: tx.user_id,
      details: { reason, amount_cents: refundAmountCents, mp_refund_id: (mpRes.data as any)?.id },
    });

    return json({ ok: true, refund_amount_cents: refundAmountCents, mp_refund: mpRes.data });
  } catch (e) {
    console.error("[process-refund] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
