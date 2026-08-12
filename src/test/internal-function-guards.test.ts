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
});
