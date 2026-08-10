import { describe, it, expect } from "vitest";
import {
  mayNotifyRecipient,
  shareAppointment,
} from "../../supabase/functions/_shared/recipient-auth";

/**
 * `send-email` aceita o sentinel "resolve-from-user" (o servidor resolve o
 * e-mail a partir de um user_id). Resolver sem checar vínculo transformaria a
 * função num canal aberto: qualquer usuário autenticado mandaria e-mail com a
 * marca da clínica para qualquer conta cujo UUID conhecesse — a partir de um
 * domínio com SPF/DKIM válidos.
 *
 * Estes testes travam a regra: só passa quem é interno, admin, o próprio
 * destinatário, ou compartilha uma consulta com ele.
 */

const PACIENTE_A = "user-paciente-a";
const PACIENTE_B = "user-paciente-b";
const MEDICO = "user-medico";
const MEDICO_PROFILE = "doctor-profile-1";

/**
 * Fake do client: o médico tem uma ficha em doctor_profiles e existe UMA
 * consulta entre PACIENTE_A e esse médico. PACIENTE_B não tem vínculo nenhum.
 */
const makeClient = (withAppointment = true) => {
  const doctorProfiles: Record<string, string[]> = { [MEDICO]: [MEDICO_PROFILE] };
  const appointments = withAppointment
    ? [{ patient_id: PACIENTE_A, doctor_id: MEDICO_PROFILE }]
    : [];

  return {
    from(table: string) {
      if (table === "doctor_profiles") {
        return {
          select: () => ({
            eq: async (_col: string, uid: string) => ({
              data: (doctorProfiles[uid] ?? []).map((id) => ({ id })),
            }),
          }),
        };
      }
      if (table === "appointments") {
        return {
          select: () => ({
            eq: (_c: string, patientId: string) => ({
              in: async (_c2: string, doctorIds: string[]) => ({
                count: appointments.filter(
                  (a) => a.patient_id === patientId && doctorIds.includes(a.doctor_id),
                ).length,
              }),
            }),
          }),
        };
      }
      if (table === "prescription_renewals") {
        return {
          select: () => ({
            eq: (_col: string, patientId: string) => ({
              eq: async (_col2: string, doctorId: string) => ({
                data: patientId === PACIENTE_A && doctorId === MEDICO_PROFILE
                  ? [{ id: "renewal-1" }]
                  : [],
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  } as never;
};

const base = { internal: false, callerIsAdmin: false };

describe("send-email — autorização de destinatário (resolve-from-user)", () => {
  it("NEGA usuário A tentando atingir o usuário B sem vínculo", async () => {
    const allowed = await mayNotifyRecipient(makeClient(false), {
      ...base,
      callerId: PACIENTE_A,
      recipientId: PACIENTE_B,
    });
    expect(allowed).toBe(false);
  });

  it("PERMITE o médico notificar o paciente da consulta dele", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: MEDICO,
      recipientId: PACIENTE_A,
    });
    expect(allowed).toBe(true);
  });

  it("PERMITE o paciente notificar o médico da consulta dele", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: PACIENTE_A,
      recipientId: MEDICO,
    });
    expect(allowed).toBe(true);
  });

  it("NEGA um paciente sem consulta com aquele médico", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: PACIENTE_B,
      recipientId: MEDICO,
    });
    expect(allowed).toBe(false);
  });

  it("PERMITE enviar para si mesmo", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: PACIENTE_B,
      recipientId: PACIENTE_B,
    });
    expect(allowed).toBe(true);
  });

  it("PERMITE o mÃ©dico designado por uma renovaÃ§Ã£o sem consulta nova", async () => {
    const allowed = await mayNotifyRecipient(makeClient(false), {
      ...base,
      callerId: MEDICO,
      recipientId: PACIENTE_A,
    });
    expect(allowed).toBe(true);
  });

  it("PERMITE admin e chamadas internas (cron/trigger/edge-to-edge)", async () => {
    const asAdmin = await mayNotifyRecipient(makeClient(), {
      internal: false, callerIsAdmin: true, callerId: "user-admin", recipientId: PACIENTE_B,
    });
    const asInternal = await mayNotifyRecipient(makeClient(), {
      internal: true, callerIsAdmin: false, callerId: null, recipientId: PACIENTE_B,
    });
    expect(asAdmin).toBe(true);
    expect(asInternal).toBe(true);
  });

  it("NEGA quando não há chamador identificado e não é interno/admin", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: null,
      recipientId: PACIENTE_A,
    });
    expect(allowed).toBe(false);
  });

  it("NEGA quando o recipientId vem vazio", async () => {
    const allowed = await mayNotifyRecipient(makeClient(), {
      ...base,
      callerId: PACIENTE_A,
      recipientId: "",
    });
    expect(allowed).toBe(false);
  });

  it("falha FECHADA quando a checagem de vínculo quebra", async () => {
    const brokenClient = {
      from() {
        throw new Error("banco indisponível");
      },
    } as never;
    const allowed = await shareAppointment(brokenClient, PACIENTE_A, MEDICO);
    expect(allowed).toBe(false);
  });
});
