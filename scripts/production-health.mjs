#!/usr/bin/env node
import { lookup } from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token.startsWith("--")) {
    const [key, inlineValue] = token.split("=");
    const next = process.argv[i + 1];
    const value = inlineValue ?? (!next?.startsWith("--") ? next : "true");
    if (inlineValue === undefined && next && !next.startsWith("--")) i += 1;
    args.set(key.slice(2), value);
  }
}

const firstNonEmpty = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
const timeoutMs = Number(firstNonEmpty(args.get("timeout"), process.env.HEALTH_TIMEOUT_MS, 12000));
const maxAttempts = Math.max(1, Number(firstNonEmpty(args.get("attempts"), process.env.HEALTH_ATTEMPTS, 2)) || 2);
const baseUrl = String(firstNonEmpty(args.get("target"), process.env.PROD_SITE_URL, "https://aloclinica.com.br")).replace(/\/$/, "");
const supabaseRef = String(firstNonEmpty(args.get("supabase-ref"), process.env.SUPABASE_PROJECT_REF, "pwxvvimdtmvziynbspgx"));
const json = args.has("json");

const endpoints = [
  { name: "site-health", url: `${baseUrl}/health`, ok: [200], critical: true },
  { name: "site-status", url: `${baseUrl}/status`, ok: [200], critical: true },
  { name: "video-meet", url: process.env.MEET_URL ?? "https://meet.telemedicinaaloclinica.sbs/", ok: [200], critical: true },
  { name: "kyc-face", url: process.env.FACE_URL ?? "https://face.aloclinica.com.br/", ok: [200], critical: true },
  {
    name: "whatsapp-gateway",
    url: process.env.WHATSAPP_URL ?? "https://whatsapp.telemedicinaaloclinica.sbs/",
    ok: [200, 401, 403],
    critical: false,
  },
  {
    name: "supabase-rest",
    url: `https://${supabaseRef}.supabase.co/rest/v1/`,
    ok: [200, 401, 403],
    critical: true,
  },
];

function withTimeout(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error(`timeout ${ms}ms`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function checkHttp(endpoint) {
  let result;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    const startedAt = performance.now();
    const timer = withTimeout(timeoutMs);
    try {
      const response = await fetch(endpoint.url, {
        method: "GET",
        redirect: "manual",
        signal: timer.signal,
        headers: { "User-Agent": "aloclinica-production-health/1.0" },
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      result = {
        type: "http",
        name: endpoint.name,
        url: endpoint.url,
        status: response.status,
        latencyMs,
        ok: endpoint.ok.includes(response.status),
        critical: endpoint.critical,
        attempts: attempt,
      };
      if (result.ok || attempt === Math.max(1, maxAttempts)) return result;
    } catch (error) {
      result = {
        type: "http",
        name: endpoint.name,
        url: endpoint.url,
        status: "ERR",
        latencyMs: Math.round(performance.now() - startedAt),
        ok: false,
        critical: endpoint.critical,
        error: error?.message ?? String(error),
        attempts: attempt,
      };
    } finally {
      timer.clear();
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  try {
    const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";
    const { stdout } = await execFileAsync(
      curlCommand,
      [
        "--silent",
        "--show-error",
        "--output",
        process.platform === "win32" ? "NUL" : "/dev/null",
        "--write-out",
        "%{http_code}",
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        endpoint.url,
      ],
      { timeout: timeoutMs + 2_000 },
    );
    const status = Number.parseInt(stdout.trim(), 10);
    if (Number.isFinite(status) && status > 0) {
      return {
        ...result,
        status,
        ok: endpoint.ok.includes(status),
        error: undefined,
        transport: "curl-fallback",
      };
    }
  } catch {
    // Keep the original fetch error when the fallback transport also fails.
  }
  return result;
}

async function checkDns(hostname) {
  const startedAt = performance.now();
  try {
    const result = await lookup(hostname);
    return {
      type: "dns",
      name: `dns-${hostname}`,
      host: hostname,
      address: result.address,
      latencyMs: Math.round(performance.now() - startedAt),
      ok: true,
      critical: true,
    };
  } catch (error) {
    return {
      type: "dns",
      name: `dns-${hostname}`,
      host: hostname,
      latencyMs: Math.round(performance.now() - startedAt),
      ok: false,
      critical: true,
      error: error?.message ?? String(error),
    };
  }
}

async function checkVpsDocker() {
  const host = process.env.VPS_HOST;
  const key = process.env.VPS_SSH_KEY;
  const user = process.env.VPS_USER ?? "root";
  if (!host || !key) return [];

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      [
        "-i",
        key,
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        `${user}@${host}`,
        "docker ps --format '{{.Names}}|{{.Status}}'",
      ],
      { timeout: timeoutMs }
    );
    // Easypanel runs the application as Swarm services, so container names
    // include a task suffix (and underscores). Keep the checks aligned with
    // the production topology instead of the legacy standalone names.
    const required = [
      { id: "aloclinica-web", patterns: [/^aloclinica-web(?:\||$)/i, /^aloclinica_web\./i] },
      { id: "mirotalk", patterns: [/^aloclinica_mirotalk\./i, /^mirotalk(?:\||$)/i] },
      { id: "evolution-api", patterns: [/^aloclinica_evolution-api\./i, /^evolution-api(?:\||$)/i] },
      { id: "coturn", patterns: [/^coturn(?:\||$)/i, /turnserver/i] },
      { id: "compreface-api", patterns: [/^aloclinica_compreface-compreface-api-/i, /^compreface-api(?:\||$)/i] },
    ];
    const rows = stdout.trim().split(/\r?\n/).filter(Boolean);
    return required.map(({ id, patterns }) => {
      const row = rows.find((line) => patterns.some((pattern) => pattern.test(line)));
      return {
        type: "docker",
        name: `docker-${id}`,
        ok: Boolean(row) && /Up/i.test(row),
        status: row?.split("|")[1] ?? "missing",
        critical: true,
      };
    });
  } catch (error) {
    return [
      {
        type: "docker",
        name: "docker-vps",
        ok: false,
        critical: false,
        error: error?.message ?? String(error),
      },
    ];
  }
}

const hosts = [
  new URL(baseUrl).hostname,
  "meet.telemedicinaaloclinica.sbs",
  "face.aloclinica.com.br",
  "whatsapp.telemedicinaaloclinica.sbs",
];

const results = [
  ...(await Promise.all([...new Set(hosts)].map(checkDns))),
  ...(await Promise.all(endpoints.map(checkHttp))),
  ...(await checkVpsDocker()),
];

if (json) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.log(`Production health: ${new Date().toISOString()}`);
  console.table(
    results.map((item) => ({
      name: item.name,
      ok: item.ok,
      status: item.status ?? item.address ?? "",
      latencyMs: item.latencyMs ?? "",
      critical: item.critical,
      error: item.error ?? "",
    }))
  );
}

const failedCritical = results.filter((item) => item.critical && !item.ok);
if (failedCritical.length > 0) {
  console.error(`Critical health checks failed: ${failedCritical.map((item) => item.name).join(", ")}`);
  process.exit(1);
}
