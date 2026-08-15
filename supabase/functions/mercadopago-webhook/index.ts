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

    // Validação de assinatura OBRIGATÓRIA — fail closed se o secret não estiver
    // configurado, caso contrário um atacante forja "pagamento aprovado".
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (!secret) {
      console.error("[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET não configurado — rejeitando");
      return new Response(JSON.stringify({ error: "webhook not configured" }), {
        status: 503,
        headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
      });
    }
    const valid = await validateSignature(req, rawBody, body, secret);
    if (!valid) {
      console.warn("[mp-webhook] assinatura inválida");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
      });
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

/**
 * O resultado de cada escrita era descartado. Como a função devolvia 200 de
 * qualquer forma, uma falha de banco (coluna ausente, RLS, indisponibilidade)
 * ficava invisível E a MP não reenviava a notificação: o pagamento existia só
 * do lado da MP e a consulta seguia como não paga, sem nenhum registro.
 *
 * `critical` marca as escritas que decidem se o paciente tem atendimento pago.
 * Nelas o erro é propagado para o handler, que devolve 500 e faz a MP reenviar
 * — a atualização é idempotente, então reprocessar é seguro.
 *
 * As escritas no ledger (`payment_transactions`) ficam deliberadamente NÃO
 * críticas: o schema dessa tabela foi restaurado fora do versionamento e não é
 * verificável a partir deste repositório. Se as colunas divergirem, o efeito é
 * um erro em log — e não todo webhook em 500 com a MP reenviando para sempre.
 */
function checkWrite(step: string, error: unknown, critical = false): void {
  if (!error) return;
  const message = (error as { message?: string })?.message ?? String(error);
  console.error(`[mp-webhook] ${step} falhou:`, message);
  if (critical) throw new Error(`${step}: ${message}`);
}

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
  const { error: txError } = await admin
    .from("payment_transactions")
    .update({
      status: internalStatus,
      raw_response: res.data,
    } as any)
    .eq("mp_payment_id", paymentId);
  checkWrite("update payment_transactions", txError);

  if (!externalRef) return;

  // Routing por reference
  if (externalRef.startsWith("appointment_")) {
    const apptId = externalRef.replace("appointment_", "");
    if (internalStatus === "approved") {
      const { error: apptError } = await admin
        .from("appointments")
        .update({ payment_status: "approved", payment_confirmed_at: now } as any)
        .eq("id", apptId);
      checkWrite("marcar appointment como paga", apptError, true);

      // Notificação e recibo são acessórios: falhar aqui não pode desfazer o
      // pagamento já confirmado acima nem provocar reenvio da MP.
      const { error: notifError } = await admin.from("notifications").insert({
        type: "payment",
        title: "Pagamento confirmado",
        message: "Sua consulta está garantida.",
        link: `/dashboard/appointments?role=patient`,
        user_id: await getUserIdFromAppointment(admin, apptId),
      } as any);
      checkWrite("insert notifications", notifError);
      // Dispara recibo + confirmação por e-mail/WhatsApp
      try {
        await admin.functions.invoke("appointment-confirmed", {
          body: { appointment_id: apptId },
        });
      } catch (e) {
        console.error("[mp-webhook] falha ao enviar recibo", e);
      }
    } else if (internalStatus === "refused" || internalStatus === "cancelled") {
      const { error: refusedError } = await admin
        .from("appointments")
        .update({ payment_status: "refused" } as any)
        .eq("id", apptId);
      checkWrite("marcar appointment como recusada", refusedError, true);
    }
  } else if (externalRef.startsWith("queue_")) {
    const qId = externalRef.replace("queue_", "");
    const { error: queueError } = await admin
      .from("on_demand_queue")
      .update({ payment_status: internalStatus, paid_at: internalStatus === "approved" ? now : null } as any)
      .eq("id", qId);
    checkWrite("atualizar on_demand_queue", queueError, true);
  } else if (externalRef.startsWith("renewal_")) {
    const rId = externalRef.replace("renewal_", "");
    const { error: renewalError } = await admin
      .from("prescription_renewals")
      .update({ status: internalStatus === "approved" ? "paid" : internalStatus, paid_at: internalStatus === "approved" ? now : null } as any)
      .eq("id", rId);
    checkWrite("atualizar prescription_renewals", renewalError, true);
  }
}

async function handlePreapproval(admin: any, preapprovalId: string) {
  const res = await mpRequest<any>("GET", `/preapproval/${preapprovalId}`);
  if (!res.ok) {
    console.error("[mp-webhook] falha ao buscar preapproval", preapprovalId, res.data);
    return;
  }

  const mpStatus = res.data.status as string; // pending | authorized | paused | cancelled
  const internalStatus =
    mpStatus === "authorized" ? "active" :
    mpStatus === "paused" ? "paused" :
    mpStatus === "cancelled" ? "cancelled" :
    "pending";

  const { error: subError } = await admin
    .from("subscriptions")
    .update({
      status: internalStatus,
    } as any)
    .eq("mp_preapproval_id", preapprovalId);
  checkWrite("atualizar status da subscription", subError, true);
}

async function handleAuthorizedPayment(admin: any, authPaymentId: string) {
  // authorized_payment é a cobrança recorrente disparada pela MP
  const res = await mpRequest<any>("GET", `/authorized_payments/${authPaymentId}`);
  if (!res.ok) {
    console.error("[mp-webhook] falha ao buscar authorized_payment", authPaymentId, res.data);
    return;
  }

  const preapprovalId = res.data.preapproval_id;
  if (!preapprovalId) return;

  const mpStatus = res.data.status;
  const internalStatus = mapMpStatus(mpStatus);

  // Busca sub
  const { data: sub, error: subLookupError } = await admin
    .from("subscriptions")
    .select("id, user_id")
    .eq("mp_preapproval_id", preapprovalId)
    .single();

  if (!sub) {
    console.error(
      "[mp-webhook] subscription não encontrada para preapproval",
      preapprovalId,
      subLookupError?.message ?? "",
    );
    return;
  }

  // UPSERT idempotente: MP reenvia mesma notificação várias vezes (retry).
  // UNIQUE em mp_payment_id garante que não duplica linha.
  const { error: ledgerError } = await admin.from("payment_transactions").upsert({
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
  checkWrite("upsert payment_transactions (recorrência)", ledgerError);
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
  if (!dataId) return false; // sem data.id não dá pra validar → rejeita (fail closed)

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
