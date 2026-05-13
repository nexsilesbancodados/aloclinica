/**
 * taxReceipt — gera PDF de recibo válido pra dedução no IRPF (Brasil).
 *
 * Receita Federal exige no recibo:
 *   - Nome + CPF do paciente
 *   - Razão social + CNPJ + endereço da prestadora
 *   - Descrição do serviço
 *   - Valor + data do pagamento
 *   - Texto: "Para fins de comprovação fiscal" + assinatura/CRM se médico
 *
 * Uso:
 *   import { generateTaxReceipt } from "@/lib/taxReceipt";
 *   await generateTaxReceipt({
 *     patient: { name: "João Silva", cpf: "12345678909" },
 *     items: [{ description: "Consulta com Dr. ...", amount: 89.90, date: "..." }],
 *     receipt_number: "REC-001",
 *     payment_date: "2026-05-12",
 *   });
 */
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type TaxReceiptItem = {
  description: string;
  amount: number;
  date?: string;
};

export type TaxReceiptInput = {
  patient: { name: string; cpf: string };
  items: TaxReceiptItem[];
  receipt_number: string;
  payment_date: string; // ISO
  /** Override da empresa (default = AloClínica). Útil pra clínicas parceiras. */
  issuer?: {
    name: string;
    cnpj: string;
    address: string;
  };
  /** Quando aplicável (consulta com médico): identifica o profissional pra nota IRPF */
  doctor?: {
    name: string;
    cpf?: string;
    crm: string;
    crm_state: string;
  };
};

const DEFAULT_ISSUER = {
  name: "AloClínica Telemedicina",
  cnpj: "00.000.000/0000-00", // Admin substitui via env
  address: "Av. Paulista, 1000, Bela Vista, São Paulo — SP, CEP 01310-100",
};

const formatCPF = (cpf: string): string => {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatCNPJ = (cnpj: string): string => {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const formatBRL = (v: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Converte número em extenso (formato simplificado pra recibo). */
function valorPorExtenso(valor: number): string {
  // Simplificação: só pra valores < 10k. Acima disso retorna string formatada.
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  if (inteiro >= 10000) return `${formatBRL(valor)} (em algarismos)`;

  const ones = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function lessThan100(n: number): string {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    return tens[t] + (u ? " e " + ones[u] : "");
  }
  function lessThan1000(n: number): string {
    if (n === 100) return "cem";
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (hundreds[h] ? hundreds[h] + (r ? " e " : "") : "") + lessThan100(r);
  }

  let result = "";
  const milhar = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;
  if (milhar > 0) result += (milhar === 1 ? "mil" : lessThan1000(milhar) + " mil");
  if (resto > 0) result += (milhar > 0 ? " e " : "") + lessThan1000(resto);
  if (inteiro === 0) result = "zero";

  let str = `${result} ${inteiro === 1 ? "real" : "reais"}`;
  if (centavos > 0) {
    str += ` e ${lessThan100(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  }
  return str;
}

export function generateTaxReceipt(input: TaxReceiptInput): void {
  const issuer = input.issuer ?? DEFAULT_ISSUER;
  const total = input.items.reduce((sum, it) => sum + it.amount, 0);
  const paymentDate = format(new Date(input.payment_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();

  // Cabeçalho azul
  doc.setFillColor(0, 52, 127);
  doc.rect(0, 0, w, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(issuer.name, 20, 16);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${formatCNPJ(issuer.cnpj)}`, 20, 24);

  // Número do recibo (canto direito)
  doc.setFontSize(9);
  doc.text(`Recibo Nº ${input.receipt_number}`, w - 20, 16, { align: "right" });
  doc.text(format(new Date(input.payment_date), "dd/MM/yyyy"), w - 20, 22, { align: "right" });

  // Título centralizado
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE PAGAMENTO", w / 2, 50, { align: "center" });

  // Endereço da empresa
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(issuer.address, w / 2, 58, { align: "center", maxWidth: w - 40 });

  // Box principal
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.rect(20, 70, w - 40, 110);

  // Pagador
  let y = 80;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PAGADOR", 25, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Nome: ${input.patient.name}`, 25, y); y += 6;
  doc.text(`CPF: ${formatCPF(input.patient.cpf)}`, 25, y); y += 10;

  // Descrição dos serviços
  doc.setFont("helvetica", "bold");
  doc.text("REFERENTE A", 25, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  input.items.forEach((it) => {
    const dateStr = it.date ? `(${format(new Date(it.date), "dd/MM/yyyy")})` : "";
    doc.text(`• ${it.description} ${dateStr}`, 25, y, { maxWidth: w - 80 });
    doc.text(formatBRL(it.amount), w - 25, y, { align: "right" });
    y += 6;
  });

  // Linha total
  doc.setDrawColor(180, 180, 180);
  doc.line(25, y + 2, w - 25, y + 2);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("VALOR TOTAL", 25, y);
  doc.text(formatBRL(total), w - 25, y, { align: "right" });

  // Valor por extenso
  y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(`(${valorPorExtenso(total)})`, 25, y, { maxWidth: w - 50 });

  // Médico responsável (se aplicável)
  if (input.doctor) {
    y = 195;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("PROFISSIONAL RESPONSÁVEL", 25, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Nome: ${input.doctor.name}`, 25, y); y += 5;
    doc.text(`CRM: ${input.doctor.crm}/${input.doctor.crm_state}`, 25, y);
    if (input.doctor.cpf) {
      doc.text(`CPF: ${formatCPF(input.doctor.cpf)}`, w - 25, y, { align: "right" });
    }
  }

  // Texto fiscal
  const textY = input.doctor ? 220 : 200;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(
    `Declaro ter recebido de ${input.patient.name}, CPF ${formatCPF(input.patient.cpf)}, a importância de ${formatBRL(total)} (${valorPorExtenso(total)}), referente aos serviços médicos descritos acima, prestados em ${paymentDate}.`,
    20, textY, { maxWidth: w - 40, align: "justify" }
  );

  // Texto IRPF
  doc.setFillColor(245, 250, 255);
  doc.rect(20, 250, w - 40, 18, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(0, 70, 140);
  doc.text(
    "Este recibo serve como comprovante para dedução de despesas médicas na Declaração de Imposto de Renda Pessoa Física (IRPF), conforme Art. 73 do RIR/2018.",
    25, 258, { maxWidth: w - 50 }
  );

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(`Documento gerado eletronicamente em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, w / 2, 285, { align: "center" });
  doc.text(`${issuer.name} · Documento legítimo emitido pela plataforma`, w / 2, 289, { align: "center" });

  // Salvar
  const fileName = `recibo-${input.receipt_number}-${input.payment_date.slice(0, 10)}.pdf`;
  doc.save(fileName);
}
