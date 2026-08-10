/**
 * Transporte seguro para a Evolution API.
 *
 * O fallback HTTPS -> HTTP só pode ser habilitado explicitamente para uma
 * emergência controlada. Em produção, uma falha de certificado deve impedir
 * o envio: mensagens WhatsApp podem conter dados médicos e não podem trafegar
 * em texto claro.
 */
const allowsInsecureHttp = () =>
  Deno.env.get("ALLOW_INSECURE_EVOLUTION_HTTP") === "true";

export const normalizeEvolutionUrl = (value?: string | null): string | null => {
  if (!value || value.includes("PLACEHOLDER_VALUE_TO_BE_REPLACED")) return null;

  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const secure = url.protocol === "https:";
    const explicitlyAllowed = url.protocol === "http:" && allowsInsecureHttp();
    if (!secure && !explicitlyAllowed) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
};

const isTlsError = (error: unknown) => {
  const message = String(error).toLowerCase();
  return message.includes("certificate") ||
    message.includes("tls") ||
    message.includes("causedasendentity");
};

export const fetchEvolution = async (
  url: string,
  opts: RequestInit = {},
): Promise<Response> => {
  try {
    return await fetch(url, opts);
  } catch (error) {
    if (!allowsInsecureHttp() || !isTlsError(error) || !url.startsWith("https://")) {
      throw error;
    }

    console.warn(
      "Evolution API TLS validation failed; using explicitly enabled insecure HTTP fallback.",
    );
    return await fetch(url.replace(/^https:\/\//, "http://"), opts);
  }
};
