// import pingoLogo from "@/assets/logo-pingo.png";


// ─── Dev Mode ────────────────────────────────────────────────────────────────
export const IS_DEV = 
  import.meta.env.DEV || 
  (typeof window !== "undefined" && window.localStorage.getItem("aloclinica_dev_mode") === "true") ||
  (typeof window !== "undefined" && window.location.hostname.includes("lovable.app"));

// ─── Financial ────────────────────────────────────────────────────────────────
export const DEFAULT_CONSULTATION_PRICE = 89;
export const PLATFORM_FEE_PERCENT       = 10;
export const DEFAULT_DOCTOR_PERCENT     = 70;
export const MIN_WITHDRAWAL_BRL         = 50;
export const MP_SPLIT_PERCENT           = PLATFORM_FEE_PERCENT;
/** @deprecated use MP_SPLIT_PERCENT — pagamento migrado para Mercado Pago. */
export const ASAAS_SPLIT_PERCENT        = MP_SPLIT_PERCENT;

// ─── Plan IDs ─────────────────────────────────────────────────────────────────
export const PLAN_IDS = {
  AVULSA: "avulsa",
  MENSAL: "mensal",
  ANUAL:  "anual",
} as const;
export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS];

// ─── Appointment ──────────────────────────────────────────────────────────────
export const APPOINTMENT_STATUSES = [
  "scheduled",
  "waiting",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled:   "Agendada",
  waiting:     "Na espera",
  in_progress: "Em andamento",
  completed:   "Concluída",
  cancelled:   "Cancelada",
  no_show:     "Ausente",
};

// ─── Roles ────────────────────────────────────────────────────────────────────
export const APP_ROLES = [
  "patient",
  "doctor",
  "admin",
  "clinic",
  "receptionist",
  "support",
  "partner",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

// ─── Consultation ─────────────────────────────────────────────────────────────
export const DEFAULT_CONSULTATION_DURATION_MINUTES = 30;
export const JITSI_DOMAIN = "meet.telemedicinaaloclinica.sbs";
export const CONSULTATION_TIMEOUT_MS = 15_000; // 15s

// ─── Cache / Stale times ──────────────────────────────────────────────────────
export const STALE = {
  REALTIME:  10 * 1000,        // 10s — appointment lists, presence
  SHORT:     30 * 1000,        // 30s — upcoming appts
  MEDIUM:    2 * 60 * 1000,    // 2min
  LONG:      5 * 60 * 1000,    // 5min — profiles, subscriptions
  VERY_LONG: 30 * 60 * 1000,   // 30min
} as const;

// ─── Pagination ───────────────────────────────────────────────────────────────
export const PAGE_SIZE = 20;
export const NOTIFICATION_PAGE_SIZE = 20;

// ─── Feature flags (env-driven) ───────────────────────────────────────────────
export const FEATURES = {
  MEMEDPRESCRIPTION: import.meta.env.VITE_MEMED_ENABLED === "true",
  ICP_SIGNING:       import.meta.env.VITE_ICP_ENABLED === "true",
  SENTRY:            Boolean(import.meta.env.VITE_SENTRY_DSN),
  GA:                Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID),
  META_PIXEL:        Boolean(import.meta.env.VITE_META_PIXEL_ID),
} as const;

// ─── Assets ───────────────────────────────────────────────────────────────────
export const PINGO_LOGO_URL = "https://cvbgrjauqjawrsyknhyj.supabase.co/storage/v1/object/public/files/uploads/0XILPRqqUbSOh99ow53X5OBDOCC3/1776904700670-og955-1776788772275-bngbf-hero-doctor__4_-removebg-preview.png";
