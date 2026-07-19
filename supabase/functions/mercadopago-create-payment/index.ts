/**
 * mercadopago-create-payment
 *
 * Cria pagamento avulso no Mercado Pago.
 *
 * Body (cliente envia):
 *   {
 *     amount: number,             // em reais (ex: 89.90)
 *     payment_method: "pix" | "boleto" | "credit_card" | "saved_card",
 *     // Identificadores de domínio (qual coisa estamos cobrando):
 *     reference_id: string,       // "appointment_<uuid>" | "queue_<uuid>" | "renewal_<uuid>" | "sub_<uuid>"
 *     description?: string,
 *
 *     // Para credit_card direto:
 *     card_token?: string,        // gerado client-side via Mercado Pago JS SDK
 *     installments?: number,      // default 1
 *     payment_method_id?: string, // "visa" | "master" | ... (necessário pra cartão)
 *
 *     // Para saved_card (vault):
 *     saved_card_id?: string,     // UUID da tabela saved_cards
 *
 *     // Para boleto:
 *     payer_doc?: { type: "CPF"|"CNPJ", number: string }
 *   }
 *
 * Retorna:
 *   PIX  → { payment_id, status, qr_code, qr_code_base64, ticket_url, expires_at }
 *   BOLETO → { payment_id, status, boleto_url, barcode, expires_at }
 *   CARD → { payment_id, status, message }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest, ensureMpCustomer, mpCorsHeaders, mapMpStatus } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mpCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      amount,
      payment_method,
      reference_id,
      description,
      card_token,
      installments = 1,
      payment_method_id,
      saved_card_id,
      payer_doc,
      coupon_code,
    } = body;

    if (!payment_method) return jsonResponse({ error: "payment_method obrigatório" }, 400);
    if (!reference_id) return jsonResponse({ error: "reference_id obrigatório" }, 400);

    // SECURITY: o VALOR é decidido pelo SERVIDOR (preço real do médico − cupom
    // validado no servidor). O `amount` do corpo NÃO é confiável (evita pagar R$1
    // numa consulta). Ver docs/SEGURANCA_VALOR_PAGAMENTO.md.
    const authoritative = await computeAuthoritativeAmount(admin, reference_id, coupon_code);
    if (authoritative.notFound) return jsonResponse({ error: "Recurso da cobrança não encontrado" }, 404);
    if (authoritative.error) return jsonResponse({ error: authoritative.error }, 400);
    const chargeAmount = authoritative.amount ?? Number(amount);
    if (!chargeAmount || chargeAmount <= 0) {
      return jsonResponse({ error: "Não foi possível determinar o valor da cobrança" }, 400);
    }

    // Busca profile pra montar payer
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, phone, cpf, mp_customer_id")
      .eq("user_id", user.id)
      .single();

    const payerEmail = user.email || "";
    const payerName = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";
    const payerDoc = payer_doc ?? (profile?.cpf ? { type: "CPF", number: profile.cpf.replace(/\D/g, "") } : null);

    if (!payerDoc) {
      return jsonResponse({ error: "CPF obrigatório — preencha seu cadastro antes de pagar" }, 400);
    }

    // Monta payload Mercado Pago
    const mpPayload: Record<string, any> = {
      transaction_amount: chargeAmount,
      description: description || `AloClínica — ${reference_id}`,
      external_reference: reference_id,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      payer: {
        email: payerEmail,
        first_name: profile?.first_name || payerName.split(" ")[0] || "Cliente",
        last_name: profile?.last_name || payerName.split(" ").slice(1).join(" ") || "AloClínica",
        identification: payerDoc,
      },
    };

    // === PIX ===
    if (payment_method === "pix") {
      mpPayload.payment_method_id = "pix";
      mpPayload.date_of_expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    // === BOLETO ===
    else if (payment_method === "boleto") {
      mpPayload.payment_method_id = "bolbradesco";
      mpPayload.date_of_expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      // Boleto exige endereço — usa um genérico se não houver
      mpPayload.payer.address = {
        zip_code: "01310-100",
        street_name: "Av. Paulista",
        street_number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        federal_unit: "SP",
      };
    }
    // === CREDIT CARD (one-shot) ===
    else if (payment_method === "credit_card") {
      if (!card_token) return jsonResponse({ error: "card_token obrigatório para cartão" }, 400);
      mpPayload.token = card_token;
      mpPayload.installments = installments;
      if (payment_method_id) mpPayload.payment_method_id = payment_method_id;
    }
    // === SAVED CARD ===
    else if (payment_method === "saved_card") {
      if (!saved_card_id) return jsonResponse({ error: "saved_card_id obrigatório" }, 400);
      const { data: card } = await admin
        .from("saved_cards")
        .select("mp_card_id, mp_customer_id, brand, last4")
        .eq("id", saved_card_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();
      if (!card?.mp_card_id || !card.mp_customer_id) {
        return jsonResponse({ error: "Cartão salvo não encontrado ou inativo" }, 404);
      }
      // Cobrança via customer + card_id exige tokenizar o cartão salvo
      // Mercado Pago: POST /v1/card_tokens com {card_id, security_code?}
      // Pra recurring sem CVV, usar a opção customer_id+card_id direto em payment
      mpPayload.payer = { type: "customer", id: card.mp_customer_id };
      mpPayload.token = await tokenizeSavedCard(card.mp_card_id);
      mpPayload.installments = installments;
    } else {
      return jsonResponse({ error: `payment_method inválido: ${payment_method}` }, 400);
    }

    // Marketplace split: se o reference é uma consulta e o médico tem conta MP
    // conectada, o pagamento vai DIRETO para a conta dele e descontamos a fee
    // da plataforma. Caso contrário, mantém fluxo legado (recebemos 100%).
    let marketplaceAccessToken: string | undefined;
    if (reference_id.startsWith("appointment_")) {
      const apptId = reference_id.replace("appointment_", "");
      const { data: appt } = await admin.from("appointments")
        .select("doctor_id, price_at_booking")
        .eq("id", apptId).maybeSingle();
      if (appt?.doctor_id) {
        const { data: doc } = await admin.from("doctor_profiles")
          .select("mp_access_token, mp_user_id")
          .eq("id", appt.doctor_id).maybeSingle();
        if (doc?.mp_access_token && doc?.mp_user_id) {
          marketplaceAccessToken = doc.mp_access_token;
          // marketplace_fee é EM REAIS, a fatia da plataforma (10% padrão)
          const platformPercent = Number(Deno.env.get("PLATFORM_FEE_PERCENT") ?? 10);
          mpPayload.marketplace_fee = Math.round(chargeAmount * platformPercent) / 100;
          mpPayload.collector_id = Number(doc.mp_user_id);
        }
      }
    }

    // Idempotency: por reference_id + timestamp arredondado (evita double-charge em retry)
    const idempotencyKey = `${user.id}-${reference_id}-${Math.floor(Date.now() / 60000)}`;

    const mpRes = await mpRequest<any>("POST", "/v1/payments", mpPayload, {
      idempotencyKey,
      accessToken: marketplaceAccessToken,
    });

    if (!mpRes.ok) {
      const errMessage = mpRes.data?.message || mpRes.data?.error || `Mercado Pago ${mpRes.status}`;
      const errCause = mpRes.data?.cause?.[0]?.description;
      return jsonResponse({
        error: errCause || errMessage,
        gateway_status: mpRes.status,
        gateway_response: mpRes.data,
      }, 400);
    }

    const paymentId = String(mpRes.data.id);
    const mpStatus = mpRes.data.status as string;
    const internalStatus = mapMpStatus(mpStatus);

    // Persiste em payment_transactions
    const txPayload: Record<string, any> = {
      user_id: user.id,
      gateway: "mercadopago",
      mp_payment_id: paymentId,
      amount_cents: Math.round(chargeAmount * 100),
      currency: "BRL",
      payment_method: payment_method.toUpperCase(),
      status: internalStatus,
      resource_id: extractResourceId(reference_id),
      resource_type: extractResourceType(reference_id),
      raw_response: mpRes.data,
    };

    if (payment_method === "pix") {
      const poi = mpRes.data.point_of_interaction?.transaction_data;
      txPayload.mp_qr_code = poi?.qr_code ?? null;
      txPayload.mp_qr_code_base64 = poi?.qr_code_base64 ?? null;
    } else if (payment_method === "boleto") {
      txPayload.mp_boleto_url = mpRes.data.transaction_details?.external_resource_url ?? null;
    }

    // UPSERT idempotente: se cliente fizer retry, mp_payment_id é único — vira no-op
    await admin.from("payment_transactions").upsert(txPayload, { onConflict: "mp_payment_id" });

    // Atualiza appointment payment_status pra approved imediato em saved_card aprovado
    if (internalStatus === "approved" && reference_id.startsWith("appointment_")) {
      const apptId = reference_id.replace("appointment_", "");
      await admin
        .from("appointments")
        .update({ payment_status: "approved", payment_confirmed_at: new Date().toISOString() } as any)
        .eq("id", apptId);
    }

    // Monta resposta apropriada por método
    const result: Record<string, any> = {
      payment_id: paymentId,
      status: internalStatus,
      gateway_status: mpStatus,
    };

    if (payment_method === "pix") {
      const poi = mpRes.data.point_of_interaction?.transaction_data;
      result.qr_code = poi?.qr_code;
      result.qr_code_base64 = poi?.qr_code_base64;
      result.ticket_url = poi?.ticket_url;
      result.expires_at = mpRes.data.date_of_expiration;
    } else if (payment_method === "boleto") {
      result.boleto_url = mpRes.data.transaction_details?.external_resource_url;
      result.barcode = mpRes.data.barcode?.content;
      result.expires_at = mpRes.data.date_of_expiration;
    } else if (mpStatus === "rejected") {
      result.message = mpRes.data.status_detail || "Pagamento recusado";
    }

    return jsonResponse(result);
  } catch (e) {
    console.error("[mercadopago-create-payment] error:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});

const RENEWAL_PRICE_BRL = 80; // preço fixo da renovação de receita (espelha o front)

/**
 * Valor AUTORITATIVO da cobrança, calculado no SERVIDOR.
 * - appointment: preço do médico (doctor_profiles.consultation_price) − cupom
 *   validado no servidor. NÃO confia em price_at_booking (escrito pelo cliente).
 * - renewal: R$80 fixo.
 * - queue/sub/outros: sem fonte autoritativa robusta aqui → { amount:null }
 *   (mantém o amount do cliente; ver docs/SEGURANCA_VALOR_PAGAMENTO.md p/ queue).
 *
 * PRODUTO: o único desconto é CUPOM (sem desconto de retorno/indicação). Por isso
 * usamos o preço cheio do médico e ignoramos appointment_type. Se reativar
 * "consulta de retorno", validar a elegibilidade no servidor antes de aplicar 0.5x.
 */
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

/** Valida o cupom NO SERVIDOR e devolve o % de desconto (0 se inválido). */
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

async function tokenizeSavedCard(cardId: string): Promise<string> {
  // Tokeniza cartão salvo pra reuso (sem CVV)
  const tk = await mpRequest<{ id: string; error?: string }>(
    "POST",
    "/v1/card_tokens",
    { card_id: cardId }
  );
  if (!tk.ok || !tk.data.id) {
    throw new Error(`Falha ao tokenizar cartão salvo: ${tk.data.error || JSON.stringify(tk.data)}`);
  }
  return tk.data.id;
}

function extractResourceId(reference: string): string {
  // "appointment_uuid" → "uuid"
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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
