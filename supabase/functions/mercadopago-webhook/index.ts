/**
 * mercadopago-webhook
 *
 * Recebe notificações do Mercado Pago. Tipos relevantes:
 *   - payment              → /v1/payments/{id}
 *   - subscription_preapproval → /preapproval/{id}
 *   - subscription_authorized_payment → cobrança recorrente
 *
 * Configurar URL no painel MP:
 *   https://<projeto>.functions.supabase.co/mercadopago-webhook
 *
 * Validação de assinatura (opcional mas recomendado):
 *   Header `x-signature: ts=<ts>,v1=<hmac>`
 *   Header `x-request-id`
 *   Manifest: `id:<dataId>;request-id:<reqId>;ts:<ts>;`
 *   HMAC-SHA256 com secret de webhook (MERCADOPAGO_WEBHOOK_SECRET)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest, mpCorsHeaders, mapMpStatus } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mpCorsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};

    // Valida assinatura se secret configurado
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (secret) {
      const valid = await validateSignature(req, rawBody, body, secret);
      if (!valid) {
        console.warn("[mp-webhook] assinatura inválida");
        return new Response(JSON.stringify({ error: "invalid signature" }), {
          status: 401,
          headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const type = body.type || body.action?.split(".")?.[0];
    const dataId = body.data?.id || body.resource;

    if (!type || !dataId) {
      return new Response(JSON.stringify({ ok: true, reason: "no-op" }), {
        headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "payment" || type === "payment.created" || type === "payment.updated") {
      await handlePayment(admin, String(dataId));
    } else if (type === "subscription_preapproval" || type === "preapproval") {
      await handlePreapproval(admin, String(dataId));
    } else if (type === "subscription_authorized_payment" || type === "authorized_payment") {
      await handleAuthorizedPayment(admin, String(dataId));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mp-webhook] error:", e);
    // MP reenvia se retornar não-2xx — pra erros transientes
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handlePayment(admin: any, paymentId: string) {
  const res = await mpRequest<any>("GET", `/v1/payments/${paymentId}`);
  if (!res.ok) {
    console.error("[mp-webhook] falha ao buscar payment", paymentId, res.data);
    return;
  }

  const mpStatus = res.data.status;
  const internalStatus = mapMpStatus(mpStatus);
  const externalRef = res.data.external_reference as string | null;
  const now = new Date().toISOString();

  // Atualiza transaction
  await admin
    .from("payment_transactions")
    .update({
      status: internalStatus,
      paid_at: internalStatus === "approved" ? now : null,
      raw_response: res.data,
    } as any)
    .eq("mp_payment_id", paymentId);

  if (!externalRef) return;

  // Routing por reference
  if (externalRef.startsWith("appointment_")) {
    const apptId = externalRef.replace("appointment_", "");
    if (internalStatus === "approved") {
      await admin
        .from("appointments")
        .update({ payment_status: "approved", payment_confirmed_at: now } as any)
        .eq("id", apptId);
      await admin.from("notifications").insert({
        // Buscar user_id da appointment
        type: "payment",
        title: "Pagamento confirmado",
        message: "Sua consulta está garantida.",
        link: `/dashboard/appointments?role=patient`,
        user_id: await getUserIdFromAppointment(admin, apptId),
      } as any);
    } else if (internalStatus === "refused" || internalStatus === "cancelled") {
      await admin
        .from("appointments")
        .update({ payment_status: "refused" } as any)
        .eq("id", apptId);
    }
  } else if (externalRef.startsWith("queue_")) {
    const qId = externalRef.replace("queue_", "");
    await admin
      .from("on_demand_queue")
      .update({ payment_status: internalStatus, paid_at: internalStatus === "approved" ? now : null } as any)
      .eq("id", qId);
  } else if (externalRef.startsWith("renewal_")) {
    const rId = externalRef.replace("renewal_", "");
    await admin
      .from("prescription_renewals")
      .update({ status: internalStatus === "approved" ? "paid" : internalStatus, paid_at: internalStatus === "approved" ? now : null } as any)
      .eq("id", rId);
  } else if (externalRef.startsWith("sub_")) {
    const sId = externalRef.replace("sub_", "");
    await admin
      .from("subscriptions")
      .update({
        last_charge_at: now,
        last_charge_status: internalStatus,
        retry_count: internalStatus === "approved" ? 0 : undefined,
      } as any)
      .eq("id", sId);
  }
}

async function handlePreapproval(admin: any, preapprovalId: string) {
  const res = await mpRequest<any>("GET", `/preapproval/${preapprovalId}`);
  if (!res.ok) return;

  const mpStatus = res.data.status as string; // pending | authorized | paused | cancelled
  const internalStatus =
    mpStatus === "authorized" ? "active" :
    mpStatus === "paused" ? "paused" :
    mpStatus === "cancelled" ? "cancelled" :
    "pending";

  await admin
    .from("subscriptions")
    .update({
      status: internalStatus,
      metadata: res.data,
    } as any)
    .eq("mp_preapproval_id", preapprovalId);
}

async function handleAuthorizedPayment(admin: any, authPaymentId: string) {
  // authorized_payment é a cobrança recorrente disparada pela MP
  const res = await mpRequest<any>("GET", `/authorized_payments/${authPaymentId}`);
  if (!res.ok) return;

  const preapprovalId = res.data.preapproval_id;
  if (!preapprovalId) return;

  const mpStatus = res.data.status;
  const internalStatus = mapMpStatus(mpStatus);

  // Busca sub
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, amount_cents")
    .eq("mp_preapproval_id", preapprovalId)
    .single();
  if (!sub) return;

  // UPSERT idempotente: MP reenvia mesma notificação várias vezes (retry).
  // UNIQUE em mp_payment_id garante que não duplica linha.
  await admin.from("payment_transactions").upsert({
    user_id: sub.user_id,
    gateway: "mercadopago",
    mp_payment_id: String(res.data.payment?.id ?? authPaymentId),
    mp_preapproval_id: preapprovalId,
    amount_cents: Math.round(Number(res.data.transaction_amount) * 100),
    currency: "BRL",
    payment_method: "RECURRING",
    status: internalStatus,
    resource_id: sub.id,
    resource_type: "subscription",
    raw_response: res.data,
  } as any, { onConflict: "mp_payment_id" });

  await admin
    .from("subscriptions")
    .update({
      last_charge_at: new Date().toISOString(),
      last_charge_status: internalStatus,
    } as any)
    .eq("id", sub.id);
}

async function getUserIdFromAppointment(admin: any, apptId: string): Promise<string | null> {
  const { data } = await admin.from("appointments").select("patient_id").eq("id", apptId).single();
  return data?.patient_id ?? null;
}

async function validateSignature(req: Request, _rawBody: string, body: any, secret: string): Promise<boolean> {
  const sig = req.headers.get("x-signature");
  const reqId = req.headers.get("x-request-id");
  if (!sig || !reqId) return false;
  const parts = sig.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.trim().split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId = body?.data?.id;
  if (!dataId) return true; // sem data.id não dá pra validar

  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === v1;
}
