/**
 * mercadopago-withdraw — processa saque de médico via Mercado Pago PIX.
 *
 * Substitui a função `process-withdrawal` (que usava Asaas).
 *
 * Body:
 *   {
 *     withdrawal_id: string,                  // UUID em withdrawal_requests
 *     action: "approve" | "reject" | "process",
 *     admin_notes?: string
 *   }
 *
 * Notas sobre Money Out no Mercado Pago:
 *   - MP oferece o endpoint /v1/money_requests para PIX out (envio).
 *   - Body típico: {
 *       amount, currency_id, description,
 *       payer: { type, identification },  // dados do recebedor
 *       payment_type: "pix",
 *       pix_key: "<chave>"
 *     }
 *   - Endpoint exato pode variar por categoria de conta MP. Manter um adapter
 *     fácil de substituir se a API for diferente na conta da AloClínica.
 *
 * Permissão: somente admin.
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

    // Verifica admin
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Apenas admin pode processar saques" }, 403);

    const { withdrawal_id, action, admin_notes } = await req.json();
    if (!withdrawal_id || !action) return json({ error: "withdrawal_id e action obrigatórios" }, 400);

    // Busca request
    const { data: wd } = await admin
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (!wd) return json({ error: "Saque não encontrado" }, 404);
    if (wd.status === "completed") return json({ error: "Saque já processado" }, 400);

    const now = new Date().toISOString();

    if (action === "reject") {
      await admin.from("withdrawal_requests").update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: now,
        admin_notes: admin_notes || null,
      } as any).eq("id", withdrawal_id);
      return json({ ok: true, status: "rejected" });
    }

    if (action === "approve") {
      await admin.from("withdrawal_requests").update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: now,
        admin_notes: admin_notes || null,
      } as any).eq("id", withdrawal_id);
      return json({ ok: true, status: "approved" });
    }

    if (action !== "process") return json({ error: "action inválido" }, 400);

    // === PROCESS: dispara PIX out via Mercado Pago ===
    if (!wd.pix_key) return json({ error: "Chave PIX não informada" }, 400);

    const pixKeyType = (wd.pix_key_type as string) || guessPixKeyType(wd.pix_key);
    const amount = Number(wd.amount);
    if (!amount || amount <= 0) return json({ error: "Valor inválido" }, 400);

    // Marca processando
    await admin.from("withdrawal_requests").update({
      status: "processing",
      payout_gateway: "mercadopago",
    } as any).eq("id", withdrawal_id);

    // Mercado Pago Money Request (PIX out)
    // Documentação: o endpoint pode exigir habilitação na conta. Caso a conta
    // não tenha Money Out habilitado, marca como pending_manual e admin paga
    // manualmente no painel MP.
    const moneyOut = await mpRequest<any>("POST", "/v1/money_requests", {
      amount,
      currency_id: "BRL",
      description: `Saque AloClínica - ${wd.user_id}`,
      payment_type: "pix",
      pix_key: wd.pix_key,
      pix_key_type: pixKeyType,
      external_reference: `withdrawal_${withdrawal_id}`,
    });

    if (!moneyOut.ok) {
      // Se a conta não tem Money Out habilitado, marca pra processamento manual
      const needsManual = moneyOut.status === 403 || moneyOut.status === 404;
      await admin.from("withdrawal_requests").update({
        status: needsManual ? "pending_manual" : "failed",
        admin_notes: `${admin_notes ? admin_notes + " | " : ""}MP: ${moneyOut.data?.message || moneyOut.status}`,
      } as any).eq("id", withdrawal_id);

      return json({
        error: needsManual
          ? "Money Out não habilitado nesta conta MP. Saque marcado pra processamento manual."
          : moneyOut.data?.message || "Falha no envio PIX",
        gateway: moneyOut.data,
        needs_manual: needsManual,
      }, 400);
    }

    // Sucesso
    await admin.from("withdrawal_requests").update({
      status: "completed",
      mp_payout_id: moneyOut.data?.id ? String(moneyOut.data.id) : null,
      mp_money_request_id: moneyOut.data?.id ? String(moneyOut.data.id) : null,
      processed_at: now,
    } as any).eq("id", withdrawal_id);

    // Notifica médico
    await admin.from("notifications").insert({
      user_id: wd.user_id,
      type: "payment",
      title: "Saque processado",
      message: `R$ ${amount.toFixed(2)} foi enviado pra sua chave PIX. Deve cair em alguns minutos.`,
    } as any);

    return json({ ok: true, status: "completed", mp_payout_id: moneyOut.data?.id });
  } catch (e) {
    console.error("[mp-withdraw] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function guessPixKeyType(key: string): string {
  const digits = key.replace(/\D/g, "");
  if (digits.length === 11 && /^[0-9]+$/.test(key.replace(/\D/g, ""))) return "CPF";
  if (digits.length === 14) return "CNPJ";
  if (key.includes("@")) return "EMAIL";
  if (digits.length >= 10 && digits.length <= 13) return "PHONE";
  return "EVP"; // chave aleatória
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mpCorsHeaders, "Content-Type": "application/json" },
  });
}
