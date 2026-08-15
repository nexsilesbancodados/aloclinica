import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

describe("internal edge-function guardrails", () => {
  it("keeps WhatsApp instance management admin-only", () => {
    const source = read("supabase/functions/whatsapp-qr/index.ts");
    expect(source).toContain('import { getCaller } from "../_shared/auth.ts"');
    expect(source).toContain("if (!caller.user)");
    expect(source).toContain("if (!caller.isAdmin)");
  });

  it("keeps the post-consultation survey worker internal-only", () => {
    const source = read("supabase/functions/post-consultation-survey/index.ts");
    expect(source).toContain('import { isInternalOrService } from "../_shared/auth.ts"');
    expect(source).toContain("if (!isInternalOrService(req))");
    expect(source).toContain("requestedAppointmentId");
    expect(source).toContain('completedQuery.eq("id", requestedAppointmentId)');
    expect(source).not.toContain("allo-medico-care.lovable.app");
  });

  it("creates and authorizes Metered rooms as private rooms", () => {
    const source = read("supabase/functions/metered-room/index.ts");
    expect(source).toContain('privacy: "private"');
    expect(source).toContain("/api/v1/token?secretKey=");
    expect(source).toContain("accessToken: tokenPayload.token");
    expect(source).not.toContain('privacy: "public"');
  });

  it("points RLS smoke tests at the production Supabase project", () => {
    const source = read("tests/rls.spec.ts");
    expect(source).toContain("pwxvvimdtmvziynbspgx.supabase.co");
    expect(source).not.toContain("oaixgmuocuwhsabidpei.supabase.co");
    expect(source).toContain("eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eHZ2aW1kdG12eml5bmJzcGd4");
  });

  it("keeps payment flows aligned with the production ledger schema", () => {
    const billing = read("src/components/billing/BillingPortal.tsx");
    const webhook = read("supabase/functions/mercadopago-webhook/index.ts");
    const createSubscription = read("supabase/functions/mercadopago-create-subscription/index.ts");
    const refund = read("supabase/functions/mercadopago-refund/index.ts");
    const consent = read("supabase/functions/record-consent/index.ts");
    const doctorSearch = read("src/components/patient/DoctorSearch.tsx");
    const reports = read("src/components/admin/AdminReports.tsx");

    expect(billing).not.toContain("next_charge_at");
    expect(billing).not.toContain("refund_amount_cents");
    expect(webhook).not.toContain("last_charge_at");
    expect(webhook).not.toContain("last_charge_status");
    expect(webhook).not.toContain("retry_count");
    expect(createSubscription).not.toContain("amount_cents");
    expect(createSubscription).not.toContain("next_charge_at");
    expect(createSubscription).not.toContain("metadata: {");
    expect(refund).not.toContain("tx.paid_at");
    expect(refund).not.toContain("refunded_at:");
    expect(consent).toContain("checkRateLimit");
    expect(consent).toContain('"record-consent"');
    expect(consent).toContain("accepted deve ser booleano");
    expect(doctorSearch).toContain("is_on_duty");
    expect(doctorSearch).not.toContain("available_now, available_now_since");
    expect(reports).not.toContain("const activeCards = 0");
    expect(reports).not.toContain("const churnRate = 0");
  });

  it("does not swallow database errors in the Mercado Pago webhook", () => {
    const source = read("supabase/functions/mercadopago-webhook/index.ts");

    // Toda escrita precisa capturar o erro e passar por checkWrite. Sem isso a
    // função devolvia 200, a MP não reenviava e o pagamento sumia do banco.
    expect(source).toContain("function checkWrite(");
    expect(source).toContain('checkWrite("marcar appointment como paga", apptError, true)');
    expect(source).toContain('checkWrite("atualizar on_demand_queue", queueError, true)');
    expect(source).toContain('checkWrite("atualizar prescription_renewals", renewalError, true)');

    // O ledger fica NÃO crítico de propósito: o schema de payment_transactions
    // não é verificável a partir deste repositório e um erro ali não pode
    // derrubar todo webhook em 500 com a MP reenviando indefinidamente.
    expect(source).toContain('checkWrite("update payment_transactions", txError)');
    expect(source).not.toContain('checkWrite("update payment_transactions", txError, true)');
    expect(source).not.toContain('checkWrite("upsert payment_transactions (recorrência)", ledgerError, true)');

    // Nenhuma escrita pode voltar a descartar o resultado: toda chamada a
    // `admin.from(...)` no arquivo desestrutura o erro antes do await.
    expect(source).not.toMatch(/\n {2}await admin\s*\n\s*\.from\(/);
    expect(source).toContain('const { error: notifError } = await admin.from("notifications").insert(');
    // Notificação e recibo são acessórios — não podem reverter um pagamento
    // já confirmado nem provocar reenvio da MP.
    expect(source).toContain("checkWrite(\"insert notifications\", notifError)");
    expect(source).not.toContain("checkWrite(\"insert notifications\", notifError, true)");
  });

  it("keeps the public invite-code endpoint from being an enumeration oracle", () => {
    const source = read("supabase/functions/validate-invite-code/index.ts");

    expect(source).toContain('import { checkRateLimit, getCaller } from "../_shared/auth.ts"');
    expect(source).toContain('checkRateLimit(identifier, "validate-invite-code"');

    // `user_id` vinha do corpo numa função pública: qualquer um queimava o
    // convite de um médico e gravava used_by apontando pra terceiro.
    expect(source).toContain("user_id !== caller.user.id");
    expect(source).toContain("used_by: caller.user.id");
    expect(source).not.toContain("used_by: user_id");
    // Só consome um convite que ainda esteja livre.
    expect(source).toContain('.eq("is_used", false)');
  });

  it("rate-limits the public voucher endpoint and hides internal errors", () => {
    const source = read("supabase/functions/validate-voucher/index.ts");

    expect(source).toContain('import { checkRateLimit } from "../_shared/auth.ts"');
    expect(source).toContain('checkRateLimit(`ip:${clientIp(req)}`, "validate-voucher"');
    expect(source).not.toContain("error: (err as Error).message");
  });

  it("validates consent payloads that anonymous callers can write", () => {
    const source = read("supabase/functions/record-consent/index.ts");

    // consent_logs é append-only e serve de prova de aceite: nada que o
    // visitante controle entra sem validação de esquema/tamanho.
    expect(source).toContain('scheme !== "http:" && scheme !== "https:"');
    expect(source).toContain('req.headers.get("user-agent")?.slice(0, 512)');
    // `accepted` já é validado como booleano acima; o coerce virou ruído.
    expect(source).not.toContain("accepted: accepted !== false");
  });
});
