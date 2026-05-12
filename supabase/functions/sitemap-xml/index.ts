import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * sitemap-xml — gera sitemap.xml dinâmico baseado em rotas conhecidas + site_sections.
 *
 * Roteamento (no front via _redirects ou no nginx):
 *   /sitemap.xml → essa função
 */

const STATIC_PAGES = [
  "/",
  "/sobre",
  "/como-funciona",
  "/especialidades",
  "/recursos",
  "/servicos",
  "/para-profissionais",
  "/para-empresas",
  "/faq",
  "/pingo-card",
  "/teleconsulta",
  "/terms",
  "/privacy",
  "/lgpd",
  "/refund-policy",
  "/cookies",
  "/accessibility",
  "/termo-telemedicina",
];

const BASE = "https://aloclinica.com.br";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Especialidades dinâmicas
  let dynamicUrls: { loc: string; lastmod?: string }[] = [];
  try {
    const { data: specs } = await supabase
      .from("specialties")
      .select("slug, updated_at")
      .eq("is_active", true)
      .limit(500);
    dynamicUrls = (specs ?? []).map((s: any) => ({
      loc: `${BASE}/especialidades/${s.slug}`,
      lastmod: s.updated_at?.slice(0, 10),
    }));
  } catch { /* tabela pode não existir; não-bloqueante */ }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_PAGES.map(p => ({ loc: BASE + p, lastmod: today, priority: p === "/" ? "1.0" : "0.7" })),
    ...dynamicUrls.map(u => ({ ...u, priority: "0.6" as string })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${(u as any).priority ?? "0.5"}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
