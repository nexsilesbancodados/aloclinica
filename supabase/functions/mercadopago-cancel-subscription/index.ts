/**
 * mercadopago-cancel-subscription
 *
 * Cancela uma assinatura (preapproval) no Mercado Pago e atualiza local.
 *
 * Body: { subscription_id: string }
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

    const { subscription_id } = await req.json();
    if (!subscription_id) return json({ error: "subscription_id obrigatório" }, 400);

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, user_id, mp_preapproval_id, gateway")
      .eq("id", subscription_id)
      .eq("user_id", user.id)
      .single();

    if (!sub) return json({ error: "Assinatura não encontrada" }, 404);

    if (sub.gateway === "mercadopago" && sub.mp_preapproval_id) {
      const cancel = await mpRequest("PUT", `/preapproval/${sub.mp_preapproval_id}`, { status: "cancelled" });
      if (!cancel.ok) {
        console.error("[mp-cancel-sub] falha ao cancelar no MP", cancel.data);
        // Continua atualizando local mesmo se MP falhou — pode estar já cancelado lá
      }
    }

    await admin
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        next_charge_at: null,
      } as any)
      .eq("id", subscription_id);

    return json({ ok: true });
  } catch (e) {
    console.error("[mp-cancel-sub] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
