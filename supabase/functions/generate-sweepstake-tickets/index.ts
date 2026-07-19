import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tickets per plan slug — overridable via SWEEPSTAKE_TICKETS_BY_PLAN env (JSON)
const DEFAULT_TICKETS_BY_PLAN: Record<string, number> = {
  essencial: 1,
  familia: 5,
  premium: 15,
};

const generateTicketNumber = () => {
  const part = (n: number) => Math.floor(Math.random() * Math.pow(10, n)).toString().padStart(n, "0");
  return `${part(5)}-${part(5)}-${part(4)}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal cron job (invoked via x-internal-secret / service role) or an admin user.
  if (!isInternalOrService(req) && !(await getCaller(req)).isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let sweepstakeId: string | undefined;
    if (req.method === "POST") {
      try { ({ sweepstake_id: sweepstakeId } = await req.json()); } catch { /* empty body OK */ }
    }

    // If no sweepstake_id provided, pick the next open one
    if (!sweepstakeId) {
      const { data: open } = await supabase
        .from("sweepstakes")
        .select("id, ticket_generation_start, ticket_generation_end")
        .eq("status", "open")
        .lte("ticket_generation_start", new Date().toISOString().slice(0, 10))
        .gte("ticket_generation_end", new Date().toISOString().slice(0, 10))
        .order("draw_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!open) {
        return new Response(
          JSON.stringify({ success: true, message: "No active sweepstake in ticket-generation window", generated: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      sweepstakeId = open.id;
    }

    // Custom mapping from env
    let mapping = DEFAULT_TICKETS_BY_PLAN;
    try {
      const raw = Deno.env.get("SWEEPSTAKE_TICKETS_BY_PLAN");
      if (raw) mapping = JSON.parse(raw);
    } catch { /* ignore */ }

    const { data: subs, error: serr } = await supabase
      .from("pingo_card_subscriptions")
      .select("id, user_id, plan_id, pingo_card_plans(slug)")
      .eq("status", "active");
    if (serr) {
      return new Response(JSON.stringify({ error: serr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketsToInsert: any[] = [];
    for (const sub of subs ?? []) {
      const slug = (sub as any).pingo_card_plans?.slug as string | undefined;
      const count = slug && mapping[slug] ? mapping[slug] : 0;
      for (let i = 0; i < count; i++) {
        ticketsToInsert.push({
          sweepstake_id: sweepstakeId,
          user_id: sub.user_id,
          subscription_id: sub.id,
          ticket_number: generateTicketNumber(),
          source: "monthly",
        });
      }
    }

    if (ticketsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, message: "No active subscribers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch insert (chunks of 500 to stay safe)
    let inserted = 0;
    for (let i = 0; i < ticketsToInsert.length; i += 500) {
      const chunk = ticketsToInsert.slice(i, i + 500);
      const { error: ierr, count } = await supabase
        .from("sweepstake_tickets")
        .insert(chunk, { count: "exact" });
      if (ierr) console.warn("ticket insert chunk failed", ierr);
      inserted += count ?? chunk.length;
    }

    return new Response(
      JSON.stringify({ success: true, sweepstake_id: sweepstakeId, generated: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
