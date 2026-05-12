/**
 * Shared Mercado Pago HTTP client — usado por todas as edge functions mp-*.
 *
 * Lê MERCADOPAGO_ACCESS_TOKEN do env do edge function.
 * Production endpoint: https://api.mercadopago.com
 * Sandbox: mesmo endpoint, distinção via token (TEST-... vs APP_USR-...)
 */

const MP_BASE = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado nas Edge Function Secrets do Supabase");
  }
  return token;
}

export type MpResponse<T = any> = {
  ok: boolean;
  status: number;
  data: T;
  /** Body original (texto) caso parse JSON falhe */
  raw?: string;
};

export async function mpRequest<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  options: { idempotencyKey?: string } = {}
): Promise<MpResponse<T>> {
  const url = path.startsWith("http") ? path : `${MP_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) {
    headers["X-Idempotency-Key"] = options.idempotencyKey;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: T;
  try {
    data = text ? JSON.parse(text) : ({} as T);
  } catch {
    return { ok: res.ok, status: res.status, data: {} as T, raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Garante que existe um customer Mercado Pago para o usuário, reutilizando
 * o customer_id salvo em profiles.mp_customer_id. Se não existir, cria.
 *
 * Retorna o customer_id.
 */
export async function ensureMpCustomer(
  admin: any,
  user: { id: string; email: string | null | undefined },
  profile?: { first_name?: string | null; last_name?: string | null; phone?: string | null; cpf?: string | null; mp_customer_id?: string | null }
): Promise<string> {
  if (profile?.mp_customer_id) return profile.mp_customer_id;

  // Tenta buscar por email primeiro
  const email = user.email ?? "";
  if (email) {
    const search = await mpRequest<{ results?: Array<{ id: string }> }>(
      "GET",
      `/v1/customers/search?email=${encodeURIComponent(email)}`
    );
    if (search.ok && search.data.results && search.data.results.length > 0) {
      const customerId = search.data.results[0].id;
      await admin.from("profiles").update({ mp_customer_id: customerId } as any).eq("user_id", user.id);
      return customerId;
    }
  }

  // Cria novo
  const payload: Record<string, any> = {
    email: email || undefined,
    first_name: profile?.first_name || undefined,
    last_name: profile?.last_name || undefined,
    identification: profile?.cpf
      ? { type: "CPF", number: profile.cpf.replace(/\D/g, "") }
      : undefined,
    phone: profile?.phone
      ? { area_code: profile.phone.replace(/\D/g, "").slice(0, 2), number: profile.phone.replace(/\D/g, "").slice(2) }
      : undefined,
  };

  const created = await mpRequest<{ id: string; error?: string; message?: string }>("POST", "/v1/customers", payload);
  if (!created.ok || !created.data.id) {
    throw new Error(`Falha ao criar customer MP: ${created.data.message || created.data.error || JSON.stringify(created.data)}`);
  }

  await admin.from("profiles").update({ mp_customer_id: created.data.id } as any).eq("user_id", user.id);
  return created.data.id;
}

/** CORS headers comuns pra todas as edge functions MP */
export const mpCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Mapeia status Mercado Pago → status interno (compat com PagBank) */
export function mapMpStatus(mpStatus: string): string {
  switch (mpStatus) {
    case "approved":
    case "authorized":
      return "approved";
    case "pending":
    case "in_process":
    case "in_mediation":
      return "pending";
    case "rejected":
      return "refused";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "chargeback";
    default:
      return mpStatus;
  }
}
