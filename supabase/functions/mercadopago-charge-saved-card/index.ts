/**
 * mercadopago-charge-saved-card
 *
 * Cobra um cartão salvo no vault MP. Usado por:
 *   - Cron diário de assinaturas recorrentes (legacy path; preferir preapproval)
 *   - Checkout com cartão salvo escolhido
 *
 * Body:
 *   {
 *     saved_card_id: string,    // UUID em saved_cards
 *     amount: number,           // reais
 *     reference_id: string,
 *     description?: string,
 *     security_code?: string,   // opcional — exigido em algumas categorias
 *     installments?: number
 *   }
 *
 * Diferença pra create-payment(saved_card): este endpoint pode ser chamado
 * por service-role (cron) sem usuário autenticado, passando user_id no body.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest, mpCorsHeaders, mapMpStatus } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mpCorsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pode ser invocado via service-role (cron) ou via user auth
    const authHeader = req.headers.get("Authorization");
    let resolvedUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ") && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      resolvedUserId = user?.id ?? null;
    }

    const body = await req.json();
    const {
      saved_card_id,
      amount,
      reference_id,
      description,
      security_code,
      installments = 1,
      user_id: bodyUserId,  // opcional, usado quando chamado por cron
      coupon_code,
    } = body;

    if (!saved_card_id) return json({ error: "saved_card_id obrigatório" }, 400);
    if (!reference_id) return json({ error: "reference_id obrigatório" }, 400);

    // Resolve user_id (do auth ou do body se for service-role)
    const userId = resolvedUserId || bodyUserId;
    if (!userId) return json({ error: "user_id não resolvido" }, 401);

    // SECURITY: valor autoritativo calculado no servidor (preço do médico − cupom).
    // sub_ (recorrência via cron) retorna null → mantém o amount informado.
    const authoritative = await computeAuthoritativeAmount(admin, reference_id, coupon_code);
    if (authoritative.notFound) return json({ error: "Recurso da cobrança não encontrado" }, 404);
    if (authoritative.error) return json({ error: authoritative.error }, 400);
    const chargeAmount = authoritative.amount ?? Number(amount);
    if (!chargeAmount || chargeAmount <= 0) return json({ error: "Não foi possível determinar o valor da cobrança" }, 400);

    // Busca cartão
    const { data: card } = await admin
      .from("saved_cards")
      .select("mp_card_id, mp_customer_id, brand, last4")
      .eq("id", saved_card_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (!card?.mp_card_id || !card.mp_customer_id) {
      return json({ error: "Cartão não encontrado ou inativo" }, 404);
    }

    // Tokeniza o cartão salvo (necessário pra cobrar)
    const tokenPayload: Record<string, any> = { card_id: card.mp_card_id };
    if (security_code) tokenPayload.security_code = security_code;

    const tk = await mpRequest<{ id: string; error?: string; message?: string }>(
      "POST",
      "/v1/card_tokens",
      tokenPayload
    );
    if (!tk.ok || !tk.data.id) {
      return json({ error: tk.data?.message || "Falha ao tokenizar cartão salvo", gateway: tk.data }, 400);
    }

    // Busca payer info
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, cpf")
      .eq("user_id", userId)
      .single();
    const { data: { user: userInfo } } = await admin.auth.admin.getUserById(userId);

    const payment = await mpRequest<any>(
      "POST",
      "/v1/payments",
      {
        transaction_amount: chargeAmount,
        token: tk.data.id,
        installments,
        description: description || `AloClínica — ${reference_id}`,
        external_reference: reference_id,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        payer: {
          type: "customer",
          id: card.mp_customer_id,
          email: userInfo?.email,
          identification: profile?.cpf ? { type: "CPF", number: profile.cpf.replace(/\D/g, "") } : undefined,
        },
      },
      { idempotencyKey: `${userId}-${reference_id}-${Math.floor(Date.now() / 60000)}` }
    );

    if (!payment.ok) {
      return json({
        error: payment.data?.message || payment.data?.cause?.[0]?.description || "Falha na cobrança",
        gateway: payment.data,
      }, 400);
    }

    const status = mapMpStatus(payment.data.status);

    // Persiste transação
    await admin.from("payment_transactions").upsert({
      user_id: userId,
      gateway: "mercadopago",
      mp_payment_id: String(payment.data.id),
      amount_cents: Math.round(chargeAmount * 100),
      currency: "BRL",
      payment_method: "SAVED_CARD",
      status,
      saved_card_id,
      resource_id: extractResourceId(reference_id),
      resource_type: extractResourceType(reference_id),
      paid_at: status === "approved" ? new Date().toISOString() : null,
      raw_response: payment.data,
    } as any, { onConflict: "mp_payment_id" });

    return json({
      payment_id: String(payment.data.id),
      status,
      gateway_status: payment.data.status,
      message: status === "refused" ? (payment.data.status_detail || "Recusado") : undefined,
    });
  } catch (e) {
    console.error("[mp-charge-saved-card] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

const RENEWAL_PRICE_BRL = 80; // preço fixo da renovação de receita (espelha o front)

/** Valor autoritativo (preço do médico − cupom validado no servidor). Ver create-payment. */
async function computeAuthoritativeAmount(
  admin: ReturnType<typeof createClient>,
  reference_id: string,
  coupon_code: unknown,
): Promise<{ amount: number | null; notFound?: boolean; error?: string }> {
  if (reference_id.startsWith("appointment_")) {
    const id = reference_id.replace("appointment_", "");
    const { data: appt } = await admin.from("appointments").select("doctor_id").eq("id", id).maybeSingle();
    if (!appt) return { amount: null, notFound: true };
    const { data: doc } = await admin.from("doctor_profiles").select("consultation_price").eq("id", appt.doctor_id).maybeSingle();
    const base = doc?.consultation_price != null ? Number(doc.consultation_price) : null;
    if (base == null || base <= 0) return { amount: null, error: "Preço do médico não configurado" };
    const pct = await resolveCouponPercent(admin, coupon_code);
    return { amount: Math.round(base * (1 - pct / 100) * 100) / 100 };
  }
  if (reference_id.startsWith("renewal_")) return { amount: RENEWAL_PRICE_BRL };
  return { amount: null };
}

async function resolveCouponPercent(
  admin: ReturnType<typeof createClient>,
  code: unknown,
): Promise<number> {
  if (!code || typeof code !== "string") return 0;
  const { data } = await admin.from("coupons")
    .select("discount_percentage, max_uses, times_used, expires_at, is_active")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (!data || data.is_active !== true) return 0;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 0;
  if (data.max_uses != null && Number(data.times_used ?? 0) >= Number(data.max_uses)) return 0;
  const pct = Number(data.discount_percentage) || 0;
  return pct > 0 && pct <= 100 ? pct : 0;
}

function extractResourceId(reference: string): string {
  const idx = reference.indexOf("_");
  return idx === -1 ? reference : reference.slice(idx + 1);
}
function extractResourceType(reference: string): string {
  if (reference.startsWith("appointment_")) return "appointment";
  if (reference.startsWith("queue_")) return "urgent_queue";
  if (reference.startsWith("renewal_")) return "prescription_renewal";
  if (reference.startsWith("sub_")) return "subscription";
  return "other";
}
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
