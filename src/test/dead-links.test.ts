import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guarda contra link morto: rota referenciada na UI que não tem <Route>
 * registrado. Sem <Route>, o fallback do Dashboard redireciona para
 * /dashboard e o do App cai no NotFound — nos dois casos o usuário clica e
 * "não acontece nada", que é o pior tipo de bug de navegação porque não gera
 * erro nenhum.
 *
 * O teste não exige zero links mortos: exige que a lista não cresça. Cada
 * entrada de KNOWN_MISSING é uma página que a UI promete e o app ainda não
 * tem — está documentada em BLOCKED_TASKS.md. Ao implementar a página, remova
 * a linha daqui.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/** Páginas prometidas pela UI que ainda não existem. Só diminui. */
const KNOWN_MISSING = [
  "/dashboard/admin/subscriptions",
  "/dashboard/clinic/my-exams",
  "/dashboard/doctor/analytics",
  "/dashboard/partner/history",
  "/dashboard/partner/validate",
  "/dashboard/plans",
  "/dashboard/prescribe",
  "/dashboard/reception/checkin",
  "/dashboard/reception/patients",
  "/dashboard/reception/schedules",
  "/dashboard/reception/waiting",
];

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
};

const readRegisteredRoutes = () => {
  const app = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(SRC, "pages", "Dashboard.tsx"), "utf8");

  const topLevel = [...app.matchAll(/path="(\/[a-zA-Z0-9/:_-]*)"/g)].map((m) => m[1]);
  // As rotas do Dashboard são relativas ao <Route path="/dashboard/*">.
  const nested = [...dashboard.matchAll(/path="([a-zA-Z0-9/:_-]+)"/g)].map((m) => `/dashboard/${m[1]}`);

  return new Set([...topLevel, ...nested, "/dashboard"]);
};

const collectReferencedRoutes = () => {
  const files = walk(SRC).filter((f) => !f.includes(`${path.sep}test${path.sep}`) && !f.includes("__tests__"));
  // to= / navigate( / href= / path: / route: — as cinco formas usadas no projeto.
  //
  // O caminho precisa terminar em aspas, `?` ou `#`. Isso descarta o prefixo
  // estático de template literal (`/dashboard/appointments/${id}` capturaria
  // "/dashboard/appointments/", que não é rota nenhuma) mas mantém as rotas
  // com query string, onde vários links mortos se escondiam.
  const linkPattern = /(?:to=|navigate\(|href=|path:\s*|route:\s*)["'`](\/[a-zA-Z0-9/_-]+)["'`?#]/g;

  const refs = new Map<string, Set<string>>();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(linkPattern)) {
      const route = match[1];
      if (!refs.has(route)) refs.set(route, new Set());
      refs.get(route)!.add(path.relative(SRC, file).replace(/\\/g, "/"));
    }
  }
  return refs;
};

const matchesRegistered = (route: string, registered: Set<string>) => {
  if (registered.has(route)) return true;
  // Rota dinâmica: /dashboard/appointments/:id casa com /dashboard/appointments/123
  const segments = route.split("/").filter(Boolean);
  return [...registered]
    .filter((r) => r.includes(":"))
    .some((candidate) => {
      const candidateSegments = candidate.split("/").filter(Boolean);
      if (candidateSegments.length !== segments.length) return false;
      return candidateSegments.every((seg, i) => seg.startsWith(":") || seg === segments[i]);
    });
};

describe("navegação — links mortos", () => {
  const registered = readRegisteredRoutes();
  const referenced = collectReferencedRoutes();

  const dead = [...referenced.keys()].filter((route) => !matchesRegistered(route, registered)).sort();

  it("encontra as rotas registradas (sanidade do parser)", () => {
    // Se o parser quebrar, tudo vira "link morto" — esta âncora evita
    // um falso verde e um falso vermelho.
    expect(registered.size).toBeGreaterThan(100);
    expect(registered.has("/dashboard/admin/panel-center")).toBe(true);
    expect(registered.has("/terms")).toBe(true);
    expect(registered.has("/privacy")).toBe(true);
    expect(referenced.size).toBeGreaterThan(50);
  });

  it("não introduz link morto novo", () => {
    const unexpected = dead.filter((route) => !KNOWN_MISSING.includes(route));
    const detail = unexpected
      .map((route) => `${route}  <- ${[...(referenced.get(route) ?? [])].join(", ")}`)
      .join("\n");

    expect(unexpected, `Rotas referenciadas sem <Route> registrado:\n${detail}`).toEqual([]);
  });

  it("mantém KNOWN_MISSING enxuto (remova a entrada ao criar a página)", () => {
    const resolved = KNOWN_MISSING.filter((route) => matchesRegistered(route, registered));
    expect(resolved, `Estas rotas já existem — remova de KNOWN_MISSING: ${resolved.join(", ")}`).toEqual([]);
  });

  it("as páginas legais do rodapé resolvem (LGPD)", () => {
    // /termos e /privacidade eram links mortos no rodapé; as rotas reais são
    // /terms e /privacy. Página legal inacessível é problema de conformidade.
    const footer = fs.readFileSync(path.join(SRC, "components", "landing", "Footer.tsx"), "utf8");
    expect(footer).toContain('to="/terms"');
    expect(footer).toContain('to="/privacy"');
    expect(footer).not.toContain('to="/termos"');
    expect(footer).not.toContain('to="/privacidade"');
  });
});
