/**
 * Tipos e constantes do fluxo BookAppointment.
 * Extraídos do componente principal pra facilitar reuso e testes.
 */
import { CalendarDays, Clock, CheckCircle2, CreditCard } from "lucide-react";

export type PaymentMethod = "pix" | "card" | "boleto";

export interface DoctorInfo {
  id: string;
  user_id: string;
  crm: string;
  crm_state: string;
  bio: string | null;
  consultation_price: number;
  rating: number;
  experience_years: number | null;
  doctor_type?: "telemedicina";
  first_name: string;
  last_name: string;
  specialties: string[];
  slots: { day_of_week: number; start_time: string; end_time: string }[];
}

export const STEPS = [
  { key: "date", label: "Data", icon: CalendarDays },
  { key: "time", label: "Horário", icon: Clock },
  { key: "confirm", label: "Confirmação", icon: CheckCircle2 },
  { key: "payment", label: "Pagamento", icon: CreditCard },
];

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "Sem recorrência" },
  { value: "weekly", label: "Semanal (mesmo dia/hora)" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
];

export const RECURRENCE_WEEKS: Record<string, number> = {
  weekly: 1,
  biweekly: 2,
  monthly: 4,
};

export const KYC_PENDING_KEY = "aloclinica_kyc_pending";

/** Tempo de expiração do PIX (Asaas QR codes expiram em 30 min) */
export const PIX_EXPIRY_SECONDS = 1800;
