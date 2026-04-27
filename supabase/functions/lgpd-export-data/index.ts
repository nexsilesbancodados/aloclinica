import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * LGPD Art. 18, II + V — Direito de acesso e portabilidade.
 * Devolve em JSON todos os dados pessoais armazenados sobre o titular autenticado.
 * Usuário deve estar autenticado (Bearer token).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: u, error: uerr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (uerr || !u.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = u.user.id;
    const userEmail = u.user.email;

    // Tables that may contain user-personal data
    const queries: { table: string; column?: string }[] = [
      { table: "profiles", column: "user_id" },
      { table: "doctor_profiles", column: "user_id" },
      { table: "appointments", column: "patient_id" },
      { table: "subscriptions", column: "user_id" },
      { table: "pingo_card_subscriptions", column: "user_id" },
      { table: "patient_consents", column: "patient_id" },
      { table: "notifications", column: "user_id" },
      { table: "messages", column: "sender_id" },
      { table: "wallet_transactions", column: "user_id" },
      { table: "dependents", column: "user_id" },
      { table: "exam_requests", column: "patient_id" },
      { table: "ophthalmology_exams", column: "patient_id" },
      { table: "prescription_signatures", column: "signed_by" },
      { table: "digital_signatures", column: "user_id" },
      { table: "funeral_assistance_requests", column: "user_id" },
      { table: "sweepstake_tickets", column: "user_id" },
      { table: "support_tickets", column: "user_id" },
      { table: "rate_limits", column: "identifier" },
    ];

    const exported: Record<string, unknown> = {
      generated_at: new Date().toISOString(),
      user: {
        id: userId,
        email: userEmail,
        created_at: u.user.created_at,
        last_sign_in_at: u.user.last_sign_in_at,
      },
      tables: {},
    };

    for (const q of queries) {
      try {
        const { data, error } = await (supabase as any)
          .from(q.table)
          .select("*")
          .eq(q.column!, userId);
        (exported.tables as any)[q.table] = error ? { error: error.message } : (data ?? []);
      } catch (e) {
        (exported.tables as any)[q.table] = { error: (e as Error).message };
      }
    }

    // Log access for auditing
    try {
      await (supabase as any).from("admin_actions_log").insert({
        action: "lgpd_export_self",
        target_user_id: userId,
        actor_user_id: userId,
        details: { tables_exported: queries.length },
      });
    } catch { /* table may not exist yet */ }

    return new Response(JSON.stringify(exported, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aloclinica-meus-dados-${userId}-${Date.now()}.json"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
