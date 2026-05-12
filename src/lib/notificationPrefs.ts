/**
 * notificationPrefs — single source of truth para preferências do usuário
 * sobre quais categorias de notificação ele quer receber.
 *
 * Usado por NotificationPreferences (UI) e por NotificationBell/Notifications (filter).
 */

export const NOTIF_PREFS_KEY = "alo:notif-prefs";

export const NOTIF_CATEGORIES = [
  "appointment",
  "consultation",
  "payment",
  "document",
  "message",
  "health",
  "system",
  // Tipos extras que podem chegar mas mapeiam pra categoria principal
  "reminder", // → appointment
  "info",     // → system
  "approval", // → system
  "certificate", // → document
  "waitlist", // → consultation
] as const;

export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

const DEFAULTS: Record<string, boolean> = {
  appointment: true,
  consultation: true,
  payment: true,
  document: true,
  message: true,
  health: false,
  system: true,
};

/** Mapeia tipo recebido pra categoria de preferência */
function toCategory(type: string): string {
  switch (type) {
    case "reminder": return "appointment";
    case "info":
    case "approval": return "system";
    case "certificate": return "document";
    case "waitlist": return "consultation";
    default: return type;
  }
}

export function loadNotifPrefs(): Record<string, boolean> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(NOTIF_PREFS_KEY) : null;
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

/** Retorna true se notificação desta categoria deve ser entregue ao usuário */
export function isNotifAllowed(type: string, prefs?: Record<string, boolean>): boolean {
  const p = prefs ?? loadNotifPrefs();
  const cat = toCategory(type);
  // Padrão: se categoria não está no map, entregar
  if (!(cat in p)) return true;
  return p[cat] !== false;
}
