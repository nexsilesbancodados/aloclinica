import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const TABLES = [
  "profiles",
  "doctor_profiles",
  "appointments",
  "prescriptions",
  "exam_requests",
  "exam_reports",
  "medical_records",
  "subscriptions",
  "doctor_payouts",
];

async function verifyVaultSecret(
  req: Request,
): Promise<{ ok: boolean; errorCode?: string }> {
  const candidate =
    req.headers.get("x-internal-secret") ??
    req.headers.get("x-aloclinica-internal-secret");
  if (!candidate) return { ok: false };

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await service.rpc("verify_internal_function_secret", {
    candidate_secret: candidate,
  });
  if (error) {
    console.error(
      "[daily-backup] Vault authentication fallback failed",
      error.message,
    );
  }
  return { ok: data === true, errorCode: error?.code };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await getCaller(req);
    const serviceAuth = isInternalOrService(req);
    const vaultResult = await verifyVaultSecret(req);
    const trustedInternal = serviceAuth || vaultResult.ok;
    if (!trustedInternal && !caller.user) {
      console.error("[daily-backup] authentication rejected", {
        internalHeaderPresent: Boolean(
          req.headers.get("x-internal-secret") ??
          req.headers.get("x-aloclinica-internal-secret"),
        ),
        internalSecretConfigured: Boolean(
          Deno.env.get("INTERNAL_FUNCTION_SECRET"),
        ),
        bearerPresent: req.headers.has("Authorization"),
      });
      const body: { error: string; debug?: Record<string, unknown> } = {
        error: "Não autenticado",
      };
      if (req.headers.get("x-aloclinica-debug-auth") === "1") {
        body.debug = {
          headerNames: [...req.headers.keys()]
            .filter((name) => name.toLowerCase() !== "cookie")
            .sort(),
          internalHeaderPresent: Boolean(
            req.headers.get("x-internal-secret") ??
            req.headers.get("x-aloclinica-internal-secret"),
          ),
          internalSecretConfigured: Boolean(
            Deno.env.get("INTERNAL_FUNCTION_SECRET"),
          ),
          serviceRoleConfigured: Boolean(
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
          ),
          bearerPresent: req.headers.has("Authorization"),
          serviceAuth,
          vaultAuth: vaultResult.ok,
          vaultErrorCode: vaultResult.errorCode ?? null,
          internalHeaderLength: (
            req.headers.get("x-internal-secret") ??
            req.headers.get("x-aloclinica-internal-secret") ??
            ""
          ).length,
          configuredSecretLength: (
            Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? ""
          ).length,
        };
      }
      return new Response(JSON.stringify(body), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!trustedInternal && !caller.isAdmin) {
      return new Response(
        JSON.stringify({ error: "Acesso restrito a administradores" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.storage
      .createBucket("backups", { public: false })
      .catch(() => {});
    const date = new Date().toISOString().slice(0, 10);
    const summary: Record<string, number> = {};
    const failures: Record<string, string> = {};
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select("*").limit(50000);
      if (error) {
        summary[t] = -1;
        failures[t] = "Falha ao ler os dados";
        continue;
      }
      const json = JSON.stringify(data || []);
      const path = `${date}/${t}.json`;
      const { error: uploadError } = await supabase.storage
        .from("backups")
        .upload(path, new Blob([json], { type: "application/json" }), {
          upsert: true,
        });
      if (uploadError) {
        summary[t] = -1;
        failures[t] = "Falha ao gravar a cópia no Storage";
        continue;
      }
      summary[t] = (data || []).length;
    }
    if (Object.keys(failures).length > 0) {
      const { error: failureAuditError } = await supabase
        .from("activity_logs")
        .insert({
          user_id: caller.user?.id ?? null,
          performed_by: caller.user?.id ?? null,
          action: "daily_backup_failed",
          entity_type: "system",
          details: { date, summary, failures },
        });
      if (failureAuditError)
        console.error(
          "[daily-backup] failure audit log failed",
          failureAuditError.message,
        );
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Backup incompleto: uma ou mais tabelas não foram copiadas.",
          date,
          summary,
          failures,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { error: auditError } = await supabase.from("activity_logs").insert({
      user_id: caller.user?.id ?? null,
      performed_by: caller.user?.id ?? null,
      action: "daily_backup_run",
      entity_type: "system",
      details: {
        date,
        summary,
        source: trustedInternal ? "scheduled-job" : "admin-maintenance",
      },
    });
    if (auditError) {
      console.error("[daily-backup] audit log failed", auditError.message);
      return new Response(
        JSON.stringify({
          error: "Backup concluído, mas o registro de auditoria falhou.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ ok: true, date, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
