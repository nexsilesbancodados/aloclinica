/**
 * LGPD consent logger.
 *
 * Insere registros append-only em `public.consent_logs` para garantir prova
 * legal de cada aceite (termos, privacidade, cookies, biometria, TCLE).
 * Falhas são silenciadas para não bloquear o fluxo do usuário.
 */
import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

export type ConsentType =
  | "terms_of_use"
  | "privacy_policy"
  | "lgpd_data_processing"
  | "biometric_kyc"
  | "tcle_telemedicine"
  | "cookies_essential"
  | "cookies_analytics"
  | "cookies_marketing"
  | "cookies_all"
  | "cookies_rejected";

export interface LogConsentInput {
  type: ConsentType;
  accepted?: boolean;
  version?: string;
  documentUrl?: string;
  metadata?: Record<string, unknown>;
  /**
   * @deprecated Ignorado. O `user_id` gravado vem do JWT validado no servidor —
   * aceitar o id pelo corpo da requisição permitiria registrar aceite em nome
   * de terceiro. Mantido apenas para não quebrar `registerConsent(userId)`.
   */
  userId?: string | null;
}

const DOC_VERSIONS: Partial<Record<ConsentType, string>> = {
  terms_of_use: "2026-02",
  privacy_policy: "2026-02",
  lgpd_data_processing: "2026-02",
  biometric_kyc: "2026-02",
  tcle_telemedicine: "2026-02",
};

/**
 * Registra um consentimento. Funciona para usuários autenticados (user_id
 * preenchido no servidor a partir do JWT) e para visitantes anônimos no caso
 * de cookies.
 *
 * O registro passa pela edge function `record-consent` porque o IP precisa ser
 * capturado no SERVIDOR. A versão anterior consultava `api.ipify.org` do
 * navegador, o que nunca funcionou em produção: esse host não está no
 * `connect-src` de nenhum CSP (nginx.conf, vercel.json, public/_headers),
 * então a chamada era bloqueada, o `catch` devolvia null e todo aceite era
 * gravado com `ip_address: null`. Mesmo liberado, um IP informado pelo cliente
 * é falsificável e não serve como prova de aceite.
 */
export async function logConsent(input: LogConsentInput): Promise<void> {
  try {
    const { error } = await db.functions.invoke("record-consent", {
      body: {
        consent_type: input.type,
        version: input.version ?? DOC_VERSIONS[input.type] ?? "1.0",
        accepted: input.accepted ?? true,
        document_url: input.documentUrl ?? null,
        metadata: input.metadata ?? {},
      },
    });
    if (error) throw error;
  } catch (e) {
    // Não bloqueia o fluxo do usuário, mas TAMBÉM não fica invisível: um aceite
    // que não foi gravado é ausência de prova de consentimento. Antes isso só
    // aparecia em DEV, então uma falha em produção sumia sem ninguém saber.
    // `showToast = false` para não interromper o cadastro por causa do log.
    logError("[consent] falha ao registrar consentimento", e, { type: input.type }, false);
  }
}

/**
 * Bulk: registra múltiplos consentimentos de uma vez (ex.: checklist de cadastro).
 */
export async function logConsents(items: LogConsentInput[]): Promise<void> {
  await Promise.all(items.map(logConsent));
}

/**
 * Backward-compatible helper used by legacy auth pages.
 * Registra um aceite de termos+privacidade para um usuário específico.
 */
export async function registerConsent(
  userId: string,
  type: ConsentType | string = "terms_of_use",
): Promise<void> {
  await logConsent({
    type: type as ConsentType,
    userId,
    accepted: true,
    metadata: { source: "legacy_registerConsent" },
  });
}