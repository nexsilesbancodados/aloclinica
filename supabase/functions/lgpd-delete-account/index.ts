import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * LGPD Art. 18, VI — Direito ao esquecimento.
 * Cria pedido de exclusão da conta. NÃO deleta imediatamente porque:
 * 1) Prontuário médico tem retenção legal de 20 anos (CFM 1.821/2007).
 * 2) Pode haver ações judiciais ou auditorias pendentes.
 *
 * Admin processa em até 15 dias e:
 * - Anonimiza dados sensíveis (nome, email, CPF, telefone -> hash/redacted)
 * - Mantém prontuário com identificador interno
 * - Notifica titular sobre conclusão
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

    const body = await req.json().catch(() => ({}));
    const reason = body?.reason || "Não informado";

    // Insert deletion request (uses table from existing migrations: lgpd_deletion_requests)
    const { data: existing } = await (supabase as any)
      .from("lgpd_deletion_requests")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Já existe um pedido em andamento", request_id: existing.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: created, error: cerr } = await (supabase as any)
      .from("lgpd_deletion_requests")
      .insert({
        user_id: userId,
        status: "pending",
        reason,
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (cerr) {
      // Fallback: try simpler shape if columns differ
      const { data: created2, error: cerr2 } = await (supabase as any)
        .from("lgpd_deletion_requests")
        .insert({ user_id: userId, status: "pending", reason })
        .select()
        .single();
      if (cerr2) {
        return new Response(JSON.stringify({ error: cerr2.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Notify admin
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          type: "default",
          to: Deno.env.get("ADMIN_NOTIFY_EMAIL") || "dpo@aloclinica.com.br",
          data: {
            subject: "Novo pedido LGPD de exclusão",
            body: `Usuário ${u.user.email} (${userId}) solicitou exclusão da conta.\nMotivo: ${reason}\n\nProcessar em até 15 dias úteis. Painel: https://aloclinica.com.br/admin/lgpd`,
          },
        },
      });
    } catch { /* non-blocking */ }

    // Audit log
    try {
      await (supabase as any).from("admin_actions_log").insert({
        action: "lgpd_deletion_requested",
        target_user_id: userId,
        actor_user_id: userId,
        details: { reason },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pedido recebido. Processaremos em até 15 dias úteis e enviaremos confirmação por email. Dados clínicos podem ser retidos pelo prazo legal de 20 anos (CFM 1.821/2007), mas serão anonimizados.",
        request_id: created?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
