/**
 * maskPII — utilitários pra mascarar dados pessoais em listagens.
 *
 * Por que: LGPD Art. 6 (princípio da necessidade) — admins veem listas com
 * 10.000 pacientes; CPF/telefone completo só deveria aparecer no detalhe.
 *
 * Padrão: mostra prefixo + sufixo, mascara o meio.
 */

/** "12345678909" → "123.***.***-09" */
export function maskCPF(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = String(cpf).replace(/\D/g, "");
  if (digits.length !== 11) return "***";
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

/** "11999998888" → "(11) ****-8888" */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "***";
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ****-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ****-${digits.slice(6)}`;
  return `****${digits.slice(-4)}`;
}

// "12345678901234" => "12.XXX.XXX/XXXX-34" (CNPJ 14 dígitos)
export function maskCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const digits = String(cnpj).replace(/\D/g, "");
  if (digits.length !== 14) return "***";
  return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12)}`;
}

/** "joao@email.com" → "j***@email.com" */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

/** Hash determinístico curto pra exibir em logs sem expor o valor inteiro. */
export function pseudonymize(value: string | null | undefined, prefix = ""): string {
  if (!value) return "—";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return `${prefix}${Math.abs(hash).toString(36).slice(0, 6)}`;
}
