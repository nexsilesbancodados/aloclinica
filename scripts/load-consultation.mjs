#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}

const concurrency = Math.min(150, Math.max(1, Number(args.get("concurrency") ?? process.env.LOAD_CONCURRENCY ?? 25)));
const durationSeconds = Math.min(300, Math.max(5, Number(args.get("duration") ?? process.env.LOAD_DURATION_SECONDS ?? 30)));
const intervalMs = Math.min(10_000, Math.max(250, Number(args.get("interval") ?? 1_000)));
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const client = createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 100 } } });
const subscribeLatencies = [];
const broadcastLatencies = [];
let failed = 0;
const sendStatuses = {};
const subscribeStatuses = {};

const subscribe = (channel) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve("TIMED_OUT"), 12_000);
  channel.subscribe((status) => {
    if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      clearTimeout(timer);
      resolve(status);
    }
  });
});

const worker = async (index) => {
  const channel = client.channel(`load-consultation-${runId}-${index}`, {
    config: { broadcast: { self: true }, presence: { key: `load-${index}` } },
  });
  const started = performance.now();
  const status = await subscribe(channel);
  subscribeStatuses[status] = (subscribeStatuses[status] ?? 0) + 1;
  subscribeLatencies.push(performance.now() - started);
  if (status !== "SUBSCRIBED") {
    failed += 1;
    await channel.unsubscribe();
    return;
  }

  const endAt = Date.now() + durationSeconds * 1_000;
  while (Date.now() < endAt) {
    const sendStarted = performance.now();
    try {
      const result = await channel.send({
        type: "broadcast",
        event: "load_probe",
        payload: { index, at: Date.now() },
      });
      broadcastLatencies.push(performance.now() - sendStarted);
      const sendStatus = typeof result === "string" ? result : result?.status ?? "unknown";
      sendStatuses[sendStatus] = (sendStatuses[sendStatus] ?? 0) + 1;
      if (!["ok", "unknown"].includes(sendStatus)) failed += 1;
    } catch {
      sendStatuses.exception = (sendStatuses.exception ?? 0) + 1;
      failed += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await channel.unsubscribe();
};

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
};

console.log(`Realtime consultation signaling load: ${concurrency} channels for ${durationSeconds}s`);
console.log("This test exercises Supabase Realtime signaling only; it does not create appointments, payments, recordings, or media streams.");
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
await client.removeAllChannels();

const result = {
  checkedAt: new Date().toISOString(),
  concurrency,
  durationSeconds,
  failed,
  subscribeP50Ms: percentile(subscribeLatencies, 50),
  subscribeP95Ms: percentile(subscribeLatencies, 95),
  broadcastP50Ms: percentile(broadcastLatencies, 50),
  broadcastP95Ms: percentile(broadcastLatencies, 95),
  subscribeStatuses,
  sendStatuses,
};
console.table([result]);
if (failed > 0) process.exit(1);
