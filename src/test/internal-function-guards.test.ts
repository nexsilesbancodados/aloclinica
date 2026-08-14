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
});
