/**
 * weekly-admin-report — digest semanal por email para admins
 * Cron: segunda 9h
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!isInternalOrService(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Aggregate metrics in parallel
    const [appts, completed, cancelled, noShow, newDoctors, newPatients, surveys, tickets] = await Promise.all([
      admin.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      admin.from("appointments").select("price_at_booking").eq("status", "completed").gte("updated_at", weekAgo),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("updated_at", weekAgo),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("status", "no_show").gte("updated_at", weekAgo),
      admin.from("doctor_profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      admin.from("satisfaction_surveys").select("nps_score").gte("created_at", weekAgo),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    ]);

    const revenue = (completed.data ?? []).reduce((s, a: any) => s + Number(a.price_at_booking ?? 0), 0);
    const npsAvg = surveys.data?.length ? (surveys.data.reduce((s, x: any) => s + Number(x.nps_score ?? 0), 0) / surveys.data.length).toFixed(1) : "—";

    const html = `<h2>📊 Relatório semanal AloClínica</h2>
<p>Período: últimos 7 dias</p>
<table style="border-collapse:collapse;width:100%">
  <tr><td><b>Consultas agendadas</b></td><td>${appts.count ?? 0}</td></tr>
  <tr><td><b>Consultas concluídas</b></td><td>${completed.data?.length ?? 0}</td></tr>
  <tr><td><b>Receita gerada</b></td><td>R$ ${revenue.toFixed(2)}</td></tr>
  <tr><td><b>Cancelamentos</b></td><td>${cancelled.count ?? 0}</td></tr>
  <tr><td><b>No-shows</b></td><td>${noShow.count ?? 0}</td></tr>
  <tr><td><b>Novos médicos</b></td><td>${newDoctors.count ?? 0}</td></tr>
  <tr><td><b>Novos pacientes</b></td><td>${newPatients.count ?? 0}</td></tr>
  <tr><td><b>NPS médio</b></td><td>${npsAvg}</td></tr>
  <tr><td><b>Tickets abertos</b></td><td>${tickets.count ?? 0}</td></tr>
</table>`;

    // Send to all admins
    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    let sent = 0;
    for (const a of admins ?? []) {
      const { data: au } = await admin.auth.admin.getUserById(a.user_id);
      if (au?.user?.email) {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ type: "admin_weekly_report", to: au.user.email, data: { html } }),
        });
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, metrics: { appts: appts.count, revenue, npsAvg } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[weekly-admin-report]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
