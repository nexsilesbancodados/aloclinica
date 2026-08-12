#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsDir = join(root, "supabase", "functions");
const outputPath = join(root, "docs", "openapi.yaml");
const config = await readFile(join(root, "supabase", "config.toml"), "utf8");
const entries = (await readdir(functionsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();

const quote = (value) => JSON.stringify(value);
const verifyJwt = (name) => {
  const block = config.match(new RegExp(`\\[functions\\.${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return !block || !/verify_jwt\s*=\s*false/.test(block[1]);
};
const methodSet = (source, name) => {
  const found = [...source.matchAll(/(?:req|request)\.method\s*===\s*["']([A-Z]+)["']/g)]
    .map((match) => match[1].toLowerCase())
    .filter((method) => method !== "options");
  if (found.length) return [...new Set(found)];
  if (["robots-txt", "sitemap-xml", "doctor-ical-feed"].includes(name)) return ["get"];
  return ["post"];
};

const lines = [
  "openapi: 3.1.0",
  "info:",
  "  title: AloClinica Edge Functions",
  "  version: 1.0.0",
  "  description: >",
  "    Inventário OpenAPI gerado a partir de supabase/functions e supabase/config.toml.",
  "    Os payloads específicos permanecem definidos e validados no arquivo-fonte de cada função.",
  "servers:",
  "  - url: https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1",
  "    description: Supabase Functions em produção",
  "tags:",
  "  - name: Edge Functions",
  "paths:",
];

for (const name of entries) {
  const source = await readFile(join(functionsDir, name, "index.ts"), "utf8");
  const methods = methodSet(source, name);
  const secured = verifyJwt(name);
  lines.push(`  /${name}:`);
  for (const method of methods) {
    lines.push(`    ${method}:`);
    lines.push(`      operationId: ${name.replace(/[^a-zA-Z0-9]/g, "_")}_${method}`);
    lines.push("      tags: [Edge Functions]");
    lines.push(`      summary: ${quote(`${name} (${method.toUpperCase()})`)}`);
    lines.push(`      description: ${quote(`Contrato de transporte da Edge Function ${name}. Payload detalhado no código-fonte supabase/functions/${name}/index.ts.`)}`);
    lines.push(`      x-source: supabase/functions/${name}/index.ts`);
    lines.push(`      x-verify-jwt: ${secured}`);
    if (secured) lines.push("      security:\n        - bearerAuth: []");
    if (["post", "put", "patch"].includes(method)) {
      lines.push("      requestBody:");
      lines.push("        required: false");
      lines.push("        content:");
      lines.push("          application/json:");
      lines.push("            schema:");
      lines.push("              $ref: '#/components/schemas/JsonObject'");
    }
    lines.push("      responses:");
    lines.push("        '200':");
    lines.push("          description: Execução aceita pela função; o corpo depende do contrato da função.");
    lines.push("          content:");
    lines.push("            application/json:");
    lines.push("              schema:");
    lines.push("                $ref: '#/components/schemas/JsonObject'");
    lines.push("        '400': { description: Requisição inválida }");
    if (secured) lines.push("        '401': { description: JWT ausente ou inválido }");
    lines.push("        '500': { description: Erro interno da função }");
  }
}

lines.push(
  "components:",
  "  securitySchemes:",
  "    bearerAuth:",
  "      type: http",
  "      scheme: bearer",
  "      bearerFormat: JWT",
  "  schemas:",
  "    JsonObject:",
  "      type: object",
  "      additionalProperties: true",
  "    Error:",
  "      type: object",
  "      properties:",
  "        error: { type: string }",
  "        message: { type: string }",
  "      additionalProperties: true",
  "x-generation:",
  "  source: supabase/functions/*/index.ts",
  "  policy: supabase/config.toml",
  "  note: Payloads must be expanded from source before publishing an external SDK.",
);

const generated = `${lines.join("\n")}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try { current = await readFile(outputPath, "utf8"); } catch { /* missing file handled below */ }
  if (current !== generated) {
    console.error("docs/openapi.yaml está desatualizado. Rode npm run docs:openapi.");
    process.exit(1);
  }
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log(`OpenAPI atualizado: ${entries.length} Edge Functions em ${outputPath}`);
}
