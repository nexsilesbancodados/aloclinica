import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NotificationType = "consulta_agendada" | "lembrete_1h" | "laudo_disponivel" | "nova_consulta";

interface NotifyRequest {
  tipo: NotificationType;
  user_id: string;
  dados: {
    nome_paciente?: string;
    nome_medico?: string;
    data?: string;
    hora?: string;
    laudo_url?: string;
    appointment_id?: string;
    app_base_url?: string;
  };
}

const buildRoomLink = (d: NotifyRequest["dados"]) => {
  const base = d.app_base_url || Deno.env.get("APP_BASE_URL") || "https://aloclinica.com.br";
  return d.appointment_id ? `${base}/dashboard/consultation/${d.appointment_id}` : `${base}/dashboard`;
};

const TEMPLATES: Record<NotificationType, (d: NotifyRequest["dados"]) => string> = {
  consulta_agendada: (d) =>
    `✅ Olá ${d.nome_paciente || ""}! Sua consulta com Dr(a). ${d.nome_medico || ""} foi confirmada para ${d.data} às ${d.hora}.\n\n📹 Entrar na sala: ${buildRoomLink(d)}\n_Login obrigatório._`,
  lembrete_1h: (d) =>
    `⏰ Lembrete: Sua teleconsulta começa em 1 hora! Dr(a). ${d.nome_medico || ""} às ${d.hora}.\n\n📹 Entrar na sala: ${buildRoomLink(d)}\n_Login obrigatório._`,
  laudo_disponivel: (d) =>
    `📋 Seu laudo está disponível! Médico: Dr(a). ${d.nome_medico || ""}. Acesse e baixe: ${d.laudo_url || "https://aloclinica.com.br/dashboard"}`,
  nova_consulta: (d) =>
    `🩺 Nova consulta agendada! Paciente: ${d.nome_paciente || ""}. Data: ${d.data} às ${d.hora}.\n\n📹 Entrar na sala: ${buildRoomLink(d)}`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal job / proxy: only trusted server-to-server callers (DB triggers or
  // other edge functions via x-internal-secret / service role) or an admin user.
  if (!isInternalOrService(req) && !(await getCaller(req)).isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: NotifyRequest = await req.json();
    const { tipo, user_id, dados } = body;

    if (!tipo || !user_id || !TEMPLATES[tipo]) {
      return new Response(JSON.stringify({ error: "tipo and user_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch user phone from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, first_name, last_name")
      .eq("user_id", user_id)
      .single();

    if (!profile?.phone) {
      // Log failure and return
      await supabase.from("notification_logs").insert({
        user_id,
        tipo,
        canal: "whatsapp",
        status: "failed",
        mensagem: "Telefone não encontrado no perfil",
      });
      return new Response(JSON.stringify({ success: false, reason: "no_phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = TEMPLATES[tipo](dados);

    // Send via existing send-whatsapp edge function
    const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({ phone: profile.phone, message }),
    });

    const waResult = await waRes.json();
    const status = waRes.ok ? "sent" : "failed";

    // Log notification
    await supabase.from("notification_logs").insert({
      user_id,
      tipo,
      canal: "whatsapp",
      status,
      mensagem: message.substring(0, 500),
    });

    return new Response(JSON.stringify({ success: waRes.ok, status, data: waResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("whatsapp-notify error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
