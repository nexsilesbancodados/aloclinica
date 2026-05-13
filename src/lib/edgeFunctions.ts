import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

/**
 * edgeFunctions — wrappers tipados pras edge functions críticas.
 *
 * Por que: a maior parte do código chama `db.functions.invoke(...)` e trata
 * a resposta como `any`, perdendo type safety justo nos fluxos onde mais dói
 * (pagamento, assinatura, ICP-Brasil). Aqui agregamos shapes esperados.
 *
 * Convenção: toda resposta tem `{ ok: boolean; error?: string }`. Helpers retornam
 * `{ ok: true, data: T }` ou `{ ok: false, error: string }`, simplificando o callsite.
 */

export type EdgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function invoke<TBody, TResp>(
  fnName: string,
  body: TBody,
): Promise<EdgeResult<TResp>> {
  try {
    const { data, error } = await db.functions.invoke(fnName, { body });
    if (error) return { ok: false, error: error.message ?? `Erro em ${fnName}` };
    const resp = data as { ok?: boolean; success?: boolean; error?: string } & TResp;
    if (resp?.error) return { ok: false, error: resp.error };
    // Algumas funções legadas retornam `success: true` em vez de `ok: true`
    if (resp?.ok === false || resp?.success === false) {
      return { ok: false, error: resp.error ?? `${fnName} retornou falha` };
    }
    return { ok: true, data: data as TResp };
  } catch (err) {
    logError(`invoke ${fnName} threw`, err);
    return { ok: false, error: err instanceof Error ? err.message : `Erro em ${fnName}` };
  }
}

// ─── Mercado Pago ──────────────────────────────────────────────────────────

export type MpRefundResponse = {
  ok: true;
  amount: number;
  is_partial: boolean;
  refund_id: string;
};

export const refundPayment = (transactionId: string, amount?: number) =>
  invoke<{ transaction_id: string; amount?: number }, MpRefundResponse>(
    "mercadopago-refund",
    { transaction_id: transactionId, ...(amount !== undefined ? { amount } : {}) },
  );

export type MpCancelSubResponse = { ok: true; cancelled_at: string };

export const cancelSubscription = (subscriptionId: string) =>
  invoke<{ subscription_id: string }, MpCancelSubResponse>(
    "mercadopago-cancel-subscription",
    { subscription_id: subscriptionId },
  );

// ─── VIDaaS (ICP-Brasil) ───────────────────────────────────────────────────

export type VidaasStatusResponse = {
  configured: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
};

export const vidaasStatus = () =>
  invoke<{ action: "status" }, VidaasStatusResponse>("vidaas-sign", { action: "status" });

export type VidaasUserDiscoveryResponse = {
  found: boolean;
  certificates?: Array<{ alias: string; expires_at: string }>;
};

export const vidaasUserDiscovery = (cpf: string) =>
  invoke<{ action: "user_discovery"; cpf_cnpj: string; type: "CPF" }, VidaasUserDiscoveryResponse>(
    "vidaas-sign",
    { action: "user_discovery", cpf_cnpj: cpf, type: "CPF" },
  );

// ─── Push ──────────────────────────────────────────────────────────────────

export type PushSendResponse = { success: true; sent: number; failed?: number };

export const sendPushNotification = (
  user_id: string,
  title: string,
  message: string,
  link?: string,
) =>
  invoke<{ user_id: string; title: string; message: string; link?: string }, PushSendResponse>(
    "send-push-notification",
    { user_id, title, message, link },
  );
