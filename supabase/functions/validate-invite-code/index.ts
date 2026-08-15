import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * O primeiro IP de `x-forwarded-for` é o do cliente; os seguintes são os
 * proxies do caminho.
 */
const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip")?.trim() ||
  "unknown";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, user_id } = await req.json();

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return new Response(JSON.stringify({ valid: false, error: "Código inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A função é pública (`verify_jwt = false`) e diz, código a código, se ele
    // existe e está disponível. Sem limite, é um oráculo de enumeração: quem
    // acertar um código vira médico via `assign-role`. O limite é por IP porque
    // a maioria das chamadas legítimas é anônima (tela de cadastro médico).
    const caller = await getCaller(req);
    const identifier = caller.user?.id ? `user:${caller.user.id}` : `ip:${clientIp(req)}`;
    if (!(await checkRateLimit(identifier, "validate-invite-code", 10, 10))) {
      return new Response(
        JSON.stringify({ valid: false, error: "Muitas tentativas. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("doctor_invite_codes")
      .select("id, code, is_used, expires_at")
      .eq("code", code.trim().toUpperCase())
      .eq("is_used", false)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ valid: false, error: "Código não encontrado ou já utilizado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, error: "Código expirado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Consumo do código. `user_id` vinha do corpo da requisição numa função
    // pública: qualquer um podia queimar o convite de um médico legítimo e
    // ainda gravar `used_by` apontando para terceiro. O dono do convite passa a
    // sair do JWT; o corpo, quando presente, precisa concordar com ele.
    //
    // O consumo autoritativo continua em `assign-role`, que valida o convite ao
    // conceder o papel de médico. Aqui ele é apenas o atalho já existente.
    if (user_id) {
      if (!caller.user) {
        return new Response(JSON.stringify({ valid: false, error: "Não autenticado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id !== caller.user.id) {
        return new Response(JSON.stringify({ valid: false, error: "Sem permissão" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: consumeError } = await supabase
        .from("doctor_invite_codes")
        .update({
          is_used: true,
          used_at: new Date().toISOString(),
          used_by: caller.user.id,
        })
        .eq("id", data.id)
        .eq("is_used", false);
      if (consumeError) {
        console.error("[validate-invite-code] falha ao consumir código:", consumeError.message);
        return new Response(JSON.stringify({ valid: false, error: "Erro interno" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ valid: true, code_id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false, error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
