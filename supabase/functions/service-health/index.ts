// service-health — verificação REAL (não-destrutiva) da saúde dos serviços dos
// quais a plataforma depende, para alimentar o alerta e a página "Saúde do
// Sistema" no painel admin.
//
// Ao contrário de um simples "a função existe?", aqui cada serviço externo é
// realmente sondado (ping autenticado, sem efeitos colaterais):
//   • Banco (PostgreSQL)        • WhatsApp (Evolution API)
//   • E-mail (Brevo)            • Vídeo (MiroTalk)
//   • KYC facial (CompreFace)   • Pagamentos (Mercado Pago)
//   • NFS-e (Focus NFe)
//
// Só ADMIN pode chamar (getCaller.isAdmin). Retorna apenas status/latência —
// nunca expõe segredos.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller } from "../_shared/auth.ts";
import { normalizeEvolutionUrl } from "../_shared/evolution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Status = "ok" | "down" | "unconfigured";
interface Probe { status: Status; detail: string; }

const TIMEOUT = 6000;
const trimSlash = (u: string) => u.replace(/\/+$/, "");

/** Sonda HTTP genérica: considera "up" qualquer resposta < 500 (serviço no ar),
 *  a menos que `okStatuses` seja informado. Erro de rede/timeout = down. */
async function reachable(url: string, opts: { headers?: Record<string, string>; okStatuses?: number[] } = {}): Promise<Probe> {
  const res = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(TIMEOUT) });
  const ok = opts.okStatuses ? opts.okStatuses.includes(res.status) : res.status < 500;
  return { status: ok ? "ok" : "down", detail: ok ? `Respondendo (HTTP ${res.status})` : `HTTP ${res.status}` };
}

// ── Definição dos serviços ────────────────────────────────────────────────
const SERVICES: { key: string; label: string; critical: boolean; run: () => Promise<Probe> }[] = [
  {
    key: "database", label: "Banco de Dados (PostgreSQL)", critical: true,
    run: async () => {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { error } = await svc.from("specialties").select("id").limit(1);
      return error ? { status: "down", detail: error.message } : { status: "ok", detail: "PostgreSQL respondendo" };
    },
  },
  {
    key: "whatsapp", label: "WhatsApp (Evolution API)", critical: true,
    run: async () => {
      const rawUrl = Deno.env.get("EVOLUTION_API_URL");
      const key = Deno.env.get("EVOLUTION_API_KEY");
      if (!rawUrl) return { status: "unconfigured", detail: "EVOLUTION_API_URL não definido" };
      const url = normalizeEvolutionUrl(rawUrl);
      if (!url) {
        return {
          status: "down",
          detail: "EVOLUTION_API_URL precisa usar HTTPS com certificado válido",
        };
      }
      return reachable(`${url}/instance/fetchInstances`, {
        headers: key ? { apikey: key } : {}, okStatuses: [200],
      });
    },
  },
  {
    key: "email", label: "E-mail (Brevo)", critical: true,
    run: async () => {
      const key = Deno.env.get("BREVO_API_KEY");
      if (!key) return { status: "unconfigured", detail: "BREVO_API_KEY não definido" };
      return reachable("https://api.brevo.com/v3/account", {
        headers: { "api-key": key, accept: "application/json" }, okStatuses: [200],
      });
    },
  },
  {
    key: "video", label: "Vídeo (MiroTalk)", critical: true,
    run: async () => {
      const url = Deno.env.get("MIROTALK_URL");
      if (!url) return { status: "unconfigured", detail: "MIROTALK_URL não definido" };
      return reachable(trimSlash(url));
    },
  },
  {
    key: "kyc", label: "KYC facial (CompreFace)", critical: true,
    run: async () => {
      const url = Deno.env.get("COMPREFACE_URL");
      if (!url) return { status: "unconfigured", detail: "COMPREFACE_URL não definido" };
      return reachable(trimSlash(url));
    },
  },
  {
    key: "payments", label: "Pagamentos (Mercado Pago)", critical: true,
    run: async () => {
      // Sem token global (marketplace usa OAuth por vendedor): sonda de alcance.
      // 401 sem token = serviço no ar. Só erro de rede conta como falha.
      return reachable("https://api.mercadopago.com/v1/payment_methods", { okStatuses: [200, 401] });
    },
  },
  {
    key: "nfse", label: "NFS-e (Focus NFe)", critical: false,
    run: async () => {
      const token = Deno.env.get("FOCUS_NFE_TOKEN");
      if (!token) return { status: "unconfigured", detail: "Aguardando contador (token Focus não definido)" };
      const amb = (Deno.env.get("FOCUS_NFE_AMBIENTE") ?? "homologacao").toLowerCase();
      const base = amb === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
      return reachable(`${base}/v2/empresas`, {
        headers: { Authorization: "Basic " + btoa(`${token}:`) }, okStatuses: [200, 401, 403],
      });
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const caller = await getCaller(req);
  if (!caller.user) return json({ error: "não autenticado" }, 401);
  if (!caller.isAdmin) return json({ error: "acesso restrito a administradores" }, 403);

  const services = await Promise.all(
    SERVICES.map(async (svc) => {
      const t0 = Date.now();
      try {
        const r = await svc.run();
        return { key: svc.key, label: svc.label, critical: svc.critical, status: r.status, detail: r.detail, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { key: svc.key, label: svc.label, critical: svc.critical, status: "down" as Status, detail: (e instanceof Error ? e.message : "Sem resposta"), latencyMs: Date.now() - t0 };
      }
    }),
  );

  return json({ checkedAt: new Date().toISOString(), services });
});
