/** Shared domain types used across components */

/** Generic chart data — any key/value shape for Recharts */
export type ChartDataPoint = Record<string, any>;

export interface SpecialtyJoinRow {
  doctor_id: string;
  specialties?: { name?: string } | null;
}

export interface DoctorProfileRow {
  id: string;
  user_id: string;
  crm: string;
  crm_state: string;
  is_approved: boolean | null;
  crm_verified?: boolean;
  crm_verified_at?: string | null;
  bio: string | null;
  consultation_price: number | null;
  experience_years: number | null;
  education: string | null;
  rating?: number | null;
  total_reviews?: number | null;
  created_at: string;
  available_now?: boolean;
}

export interface DoctorWithProfile extends DoctorProfileRow {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  cpf?: string | null;
  specialties?: string[];
}

export interface AppointmentRow {
  id: string;
  scheduled_at: string;
  status: string;
  doctor_id: string;
  patient_id?: string | null;
  duration_minutes?: number | null;
  appointment_type?: string | null;
  price_at_booking?: number | null;
  notes?: string | null;
  video_room_url?: string | null;
  jitsi_link?: string | null;
  access_token?: string | null;
  guest_patient_id?: string | null;
  payment_status?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  return_deadline?: string | null;
  original_appointment_id?: string | null;
}

export interface ClinicProfileRow {
  id: string;
  user_id: string;
  name: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  is_approved: boolean | null;
  created_at: string;
}

export interface PartnerProfileRow {
  id: string;
  user_id: string;
  business_name: string;
  partner_type: string;
  cnpj: string | null;
  is_approved: boolean | null;
  created_at: string;
}

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

export interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

export interface PaymentResponse {
  paymentId?: string;
  subscriptionId?: string;
  pixCopyPaste?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  payment?: {
    id?: string;
    invoiceUrl?: string;
  };
}

// ─── Admin Types ──────────────────────────────────────────────────────────────

export type TrendIndicator = "↑" | "↓" | "⚠" | "✓" | null;

export interface AdminKpiItem {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  path?: string;
  trend?: TrendIndicator;
}

export interface AdminStats {
  total_revenue: number;
  active_subs: number;
  overdue_subs: number;
  total_patients: number;
  total_doctors: number;
  monthly_appts: number;
  avg_nps: number;
  period?: string;
}

// ─── Exam Types ───────────────────────────────────────────────────────────────

export interface ExamRequest {
  id: string;
  requesting_doctor_id: string;
  requesting_clinic_id?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  exam_type: string;
  status: string;
  assigned_to?: string | null;
  created_at: string;
  updated_at?: string;
  notes?: string | null;
  clinical_info?: string | null;
  file_urls?: any;
  priority?: string;
  sla_hours?: number | null;
  sla_deadline?: string | null;
  specialty_required?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  patient_birth_date?: string | null;
  patient_sex?: string | null;
  exam_date?: string | null;
}

// ─── AI Conversation Types ────────────────────────────────────────────────────

export interface AiConversation {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  context?: string | null;
  created_at: string;
}

// ─── NPS Types ────────────────────────────────────────────────────────────────

export interface NpsRow {
  id: string;
  appointment_id?: string | null;
  patient_id?: string | null;
  nps_score: number;
  feedback?: string | null;
  created_at: string;
}

// ─── Doctor Earnings ──────────────────────────────────────────────────────────

export interface DoctorAffiliation {
  id: string;
  doctor_id: string;
  clinic_id: string;
  commission_percent: number;
  clinic_profiles?: { name: string } | null;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface PlanPayload {
  name: string;
  price: number;
  description?: string | null;
  features?: string[] | null;
  is_active?: boolean;
  billing_period?: "monthly" | "annual";
}


// ─── Admin Component Row Types ────────────────────────────────────────────────

export interface AdminAppointmentRow {
  id: string;
  scheduled_at: string;
  status: string;
  patient_id: string | null;
  doctor_id: string;
  duration_minutes: number | null;
  notes: string | null;
  appointment_type: string | null;
  patient_name?: string;
  doctor_name?: string;
  price_at_booking?: number | null;
  payment_status?: string | null;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  details?: unknown;
  consent_reference?: string | null;
  ip_address?: string | null;
  performed_by?: string | null;
  user_agent?: string | null;
}

export interface CouponRow {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  max_uses?: number | null;

  // Current coupons table fields
  discount_percentage?: number;
  times_used?: number;
  expires_at?: string | null;

  // Legacy/alternative model fields (kept for compatibility)
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
  uses_count?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_used?: boolean;
  used_at?: string | null;
  used_by?: string | null;

  // Compatibility with old shape
  role?: string;
  uses_left?: number | null;
}

export interface SpecialtyRow {
  id: string;
  name: string;
  description: string | null;
  consultation_price: number | null;
  price_min: number | null;
  price_max: number | null;
  created_at?: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  current_period_end?: string | null;
  cancelled_at?: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  stripe_subscription_id?: string | null;
  // Joined/computed fields
  user_name?: string;
  plan_name?: string;
  profiles?: { first_name: string; last_name: string; email?: string } | null;
  plans?: { name: string; price: number } | null;
}

export interface SurveyRow {
  id: string;
  nps_score: number;
  created_at: string;
  appointment_id?: string | null;
  patient_id?: string | null;
  doctor_id?: string | null;
  feedback?: string | null;
  comment?: string | null;
  ease_score?: number | null;
  quality_score?: number | null;
  would_recommend?: boolean | null;
}

export interface ApprovalItem {
  id: string;
  user_id: string;
  is_approved: boolean | null;
  created_at: string;

  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  cpf?: string | null;

  crm?: string;
  crm_state?: string;
  crm_verified?: boolean;
  crm_verified_at?: string | null;
  specialties?: string[];
  education?: string | null;

  cnpj?: string | null;
  address?: string | null;
  owner_name?: string;

  business_name?: string;
  partner_type?: string;

  commission_percent?: number | null;
  pix_key?: string | null;

  rejection_reason?: string | null;

  kyc_status?: string | null;
  kyc_face_match_score?: number | null;
  kyc_verified_at?: string | null;
}

export interface PlanRow {
  id: string;
  name: string;
  price: number;
  description: string | null;
  features: unknown;
  is_active: boolean;
  interval?: string;
  billing_period?: string | null;
  max_appointments?: number | null;
  created_at?: string;
  updated_at?: string;
  stripe_price_id?: string | null;
}

export interface DoctorPerformanceRow {
  // NPS ranking shape
  id?: string;
  name?: string;
  nps?: number;
  responses?: number;
  avgQuality?: number;

  // Reports/analytics shape
  doctor_id?: string;
  doctor_name?: string;
  total?: number;
  avg_rating?: number;
  revenue?: number;

  // doctor_profiles compatibility
  rating?: number | null;
  total_reviews?: number | null;
  consultation_price?: number | null;
}

export interface RevenueDataRow {
  month: string;
  revenue: number;
  appointments: number;
}
