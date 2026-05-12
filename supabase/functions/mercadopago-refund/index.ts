/**
 * mercadopago-refund
 *
 * Estorno (total ou parcial) de um pagamento Mercado Pago.
 *
 * Body:
 *   {
 *     transaction_id?: string,    // UUID em payment_transactions
 *     mp_payment_id?: string,     // alternativa: ID direto no MP
 *     amount?: number             // se omitido, estorno total
 *   }
 *
 * Permissão: admin OU dono da transação dentro de 24h
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mpRequest, mpCorsHeaders } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mpCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

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

    const { transaction_id, mp_payment_id, amount } = await req.json();

    if (!transaction_id && !mp_payment_id) {
      return json({ error: "transaction_id ou mp_payment_id obrigatório" }, 400);
    }

    // Resolve transação
    let txQuery = admin.from("payment_transactions").select("*");
    if (transaction_id) txQuery = txQuery.eq("id", transaction_id);
    else txQuery = txQuery.eq("mp_payment_id", mp_payment_id);
    const { data: tx } = await txQuery.single();

    if (!tx) return json({ error: "Transação não encontrada" }, 404);

    // Permissão: admin ou owner dentro de 24h
    const isOwner = tx.user_id === user.id;
    if (!isOwner) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
      if (!isAdmin) return json({ error: "Sem permissão" }, 403);
    } else {
      // Owner só pode estornar dentro de 24h
      const paidAt = tx.paid_at ? new Date(tx.paid_at).getTime() : 0;
      const hoursSince = paidAt ? (Date.now() - paidAt) / 3_600_000 : Infinity;
      if (hoursSince > 24) {
        return json({ error: "Refund só disponível em até 24h após pagamento. Entre em contato com o suporte." }, 403);
      }
    }

    if (!tx.mp_payment_id) {
      return json({ error: "Transação não tem mp_payment_id — possivelmente PagBank legacy" }, 400);
    }

    if (tx.status === "refunded") return json({ error: "Já estornado" }, 400);

    // Cria refund
    const isPartial = amount && Number(amount) > 0 && Math.round(Number(amount) * 100) < Number(tx.amount_cents);
    const refundBody: Record<string, any> = {};
    if (isPartial) refundBody.amount = Number(amount);

    const refund = await mpRequest<any>(
      "POST",
      `/v1/payments/${tx.mp_payment_id}/refunds`,
      isPartial ? refundBody : undefined
    );

    if (!refund.ok) {
      return json({
        error: refund.data?.message || refund.data?.cause?.[0]?.description || "Falha no refund",
        gateway: refund.data,
      }, 400);
    }

    await admin
      .from("payment_transactions")
      .update({
        status: isPartial ? "partial_refund" : "refunded",
        refunded_at: new Date().toISOString(),
        raw_response: { ...tx.raw_response, refund: refund.data },
      } as any)
      .eq("id", tx.id);

    // Atualiza recurso relacionado
    if (tx.resource_type === "appointment" && tx.resource_id) {
      await admin
        .from("appointments")
        .update({ payment_status: isPartial ? "partial_refund" : "refunded" } as any)
        .eq("id", tx.resource_id);
    }

    return json({
      ok: true,
      refund_id: String(refund.data.id),
      amount: refund.data.amount,
      is_partial: isPartial,
    });
  } catch (e) {
    console.error("[mp-refund] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
