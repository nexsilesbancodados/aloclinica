#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const findings = [];

function add(level, area, message, file = "") {
  findings.push({ level, area, message, file });
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir, files = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const relative = join(dir, entry).replace(/\\/g, "/");
    const full = join(root, relative);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(relative, files);
    else files.push(relative);
  }
  return files;
}

const expectedPublicFunctions = new Set([
  "mercadopago-webhook",
  "pagbank-webhook",
  "docuseal-webhook",
  "vidaas-callback",
  "robots-txt",
  "sitemap-xml",
  "guest-checkout",
  "guest-consultation",
  "validate-invite-code",
  "validate-laudo",
  "validate-council",
  "b2b-lead-notification",
  "create-admin-account",
  "process-refund",
  "seed-test-doctors",
  "seed-test-users",
  "daily-backup",
  "scheduled-tasks",
  "appointment-reminders",
  "appointment-confirmed",
  "lembrete-consultas",
  "cart-abandonment",
  "notify-expired-prescriptions",
  "weekly-admin-report",
  "ai-ticket-triage",
  "auto-clinical-summary",
  "suggest-reschedule",
  "verify-crm",
  "rate-limiter",
]);

const config = read("supabase/config.toml");
const publicFunctionMatches = [...config.matchAll(/\[functions\.([^\]]+)\]\s*\nverify_jwt\s*=\s*false/g)];
for (const match of publicFunctionMatches) {
  const name = match[1];
  if (!expectedPublicFunctions.has(name)) {
    add("error", "supabase", `Unexpected public edge function: ${name}`, "supabase/config.toml");
  }
}

for (const sensitive of ["assign-role", "admin-reset-password", "mercadopago-charge-saved-card", "withdraw", "lgpd-export-user"]) {
  if (config.includes(`[functions.${sensitive}]\nverify_jwt = false`)) {
    add("error", "supabase", `Sensitive function disables JWT: ${sensitive}`, "supabase/config.toml");
  }
}

const client = read("src/integrations/supabase/client.ts");
const supabaseConfig = read("src/lib/supabase-config.ts");
if (!client.includes("@/lib/supabase-config") || !supabaseConfig.includes("import.meta.env.VITE_SUPABASE_URL")) {
  add("warn", "env", "Supabase URL should read VITE_SUPABASE_URL through centralized config.", "src/lib/supabase-config.ts");
}
if (!client.includes("@/lib/supabase-config") || !supabaseConfig.includes("import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY")) {
  add("warn", "env", "Supabase publishable key should read VITE_SUPABASE_PUBLISHABLE_KEY through centralized config.", "src/lib/supabase-config.ts");
}

const nginx = read("nginx.conf");
for (const required of [
  "Strict-Transport-Security",
  "Content-Security-Policy",
  "X-Frame-Options",
  "Permissions-Policy",
  "server_tokens off",
]) {
  if (!nginx.includes(required)) add("error", "nginx", `Missing ${required}`, "nginx.conf");
}
if (!/location \^~ \/dashboard[\s\S]+no-store/.test(nginx)) {
  add("error", "nginx", "Authenticated dashboard routes must send Cache-Control: no-store.", "nginx.conf");
}
if (!/location \^~ \/consulta[\s\S]+no-store/.test(nginx)) {
  add("error", "nginx", "Consultation routes must send Cache-Control: no-store.", "nginx.conf");
}

const workflow = read(".github/workflows/deploy.yml");
for (const required of ["npm run build", "docker compose up -d --force-recreate aloclinica-web", "https://aloclinica.com.br/health"]) {
  if (!workflow.includes(required)) add("error", "deploy", `Deploy workflow missing: ${required}`, ".github/workflows/deploy.yml");
}

const sourceFiles = walk("src").concat(walk("supabase/functions"));
const secretPatterns = [
  { label: "private api token", regex: /(sk_live_|sk_test_|SG\.[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})/ },
  { label: "service role key", regex: /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*["'][^"']{12,}["']/i },
  { label: "hardcoded password key", regex: /(SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)\s*=\s*["'][^"']{12,}["']/i },
];

for (const file of sourceFiles) {
  if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
  const content = read(file);
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(content)) {
      add("error", "secrets", `Possible hardcoded ${pattern.label}.`, file);
    }
  }
}

const errors = findings.filter((item) => item.level === "error");
const warnings = findings.filter((item) => item.level === "warn");

console.log(`Production security audit: ${new Date().toISOString()}`);
if (findings.length === 0) {
  console.log("No findings.");
} else {
  console.table(findings);
}
console.log(`Errors: ${errors.length} | Warnings: ${warnings.length}`);

if (errors.length > 0) process.exit(1);
