/**
 * Aviso de manutenção de serviços — controla o banner global
 * (ServiceMaintenanceBanner).
 *
 * Para ENCERRAR a manutenção: troque `enabled` para `false` e publique.
 * Para AJUSTAR a lista/mensagem: edite `services` / `note`.
 *
 * Mantido como constante (sem depender do Supabase) de propósito, para o aviso
 * ser 100% confiável mesmo se o banco/serviços estiverem instáveis.
 */
export const SERVICE_MAINTENANCE: {
  /** Liga/desliga o banner global. */
  enabled: boolean;
  /** Serviços atualmente em manutenção (listados no aviso). */
  services: string[];
  /** Frase de complemento. */
  note: string;
} = {
  enabled: false,
  services: ["criação de conta", "envio de e-mail", "WhatsApp"],
  note: "Estamos trabalhando para normalizar o quanto antes. Obrigado pela compreensão.",
};

/**
 * Serviços ainda NÃO configurados (pré-lançamento). No monitor de saúde do admin
 * eles aparecem como "pendente" (âmbar) em vez de "falha" (vermelho) — evita
 * alarme falso por algo que nunca foi ligado. Ao configurar o serviço, REMOVA a
 * chave daqui para o monitor voltar a tratá-lo como crítico.
 *
 * Chaves possíveis: database, whatsapp, email, video, kyc, payments, nfse.
 */
export const SERVICES_PENDING_SETUP: string[] = [];
