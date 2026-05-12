/**
 * Cliente Mercado Pago para o frontend.
 *
 * - Tokeniza cartão (nunca passa número/CVV pro backend)
 * - Lê VITE_MERCADOPAGO_PUBLIC_KEY do .env
 * - Usa SDK MP v2 carregado via <script> no index.html
 */

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

let mpInstance: any = null;

function getMpInstance() {
  if (mpInstance) return mpInstance;
  const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;
  if (!publicKey) {
    throw new Error("VITE_MERCADOPAGO_PUBLIC_KEY não configurada no .env");
  }
  if (!window.MercadoPago) {
    throw new Error("Mercado Pago SDK não carregado — verifique se o <script> está no index.html");
  }
  mpInstance = new window.MercadoPago(publicKey, { locale: "pt-BR" });
  return mpInstance;
}

export type CardTokenInput = {
  cardNumber: string;
  cardholderName: string;
  cardExpirationMonth: string; // "MM"
  cardExpirationYear: string;  // "YY" ou "YYYY"
  securityCode: string;
  identificationType?: "CPF" | "CNPJ";
  identificationNumber: string;
};

export type CardTokenResult = {
  id: string;             // token (usar em payment.token)
  payment_method_id?: string; // visa | master | amex | elo | hipercard...
  last_four_digits: string;
  expiration_month: number;
  expiration_year: number;
  cardholder?: { name: string };
};

export async function createCardToken(input: CardTokenInput): Promise<CardTokenResult> {
  const mp = getMpInstance();
  // Normaliza ano (MP aceita YY ou YYYY mas alguns endpoints quebram)
  const yy = input.cardExpirationYear.length === 2
    ? `20${input.cardExpirationYear}`
    : input.cardExpirationYear;

  const result = await mp.createCardToken({
    cardNumber: input.cardNumber.replace(/\s/g, ""),
    cardholderName: input.cardholderName.trim().toUpperCase(),
    cardExpirationMonth: input.cardExpirationMonth.padStart(2, "0"),
    cardExpirationYear: yy,
    securityCode: input.securityCode,
    identificationType: input.identificationType ?? "CPF",
    identificationNumber: input.identificationNumber.replace(/\D/g, ""),
  });

  if (!result?.id) {
    const errMsg = result?.cause?.[0]?.description ||
                   result?.message ||
                   "Falha ao validar cartão";
    throw new Error(errMsg);
  }

  return result as CardTokenResult;
}

/** Retorna a bandeira a partir do BIN (primeiros 6 dígitos) — fallback simples */
export function detectCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");
  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "master";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|509)/.test(digits)) return "elo";
  if (/^606282|^3841/.test(digits)) return "hipercard";
  return "";
}
