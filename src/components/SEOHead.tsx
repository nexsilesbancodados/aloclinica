import { useEffect } from "react";

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown>;
}

const SITE_NAME = "AloClínica — Telemedicina Online";
const DEFAULT_OG_IMAGE = "https://aloclinica.com.br/og-image.png";
// Produção; canonical/og:url devem apontar pra ela pra Google nao indexar preview
const BASE_URL = "https://aloclinica.com.br";

const upsertMeta = (attr: string, key: string, content: string) => {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
};

const upsertLink = (rel: string, href: string) => {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
};

const upsertJsonLd = (data: Record<string, unknown>) => {
  const id = "seo-jsonld";
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
};

const removeJsonLd = () => {
  document.getElementById("seo-jsonld")?.remove();
};

const SEOHead = ({ title, description, canonical, ogImage, jsonLd }: SEOHeadProps) => {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;

    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    }

    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", "AloClinica");
    upsertMeta("property", "og:image", ogImage || DEFAULT_OG_IMAGE);
    upsertMeta("name", "twitter:image", ogImage || DEFAULT_OG_IMAGE);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("property", "og:url", canonical || `${BASE_URL}${window.location.pathname}`);
    upsertMeta("property", "og:locale", "pt_BR");

    if (canonical) {
      upsertLink("canonical", canonical);
    }

    if (jsonLd) {
      upsertJsonLd(jsonLd);
    }

    return () => {
      document.title = SITE_NAME;
      removeJsonLd();
    };
  }, [title, description, canonical, ogImage, jsonLd]);

  return null;
};

export default SEOHead;
