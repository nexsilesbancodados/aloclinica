/**
 * Autorização de DESTINATÁRIO para e-mails disparados por usuário.
 *
 * `send-email` aceita o sentinel "resolve-from-user": o chamador manda um
 * user_id e o servidor resolve o e-mail. Isso evita expor endereços, mas NÃO
 * autoriza por si só — sem checar vínculo, qualquer usuário autenticado poderia
 * disparar um e-mail com a marca da clínica para qualquer conta cujo UUID
 * conhecesse (spam/engenharia social a partir de domínio com SPF/DKIM válidos).
 *
 * A regra: um usuário comum só notifica alguém com quem compartilha uma
 * CONSULTA (paciente ↔ médico, em qualquer direção). Admin e chamadas internas
 * (cron/trigger/edge-to-edge) não passam por aqui.
 *
 * Este módulo é deliberadamente livre de APIs do Deno e de imports remotos —
 * o client entra por injeção — para poder ser testado pelo vitest junto do
 * resto da suíte (ver src/test/send-email-recipient-auth.test.ts).
 */

/** Subconjunto mínimo do client Supabase usado aqui (facilita o fake no teste). */
export interface RecipientAuthClient {
  from: (table: string) => {
    select: (
      columns: string,
      opts?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (column: string, value: string) => {
        in?: (column: string, values: string[]) => Promise<{ data?: unknown[] | null; count?: number | null }>;
      } & Promise<{ data?: unknown[] | null; count?: number | null }>;
    };
  };
}

/**
 * Chamador e destinatário são as duas pontas de alguma consulta?
 *
 * Consulta por doctor_profiles.user_id porque appointments.doctor_id referencia
 * doctor_profiles.id, não auth.users.id.
 *
 * Falha FECHADA: qualquer erro na checagem nega o envio.
 */
export async function shareAppointment(
  sbAdmin: RecipientAuthClient,
  callerId: string,
  recipientId: string,
): Promise<boolean> {
  if (!callerId || !recipientId) return false;

  try {
    const profileIdsOf = async (uid: string): Promise<string[]> => {
      const res = await (sbAdmin.from("doctor_profiles").select("id") as unknown as {
        eq: (c: string, v: string) => Promise<{ data?: unknown[] | null }>;
      }).eq("user_id", uid);
      return ((res?.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    };

    const countAppointments = async (patientId: string, doctorIds: string[]): Promise<number> => {
      if (doctorIds.length === 0) return 0;
      const q = sbAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId) as unknown as {
          in: (c: string, v: string[]) => Promise<{ count?: number | null }>;
        };
      const res = await q.in("doctor_id", doctorIds);
      return res?.count ?? 0;
    };

    const [callerDocIds, recipientDocIds] = await Promise.all([
      profileIdsOf(callerId),
      profileIdsOf(recipientId),
    ]);

    // caller = paciente, destinatário = médico
    if (await countAppointments(callerId, recipientDocIds) > 0) return true;

    // caller = médico, destinatário = paciente
    if (await countAppointments(recipientId, callerDocIds) > 0) return true;

    // Prescription renewals can exist without a new appointment. The doctor
    // may be stored as the original doctor or as the doctor who claimed the
    // renewal queue, so check both relationships.
    const renewalChecks = await Promise.all(
      callerDocIds.map(async (doctorId) => {
        const original = await (sbAdmin.from("prescription_renewals").select("id") as unknown as {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => Promise<{ data?: unknown[] | null }>;
          };
        }).eq("patient_id", recipientId).eq("doctor_id", doctorId);
        if ((original?.data ?? []).length > 0) return true;

        const assigned = await (sbAdmin.from("prescription_renewals").select("id") as unknown as {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => Promise<{ data?: unknown[] | null }>;
          };
        }).eq("patient_id", recipientId).eq("assigned_doctor_id", doctorId);
        return (assigned?.data ?? []).length > 0;
      }),
    );
    if (renewalChecks.some(Boolean)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Decisão final de destinatário para o sentinel "resolve-from-user".
 * Extraída para ser testável sem subir a edge function.
 */
export async function mayNotifyRecipient(
  sbAdmin: RecipientAuthClient,
  opts: { internal: boolean; callerIsAdmin: boolean; callerId: string | null; recipientId: string },
): Promise<boolean> {
  const { internal, callerIsAdmin, callerId, recipientId } = opts;
  if (!recipientId) return false;
  if (internal || callerIsAdmin) return true;
  if (!callerId) return false;
  if (callerId === recipientId) return true;
  return shareAppointment(sbAdmin, callerId, recipientId);
}
