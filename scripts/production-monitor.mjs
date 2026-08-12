#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const [key, inlineValue] = token.split("=");
  const next = process.argv[i + 1];
  const value = inlineValue ?? (!next?.startsWith("--") ? next : "true");
  if (inlineValue === undefined && next && !next.startsWith("--")) i += 1;
  args.set(key.slice(2), value);
}

const timeoutMs = Number(args.get("timeout") ?? process.env.MONITOR_TIMEOUT_MS ?? 12_000);
const site = String(args.get("target") ?? process.env.PROD_SITE_URL ?? "https://aloclinica.com.br").replace(/\/$/, "");
const ref = process.env.SUPABASE_PROJECT_REF ?? "pwxvvimdtmvziynbspgx";
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const results = [];

const checkHttp = async (name, url, accepted = [200], critical = true) => {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "aloclinica-production-monitor/1.0" } });
    results.push({ name, kind: "http", status: response.status, latencyMs: Math.round(performance.now() - started), ok: accepted.includes(response.status), critical, url });
  } catch (error) {
    results.push({ name, kind: "http", status: "ERR", latencyMs: Math.round(performance.now() - started), ok: false, critical, error: error?.message ?? String(error), url });
  } finally {
    clearTimeout(timer);
  }
};

const querySupabase = async (sql) => {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return null;
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Supabase Management API HTTP ${response.status}`);
  return response.json();
};

const parseRows = (payload) => Array.isArray(payload) ? payload : payload?.result ?? payload?.data ?? [];

const checkDatabaseSignals = async () => {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    results.push({ name: "database-activity", kind: "configuration", ok: false, critical: true, error: "SUPABASE_ACCESS_TOKEN não configurado; backup e falhas recentes não podem ser monitorados" });
    return;
  }
  try {
    const [backupPayload, failuresPayload, paymentPayload, notificationPayload] = await Promise.all([
      querySupabase("select max(created_at) as last_backup from public.activity_logs where action = 'daily_backup_run';"),
      querySupabase("select action, count(*)::int as total from public.activity_logs where created_at > now() - interval '15 minutes' and (action ilike '%fail%' or action ilike '%error%') group by action order by total desc;"),
      querySupabase("select status, count(*)::int as total from public.payment_transactions where created_at > now() - interval '15 minutes' and status in ('failed', 'refunded_failed') group by status order by total desc;"),
      querySupabase("select channel, status, count(*)::int as total from public.notification_log where created_at > now() - interval '15 minutes' and status in ('failed', 'bounced') and channel in ('email', 'whatsapp') group by channel, status order by total desc;"),
    ]);
    const backupRow = parseRows(backupPayload)[0] ?? {};
    const lastBackup = backupRow.last_backup ? new Date(backupRow.last_backup) : null;
    const backupAgeHours = lastBackup ? (Date.now() - lastBackup.getTime()) / 3_600_000 : Infinity;
    results.push({ name: "daily-backup", kind: "database", ok: backupAgeHours <= 26, critical: true, lastBackup: lastBackup?.toISOString() ?? null, ageHours: Number(backupAgeHours.toFixed(2)) });
    const failures = parseRows(failuresPayload);
    results.push({ name: "recent-operation-failures", kind: "database", ok: failures.length === 0, critical: false, failures });
    const paymentFailures = parseRows(paymentPayload);
    results.push({ name: "payment-failures", kind: "database", ok: paymentFailures.length === 0, critical: false, failures: paymentFailures });
    const notificationFailures = parseRows(notificationPayload);
    results.push({ name: "notification-failures", kind: "database", ok: notificationFailures.length === 0, critical: false, failures: notificationFailures });
  } catch (error) {
    results.push({ name: "database-activity", kind: "database", ok: false, critical: true, error: error?.message ?? String(error) });
  }
};

const checkVps = async () => {
  const host = process.env.VPS_HOST;
  const key = process.env.VPS_SSH_KEY;
  if (!host || !key) {
    results.push({ name: "vps-metrics", kind: "configuration", ok: false, critical: true, error: "VPS_HOST/VPS_SSH_KEY não configurados; CPU, memória e disco não podem ser monitorados" });
    return;
  }
  const user = process.env.VPS_USER ?? "root";
  const command = "set -eu; echo __STATS__; docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemPerc}}'; echo __MEM__; free -m | awk 'NR==2 {print $2\"|\"$3\"|\"$7}'; echo __DISK__; df -P / | awk 'NR==2 {print $5}'; echo __TURN__; docker ps --format '{{.Names}}'; echo __TURN_PORTS__; ss -lunH 2>/dev/null | awk '{print $5}' | grep -E '(3478|5349)$' || true";
  try {
    const sshArgs = ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];
    const knownHostsFile = process.env.VPS_KNOWN_HOSTS_FILE;
    if (knownHostsFile) {
      // The workflow can provide a pinned known_hosts file. accept-new keeps
      // first-run monitoring non-interactive while still rejecting changes
      // after a key has been recorded.
      sshArgs.push("-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${knownHostsFile}`);
    }
    sshArgs.push(`${user}@${host}`, command);
    const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: timeoutMs });
    const statsBlock = stdout.split("__STATS__")[1]?.split("__MEM__")[0] ?? "";
    const memBlock = stdout.split("__MEM__")[1]?.split("__DISK__")[0]?.trim() ?? "";
    const disk = Number.parseFloat((stdout.split("__DISK__")[1] ?? "").split("__TURN__")[0].replace("%", "").trim());
    const turnContainersBlock = stdout.split("__TURN__")[1]?.split("__TURN_PORTS__")[0] ?? "";
    const turnPortsBlock = stdout.split("__TURN_PORTS__")[1] ?? "";
    const turnContainerDetected = turnContainersBlock.split(/\r?\n/).some((name) => /(^|[-_])(coturn|turnserver)([-_.]|$)/i.test(name.trim()));
    const turnUdpListenerDetected = turnPortsBlock.split(/\r?\n/).some((line) => /(3478|5349)\s*$/.test(line.trim()));
    results.push({
      name: "coturn",
      kind: "turn-relay",
      ok: turnContainerDetected || turnUdpListenerDetected,
      critical: true,
      containerDetected: turnContainerDetected,
      udpListenerDetected: turnUdpListenerDetected,
    });
    for (const line of statsBlock.trim().split(/\r?\n/).filter(Boolean)) {
      const [name, cpuText, memoryText] = line.split("|");
      const cpu = Number.parseFloat(cpuText);
      const memory = Number.parseFloat(memoryText);
      results.push({ name: `container-${name}`, kind: "container", ok: cpu < 95 && memory < 95, critical: false, cpuPercent: cpu, memoryPercent: memory });
    }
    const [total, used, available] = memBlock.split("|").map(Number);
    const memoryPercent = total > 0 ? ((used / total) * 100) : 0;
    results.push({ name: "vps-memory", kind: "vps", ok: memoryPercent < 95, critical: false, totalMb: total, usedMb: used, availableMb: available, memoryPercent: Number(memoryPercent.toFixed(1)) });
    results.push({ name: "vps-disk", kind: "vps", ok: disk < 90, critical: true, diskPercent: disk });
  } catch (error) {
    results.push({ name: "vps-metrics", kind: "vps", ok: false, critical: true, error: error?.message ?? String(error) });
  }
};

