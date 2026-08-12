#!/usr/bin/env node
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["OpenAPI is up to date", ["run", "docs:openapi:check"]],
  ["ESLint", ["run", "lint"]],
  ["TypeScript", ["exec", "--", "tsc", "--noEmit"]],
  ["Vitest", ["run", "test", "--", "--run"]],
  ["Production build", ["run", "build"]],
  ["Production security audit", ["run", "audit:production"]],
  ["Playwright E2E", ["run", "test:e2e"]],
];

if (process.env.RUN_PRODUCTION_HEALTH === "true") {
  checks.push(["Production health", ["run", "health:production", "--", "--json"]]);
}

const run = (label, args) => new Promise((resolve) => {
  console.log(`\n=== ${label} ===`);
  const child = spawn(npm, args, {
    stdio: "inherit",
    env: process.env,
    // Node 24 cannot spawn the npm.cmd shim directly on Windows.
    shell: process.platform === "win32",
  });
  child.on("error", (error) => {
    console.error(`${label}: ${error.message}`);
    resolve(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) console.error(`${label}: terminated by ${signal}`);
    resolve(code ?? 1);
  });
});

const failures = [];
for (const [label, args] of checks) {
  if ((await run(label, args)) !== 0) failures.push(label);
}

if (failures.length > 0) {
  console.error(`\nChecks failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} platform checks passed.`);
