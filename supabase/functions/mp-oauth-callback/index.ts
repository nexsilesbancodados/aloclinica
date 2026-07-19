/**
 * mp-oauth-callback — recebe o `code` do OAuth do Mercado Pago,
 * troca por {access_token, refresh_token, user_id} e salva em
 * doctor_profiles.mp_*. Em seguida redireciona o médico para o painel
 * com `?mp=ok` (ou `?mp=err` em caso de falha).
 *
 * Configurado como Redirect URI no painel MP:
 *   https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/mp-oauth-callback
 *
 * Requer env:
 *   MERCADOPAGO_APP_ID, MERCADOPAGO_CLIENT_SECRET (no painel Supabase)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REDIRECT_URI = "https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/mp-oauth-callback";
const FINAL_REDIRECT = "https://aloclinica.com.br/dashboard/profile";

function html(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // doctor user_id
    const err = url.searchParams.get("error");

    if (err) return redirect(`${FINAL_REDIRECT}?mp=err&reason=${encodeURIComponent(err)}`);
    if (!code || !state) {
      return html('<h1>Parâmetros faltando</h1><p>Volte ao painel e tente novamente.</p>');
    }

    const appId = Deno.env.get("MERCADOPAGO_APP_ID");
    const clientSecret = Deno.env.get("MERCADOPAGO_CLIENT_SECRET");
    if (!appId || !clientSecret) {
      return html('<h1>Marketplace não configurado</h1><p>O administrador da plataforma precisa cadastrar MERCADOPAGO_APP_ID e MERCADOPAGO_CLIENT_SECRET.</p>');
    }

    // Troca code por tokens
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.error("MP oauth error:", tokenRes.status, tokenJson);
      return redirect(`${FINAL_REDIRECT}?mp=err&reason=token_exchange`);
    }

    const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in ?? 0) * 1000).toISOString();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // === ANTI-SEQUESTRO DE CONTA DE RECEBIMENTO ===
    // `state` chega do MP SEM autenticação — o front monta a URL de autorização
    // com state=<user_id> em texto claro. Um atacante pode autorizar a PRÓPRIA
    // conta MP passando o user_id de um médico legítimo; sem validação, os
    // tokens de recebimento (collector) desse médico seriam sobrescritos e os
    // repasses das consultas dele passariam a cair na conta do atacante.
    // Mitigações mínimas aplicadas aqui (sem alterar o fluxo do front):
    //   1) state precisa ser um UUID de um médico EXISTENTE (usuário legítimo);
    //   2) se o médico JÁ tem uma conta MP conectada, só permitimos reconectar a
    //      MESMA conta (mp_user_id igual). Trocar de conta exige desconectar
    //      antes (a UI zera mp_user_id) — logo, sem regressão para o legítimo.
    // Resíduo conhecido: a PRIMEIRA vinculação (mp_user_id nulo) ainda confia no
    // state. Fechar 100% exige um state assinado/nonce por usuário gerado no
    // início do fluxo (UserProfile.tsx), fora da área de payments. Ver resumo.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(state)) {
      return redirect(`${FINAL_REDIRECT}?mp=err&reason=invalid_state`);
    }
    const { data: docRow } = await sb
      .from("doctor_profiles")
      .select("mp_user_id")
      .eq("user_id", state)
      .maybeSingle();
    if (!docRow) {
      return redirect(`${FINAL_REDIRECT}?mp=err&reason=invalid_state`);
    }
    if (docRow.mp_user_id && docRow.mp_user_id !== String(tokenJson.user_id)) {
      console.warn("[mp-oauth-callback] bloqueado: tentativa de vincular conta MP diferente ao user", state);
      return redirect(`${FINAL_REDIRECT}?mp=err&reason=already_connected`);
    }

    const { error: upErr } = await sb.from("doctor_profiles").update({
      mp_user_id: String(tokenJson.user_id),
      mp_access_token: tokenJson.access_token,
      mp_refresh_token: tokenJson.refresh_token ?? null,
      mp_token_expires_at: expiresAt,
      mp_connected_at: new Date().toISOString(),
    } as any).eq("user_id", state);

    if (upErr) {
      console.error("doctor_profiles update error:", upErr);
      return redirect(`${FINAL_REDIRECT}?mp=err&reason=db_update`);
    }

    return redirect(`${FINAL_REDIRECT}?mp=ok`);
  } catch (e: any) {
    console.error("mp-oauth-callback fatal:", e?.message);
    return redirect(`${FINAL_REDIRECT}?mp=err&reason=internal`);
  }
});
