# 📈 Revisão de Escalabilidade — suportar centenas de milhares de usuários

**Data:** 2026-07-18 · Objetivo: rota realista para 100k+ usuários numa plataforma de telemedicina.

> **Verdade que precisa ser dita:** escalar para 100k+ usuários **não é uma mudança de código que se "liga"** — é ~70% infraestrutura (nas suas contas) e ~30% código. Abaixo está o que **eu posso fazer em código** e o que **só você pode fazer na infra**. O maior gargalo hoje é arquitetural: **tudo roda num único VPS (`72.62.138.208`)** — isso não serve 100k usuários de jeito nenhum.

---

## 🔴 Gargalos que IMPEDEM escala hoje

| Gargalo | Por quê trava em escala | Dono |
|---|---|---|
| **VPS único** hospeda frontend + vídeo + KYC + DocuSeal + TURN | Um servidor = teto de CPU/rede/memória. Ponto único de falha. | Infra |
| **Vídeo (MiroTalk/coturn) num só nó** | WebRTC/SFU num VPS satura em dezenas de salas simultâneas, não milhares | Infra |
| **Sem connection pooling (PgBouncer)** | Postgres tem limite de conexões (~60-200); 100k users abrem muito mais | Infra (Supabase) |
| **546 `db.from` diretos no client, sem cache** | Cada tela refaz query; 100k users = tempestade de queries no banco | Código |
| **Sem CDN para assets e PDFs** | Todo asset/receita sai do VPS/Storage sem borda | Infra |
| **RLS chama `is_admin()`/`has_role()` por linha** | Em tabelas grandes, subquery por linha degrada muito | Código (DB) |
| **Índices faltando** em FKs/colunas de filtro | Full scans em `appointments`, `activity_logs`, `prescriptions`… | Código (DB) |
| **Sem rate limiting** (e o existente é fail-open) | Abuso derruba o banco / estoura custo de LLM | Código |

---

## 🏗️ Só VOCÊ pode fazer (infra) — pré-requisitos para escala

1. **Sair do VPS único.** Frontend → **CDN estático** (Vercel/Cloudflare Pages — o `vercel.json` já existe). VPS deixa de servir HTML.
2. **Connection pooling.** Ativar **Supabase Pooler (PgBouncer, modo transaction)** e usar a porta 6543 nas edge functions. Sem isso, o Postgres esgota conexões muito antes de 100k.
3. **Escalar compute do Postgres** (plano Supabase adequado) + **read replicas** para leitura pesada (dashboards, relatórios).
4. **Vídeo gerenciado / SFU em cluster.** Trocar MiroTalk num VPS por SFU escalável (LiveKit Cloud, Daily, Twilio, Vonage) ou cluster próprio com autoscaling + **TURN gerenciado** (não um coturn num IP).
5. **CDN para Storage** (PDFs, imagens) com URLs assinadas + cache de borda.
6. **TLS em todos os microserviços** (hoje `http://72.62.138.208:*`) atrás de subdomínios + Traefik/LB.
7. **Observabilidade real:** Sentry (DSN setado), métricas (APM), alertas (não só job do GitHub a cada 30 min).
8. **Load testing** antes do go-live: k6/Artillery simulando 10k → 50k → 100k para achar o teto real. (Há `scripts/load-baseline.mjs` — ponto de partida.)
9. **Backup/PITR** offsite e testado (restore drill).

---

## 💻 O que EU posso fazer em código (roadmap de PRs)

### PR de escala #1 — Índices de banco (alto impacto, baixo risco)
Migração adicionando índices nas colunas de FK e filtros quentes: `appointments(patient_id, doctor_id, status, scheduled_at)`, `prescriptions(patient_id, doctor_id)`, `activity_logs(user_id, created_at)`, `notifications(user_id, read)`, etc. — **após** confirmar os índices já existentes (evitar duplicar).

### PR de escala #2 — Camada de dados com cache (react-query)
Migrar os fetches quentes (dashboards de paciente/médico, listas) de `db.from` direto → `useQuery` com `staleTime`. Corta drasticamente queries repetidas. Já existe `QueryClient` bem configurado — está subutilizado (17 de ~200 telas).

### PR de escala #3 — Paginação + virtualização
Paginação server-side (`.range()`) nas listas admin (`AdminPatients`, `AdminDoctors`, `AdminFinancial`) + virtualização (`@tanstack/react-virtual`). Hoje carregam a tabela inteira.

### PR de escala #4 — RLS performática
Trocar subqueries `is_admin()`/`has_role()` por checagem via **JWT claims** (`auth.jwt() ->> 'role'`) onde possível, e garantir índices que casam com as policies. Reduz custo por-linha.

### PR de escala #5 — Rate limiting fail-closed + cap de LLM
`checkRateLimit` fail-**closed** nos endpoints sensíveis; cota + cap de input nas funções de IA (hoje qualquer um pode estourar seu custo Anthropic).

### PR de escala #6 — N+1 nas edge functions
Várias funções fazem `getUserById` em loop (`scheduled-tasks`, `weekly-admin-report`…). Trocar por batch/join.

---

## Ordem recomendada

```
INFRA (bloqueante)                    CÓDIGO (posso fazer)
1. CDN frontend + sair do VPS   ──►    #1 Índices
2. Pooler (PgBouncer)           ──►    #2 react-query cache
3. Vídeo SFU gerenciado         ──►    #3 Paginação/virtualização
4. Read replicas                ──►    #4 RLS por JWT claims
5. Load testing (achar o teto)  ──►    #5 Rate limit + cap LLM
                                       #6 N+1 nas functions
```

**Sem os itens de infra 1–3, nenhum ajuste de código sustenta 100k usuários.** Os PRs de código reduzem a carga por usuário (menos queries, menos custo), mas o teto físico é definido pela infra.

---

*Posso começar pelos PRs de escala #1 (índices) e #5 (rate limiting) imediatamente — são os de melhor custo/benefício e não dependem da sua infra. Os demais rendem mais depois que o pooling e a CDN estiverem no lugar.*
