/**
 * Logger leve de atividade — alimenta a trilha LGPD ("Quem acessou meus dados").
 *
 * Use em pontos de leitura sensível (abrir prontuário/EMR, baixar receita,
 * abrir exame) para que o paciente veja registros reais em
 * /dashboard/patient/access-log. Falhas são silenciosas (não bloqueiam UX).
 */
import { db } from "@/integrations/supabase/untyped";

export type ActivityAction = "view" | "read" | "download" | "export" | "print" | "update" | "create" | "delete";
export type ActivityEntity = "prescription" | "consultation_notes" | "appointment" | "medical_record" | "exam_request" | "exam_order" | "profile";

interface LogParams {
  action: ActivityAction;
  entity_type: ActivityEntity;
  entity_id?: string;
  /** Por que esse acesso aconteceu (mostrado na trilha LGPD do paciente). */
  reason?: string;
  metadata?: Record<string, unknown>;
}

const inflight = new Map<string, number>(); // dedup curto: evita gravar a mesma view em < 5s

export async function logActivity(p: LogParams) {
  try {
    const key = `${p.action}:${p.entity_type}:${p.entity_id ?? ""}`;
    const now = Date.now();
    const last = inflight.get(key) ?? 0;
    if (now - last < 5_000) return; // dedup ruidoso (montagem + re-renders)
    inflight.set(key, now);

    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null;
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return;
    await (db.from("activity_logs") as any).insert({
      user_id: u.user.id,
      action: p.action,
      entity_type: p.entity_type,
      entity_id: p.entity_id ?? null,
      metadata: p.metadata ?? null,
      user_agent: ua,
      consent_reference: p.reason ?? null,
    });
  } catch {
    /* não-bloqueante */
  }
}
