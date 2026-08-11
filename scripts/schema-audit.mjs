#!/usr/bin/env node
/**
 * Cruza os `.select("col, col")` do código com as colunas declaradas em
 * src/integrations/supabase/types.ts e aponta o que não bate.
 *
 * ATENÇÃO ANTES DE AGIR NO RESULTADO: hoje o types.ts e a cadeia de migrations
 * descrevem esquemas diferentes (ver BLOCKED_TASKS.md, seção 2), então este
 * script acusa ~149 divergências que podem ser todas falso positivo. Ele só
 * vira ferramenta de correção depois que alguém confirmar o esquema real no
 * banco e regerar o types.ts. Até lá serve para medir o tamanho da divergência.
 *
 * Uso: node scripts/schema-audit.mjs   (na raiz do projeto)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const types = read(path.join(ROOT, "src/integrations/supabase/types.ts"));

// ── 1. tabela -> colunas, lendo os blocos "Row: { ... }" ──────────────────────
const tables = new Map();
const tableRe = /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm;
for (const m of types.matchAll(tableRe)) {
  const [, table, body] = m;
  const cols = new Set();
  for (const line of body.split("\n")) {
    const c = line.match(/^ {10}(\w+)\??:/);
    if (c) cols.add(c[1]);
  }
  if (cols.size) tables.set(table, cols);
}

// ── 2. varre o código ────────────────────────────────────────────────────────
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
};

const files = [
  ...walk(path.join(ROOT, "src")),
  ...(fs.existsSync(path.join(ROOT, "supabase/functions")) ? walk(path.join(ROOT, "supabase/functions")) : []),
].filter((f) => !f.includes("types.ts"));

// .from("tabela") ... .select("colunas")  — o select pode estar em outra linha
const queryRe = /\.from\(\s*["'`](\w+)["'`]\s*\)\s*([\s\S]{0,200}?)\.select\(\s*["'`]([^"'`]*)["'`]/g;

const problems = [];
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(queryRe)) {
    const [full, table, , selectList] = m;
    const known = tables.get(table);
    if (!known) continue; // tabela não existe nos types — reportada à parte
    if (selectList.includes("*")) continue;

    const line = src.slice(0, m.index).split("\n").length;
    for (let raw of selectList.split(",")) {
      raw = raw.trim();
      if (!raw) continue;
      if (raw.includes("(")) continue;      // embed de relação: plans(name)
      if (raw.includes(")")) continue;
      const col = raw.includes(":") ? raw.split(":").pop().trim() : raw;
      if (!/^\w+$/.test(col)) continue;
      if (!known.has(col)) {
        problems.push({ file: path.relative(ROOT, file), line, table, col });
      }
    }
  }
}

// ── 3. tabelas referenciadas que não existem ─────────────────────────────────
const unknownTables = new Map();
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
    const t = m[1];
    if (tables.has(t)) continue;
    if (!unknownTables.has(t)) unknownTables.set(t, new Set());
    unknownTables.get(t).add(path.relative(ROOT, file));
  }
}

console.log(`tabelas conhecidas em types.ts: ${tables.size}\n`);

console.log(`=== COLUNAS INEXISTENTES (${problems.length}) ===`);
for (const p of problems) {
  console.log(`${p.file}:${p.line}  ${p.table}.${p.col}`);
}

console.log(`\n=== TABELAS FORA DE types.ts (${unknownTables.size}) ===`);
for (const [t, where] of [...unknownTables].sort()) {
  console.log(`${t.padEnd(34)} ${[...where].slice(0, 3).join(", ")}`);
}
