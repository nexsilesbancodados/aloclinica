/**
 * mercadopago-save-card
 *
 * Salva cartão no vault MP (atrelado a customer_id do usuário).
 *
 * Body:
 *   { card_token: string, holder_name?: string, is_default?: boolean }
 *
 * Importante: card_token vem do client (Mercado Pago JS SDK).
 * Nunca passar número/CVV pelo backend.
 *
 * Retorna: { saved_card_id, mp_card_id, last4, brand }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest, ensureMpCustomer, mpCorsHeaders } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mpCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { card_token, holder_name, is_default = false } = await req.json();
    if (!card_token) return json({ error: "card_token obrigatório" }, 400);

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, phone, cpf, mp_customer_id")
      .eq("user_id", user.id)
      .single();

    const customerId = await ensureMpCustomer(admin, { id: user.id, email: user.email }, profile);

    // Anexa cartão ao customer
    const addCard = await mpRequest<any>(
      "POST",
      `/v1/customers/${customerId}/cards`,
      { token: card_token }
    );

    if (!addCard.ok) {
      return json({
        error: addCard.data?.message || addCard.data?.cause?.[0]?.description || "Falha ao salvar cartão",
        gateway: addCard.data,
      }, 400);
    }

    const cardData = addCard.data;
    const last4 = cardData.last_four_digits || "0000";
    const brand = (cardData.payment_method?.id || "").toUpperCase() || null;
    const expMonth = String(cardData.expiration_month ?? "").padStart(2, "0");
    const expYear = String(cardData.expiration_year ?? "");

    // Se for default, desmarca os outros
    if (is_default) {
      await admin.from("saved_cards").update({ is_default: false } as any).eq("user_id", user.id);
    }

    // Persiste
    const { data: saved, error: insertErr } = await admin.from("saved_cards").insert({
      user_id: user.id,
      gateway: "mercadopago",
      mp_card_id: cardData.id,
      mp_customer_id: customerId,
      last4,
      brand,
      holder_name: holder_name || cardData.cardholder?.name || null,
      expiry_month: expMonth,
      expiry_year: expYear,
      is_default,
      status: "active",
    } as any).select("id").single();

    if (insertErr) {
      return json({ error: insertErr.message }, 500);
    }

    return json({
      saved_card_id: saved!.id,
      mp_card_id: cardData.id,
      last4,
      brand,
    });
  } catch (e) {
    console.error("[mp-save-card] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
