/**
 * Form Validators - CPF, CNPJ, CRM, Email, Telefone
 */

export interface CPFValidationResult {
  valido: boolean;
  mensagem: string;
  codigo: "OK" | "Vazio" | "Curto" | "Longo" | "DigitosIguais" | "DV1" | "DV2";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CPF VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, "");

  if (cleanCPF.length !== 11) return false;

  // Check if all digits are the same (invalid CPF)
  if (/(\d)\1{10}$/.test(cleanCPF)) return false;

  // Calculate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF[9])) return false;

  // Calculate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF[10])) return false;

  return true;
}

/**
 * Valida CPF com mensagens de erro específicas para cada falha.
 * Útil para exibir feedback inline em formulários.
 */
export function validarCPFDetalhado(cpf: string): CPFValidationResult {
  const clean = cpf.replace(/\D/g, "");

  if (!clean) {
    return { valido: false, mensagem: "CPF é obrigatório", codigo: "Vazio" };
  }
  if (clean.length < 11) {
    return { valido: false, mensagem: `CPF incompleto (${clean.length}/11 dígitos)`, codigo: "Curto" };
  }
  if (clean.length > 11) {
    return { valido: false, mensagem: "CPF possui dígitos demais", codigo: "Longo" };
  }
  if (/(\d)\1{10}$/.test(clean)) {
    return { valido: false, mensagem: "CPF inválido (dígitos repetidos)", codigo: "DigitosIguais" };
  }

  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean[9])) {
    return { valido: false, mensagem: "CPF inválido (1º dígito verificador incorreto)", codigo: "DV1" };
  }

  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean[10])) {
    return { valido: false, mensagem: "CPF inválido (2º dígito verificador incorreto)", codigo: "DV2" };
  }

  return { valido: true, mensagem: "CPF válido", codigo: "OK" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CNPJ VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarCNPJ(cnpj: string): boolean {
  const cleanCNPJ = cnpj.replace(/\D/g, "");

  if (cleanCNPJ.length !== 14) return false;

  // Check if all digits are the same
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;

  // Calculate first check digit
  let size = cleanCNPJ.length - 2;
  let numbers = cleanCNPJ.substring(0, size);
  const digits = cleanCNPJ.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  // Calculate second check digit
  size = size + 1;
  numbers = cleanCNPJ.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRM VALIDATION (CFM - Conselho Federal de Medicina)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarCRM(crm: string, state?: string): boolean {
  const cleanCRM = crm.replace(/\D/g, "");

  // CRM format: XXXXX-UF (5 digits + state)
  // Valid range: 1 to 999999
  if (cleanCRM.length < 4 || cleanCRM.length > 6) return false;

  const num = parseInt(cleanCRM);
  if (num < 1 || num > 999999) return false;

  // If state provided, validate it's a valid state code
  if (state) {
    const validStates = [
      "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
      "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
      "RS", "RO", "RR", "SC", "SP", "SE", "TO"
    ];
    if (!validStates.includes(state.toUpperCase())) return false;
  }

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMAIL VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarEmail(email: string): boolean {
  // RFC 5322 simplified pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  // Check length constraints: local (64) + @ (1) + domain (255) = 320
  const [localPart, ...domainParts] = email.split('@');
  const domain = domainParts.join('@');

  if (email.length > 320) return false;
  if (!localPart || localPart.length > 64) return false;
  if (!domain || domain.length > 255) return false;

  // Check consecutive dots
  if (email.includes('..')) return false;

  // Check starts/ends with dot
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;

  return emailRegex.test(email);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHONE VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarTelefone(telefone: string): boolean {
  const cleanPhone = telefone.replace(/\D/g, "");

  // Valid formats:
  // (11) 9XXXX-XXXX (mobile) - 11 digits
  // (11) XXXXX-XXXX (landline) - 10 digits
  if (cleanPhone.length !== 10 && cleanPhone.length !== 11) return false;

  // First digit of area code should be 1-9
  if (cleanPhone[0] === "0") return false;

  // Area code (DDD) is 11-99
  const areaCode = parseInt(cleanPhone.substring(0, 2));
  if (areaCode < 11 || areaCode > 99) return false;

  // First digit of number should not be 0 or 1
  if (cleanPhone[2] === "0" || cleanPhone[2] === "1") return false;

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASSWORD VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4; // 0-4
  label: string;
  isValid: boolean;
  feedback: string[];
}

export function validarSenha(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push("Mínimo 8 caracteres");
  } else if (password.length < 12) {
    score++;
  } else {
    score++;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push("Incluir letra minúscula");
  } else {
    score++;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push("Incluir letra maiúscula");
  } else if (score > 1) {
    score++;
  }

  if (!/[0-9]/.test(password)) {
    feedback.push("Incluir número");
  } else {
    score++;
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    feedback.push("Incluir caractere especial");
  }

  const labels = ["Muito fraca", "Fraca", "Moderada", "Forte", "Muito forte"];
  const finalScore = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  return {
    score: finalScore,
    label: labels[finalScore],
    isValid: finalScore >= 2 && password.length >= 8,
    feedback
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAME VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarNome(nome: string): boolean {
  const trimmedName = nome.trim();

  // At least 3 characters
  if (trimmedName.length < 3) return false;

  // Max 100 characters
  if (trimmedName.length > 100) return false;

  // At least 2 words (first name + last name)
  const parts = trimmedName.split(" ").filter(p => p.length > 0);
  if (parts.length < 2) return false;

  // Only letters, spaces, and hyphens
  if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(trimmedName)) return false;

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATE VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarDataNascimento(dataNascimento: string): boolean {
  const date = new Date(dataNascimento);
  const today = new Date();

  // Must be valid date
  if (isNaN(date.getTime())) return false;

  // Must be in past
  if (date >= today) return false;

  // Must be at least 18 years old
  const age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  const dayDiff = today.getDate() - date.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    return age - 1 >= 18;
  }

  return age >= 18;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPANY NAME VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validarNomeEmpresa(nome: string): boolean {
  const trimmedName = nome.trim();

  if (trimmedName.length < 3) return false;
  if (trimmedName.length > 150) return false;

  // Allow letters, numbers, spaces, hyphens, dots
  if (!/^[a-zA-Z0-9À-ÿ\s\-\.&']+$/.test(trimmedName)) return false;

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPECIALTY VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VALID_SPECIALTIES = [
  "cardiologia",
  "dermatologia",
  "endocrinologia",
  "gastroenterologia",
  "ginecologia",
  "ortopedia",
  "pneumologia",
  "psiquiatria",
  "urologia",
  "clinica-geral",
  "pediatria",
];

export function validarEspecialidade(specialty: string): boolean {
  const s = specialty.trim().toLowerCase();
  if (!s) return false;
  if (VALID_SPECIALTIES.includes(s)) return true;
  // Aceita "outras" com texto livre (mín. 3 caracteres, apenas letras/espaços/hífen)
  return /^[a-záàâãéêíóôõúç\s-]{3,60}$/i.test(s);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATE CODE VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VALID_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function validarEstado(state: string): boolean {
  return VALID_STATES.includes(state.toUpperCase());
}
