#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const reportPath = process.argv[2] ?? "monitor-report.json";
const report = JSON.parse(await readFile(reportPath, "utf8"));
const failed = report.results.filter((item) => !item.ok && !item.skipped);
const lines = [
  `AloClinica: ${failed.length} alerta(s) de produção em ${report.checkedAt}`,
  ...failed.map((item) => `- ${item.name}: ${item.error ?? item.status ?? "falha"}`),
];
console.log(lines.join("\n"));

const webhook = process.env.ALERT_WEBHOOK_URL;
if (!webhook) {
  console.log("ALERT_WEBHOOK_URL não configurado; o workflow registrará um incidente no GitHub.");
  process.exit(0);
}

const response = await fetch(webhook, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: lines.join("\n"), text: lines.join("\n"), report }),
});
if (!response.ok) throw new Error(`Webhook de alerta retornou HTTP ${response.status}`);