await Promise.all([
  checkHttp("site-health", `${site}/health`),
  checkHttp("site-status", `${site}/status`),
  checkHttp("video", process.env.MEET_URL ?? "https://meet.telemedicinaaloclinica.sbs/"),
  checkHttp("kyc", process.env.FACE_URL ?? "https://face.aloclinica.com.br/"),
  checkHttp("whatsapp", process.env.WHATSAPP_URL ?? "https://whatsapp.telemedicinaaloclinica.sbs/", [200, 401, 403], false),
  checkHttp("database-rest", `https://${ref}.supabase.co/rest/v1/`, [200, 401, 403]),
]);
if (supabaseKey) results.find((item) => item.name === "database-rest").headersConfigured = true;
await Promise.all([checkDatabaseSignals(), checkVps()]);

const report = { checkedAt: new Date().toISOString(), site, results, failed: results.filter((item) => !item.ok && !item.skipped).length };
if (args.has("json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Production monitor: ${report.checkedAt}`);
  console.table(results.map(({ name, ok, status, latencyMs, critical, skipped, error }) => ({ name, ok, status: status ?? (skipped ? "skipped" : ""), latencyMs: latencyMs ?? "", critical: critical ?? "", error: error ?? "" })));
}
if (report.failed > 0) process.exit(1);
