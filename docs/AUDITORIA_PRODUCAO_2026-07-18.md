# 🔍 Auditoria de Prontidão para Produção — AloClínica

**Data:** 2026-07-18 · **Escopo:** banco de dados, backend (edge functions), frontend, segurança ofensiva, DevOps, conformidade CFM/LGPD · **Método:** leitura estática de código por 8 auditorias paralelas.

> ⚠️ **Aviso:** análise técnica de engenharia, não parecer jurídico. Os pontos de CFM/LGPD/assinatura devem ser validados por advogado e pelo Diretor Técnico Médico antes do go-live.

---

## Veredito

**A plataforma NÃO está pronta para produção.** A engenharia de base é, em vários pontos, de nível sênior (code-splitting/PWA, RLS extensa, CI com testes, hardening progressivo). Porém existem **falhas de segurança CRÍTICAS e exploráveis por qualquer anônimo**, além de misrepresentação legal na assinatura de documentos médicos. Um go-live no estado atual expõe dados de saúde de pacientes e cria risco jurídico.

### Placar de severidade

| Severidade | Qtde | Natureza |
|---|---|---|
| 🔴 Crítico | 11 | Escalada de privilégio, IDOR de PII/financeiro, dump público de dados, assinatura falsa, chaves vazadas |
| 🟠 Alto | ~15 | Funções "efetivamente públicas", pagamentos confiando no cliente, registros clínicos deletáveis, mixed-content |
| 🟡 Médio | ~20 | Rate-limit fail-open, tipos desligados, i18n de fachada, observabilidade opcional |
| 🔵 Baixo | vários | Higiene (CORS *, container root, dois RUNBOOKs) |

---

## 🔴 Os 11 bloqueadores CRÍTICOS

| # | Problema | Evidência | Explorável por |
|---|---|---|---|
| 1 | **Auto-promoção a `admin`** — `handle_new_user` confia no `role` do metadata do signup | `migrations/20260520234812…sql:46-55` | Anônimo (signup) |
| 2 | **Cadastro público de `support`** dá acesso a PII de pacientes sem aprovação | `src/App.tsx:174`, `SignupSupport.tsx:94-113` | Anônimo |
| 3 | **IDOR financeiro** — `fn_get_cartao_summary(p_user_id)` sem checar dono, exposto a `anon` | `migrations/20260519235305…sql:198-278` | Qualquer usuário |
| 4 | **`daily-backup` 100% público** — dump de `profiles/medical_records/prescriptions…` sem auth | `functions/daily-backup/index.ts:6-20` | Anônimo |
| 5 | **`scheduled-tasks` público** — muta dados + dispara e-mail/WhatsApp/push em massa | `functions/scheduled-tasks` | Anônimo |
| 6 | **Assinatura falsa "ICP-Brasil"** — SHA-256 rotulado como assinatura qualificada; `is_signed:true` | `generate-prescription-pdf:19,44,54`, `generate-certificate-pdf:38`, `useDigitalSignature.ts:203-292` | — (fraude legal) |
| 7 | **IDOR nos geradores de PDF** — `service_role` + `id` do body → gera receita/atestado de qualquer paciente | `generate-prescription-pdf:8-11`, `generate-certificate-pdf:8-11` | Qualquer usuário |
| 8 | **Adulteração de pagamento** — `amount`/`reference_id` vêm do cliente sem validar contra o preço real | `mercadopago-create-payment:70,91,156-173`, `mp-oauth-callback:29` | Qualquer usuário |
| 9 | **PII biométrica em HTTP puro + chaves hardcoded** (CompreFace/KYC) | `didit-kyc/index.ts:10-12` | MITM de rede |
| 10 | **Documentos clínicos em bucket com histórico público** + `getPublicUrl`, path enumerável | `generate-*-pdf:49-51`, buckets `receitas-assinadas` `public=true` em `20260327213225…:2-3` | Enumeração |
| 11 | **Oráculo de enumeração de CPF** exposto a `anon` (`cpf_in_use`) | `migrations/20260520234812…sql:1-14` | Anônimo (LGPD) |

**Observação urgente:** o item #1 provavelmente **já foi explorável em produção** — é preciso auditar a tabela `user_roles` e revogar qualquer `admin`/`support` criado por auto-cadastro.

---

## Por domínio

### 🗄️ Banco de dados
- ✅ **Forte:** RLS habilitado em 100% das tabelas (139 tabelas, verificado por set-diff + 2 loops de backstop). SELECT clínico bem escopado (paciente + médico responsável + admin). Webhooks validam assinatura.
- ⚠️ **Fraco:**
  - **Schema drift** — `medical_records`, `patient_consents` e outras definidas **2×** com colunas divergentes; `CREATE TABLE` sem `IF NOT EXISTS` em migrações consolidadas → risco ao reaplicar.
  - **Registros clínicos deletáveis** — políticas `FOR ALL` permitem o médico **apagar** prontuário/receita/atestado (`medical_records`, `consultation_notes`, `prescriptions`, `clinical_anamnesis`…). CFM exige imutabilidade/guarda ~20 anos.
  - **Sem retenção de 20 anos**; único cron de retenção apaga logs aos 90 dias.
  - 4 funções `SECURITY DEFINER` sem `search_path` fixo (CVE-class). **[corrigido neste PR — fix em lote]**

### ⚙️ Backend / Edge Functions (84 funções)
- ✅ **Forte:** `_shared/auth.ts` (`safeEqual` timing-safe, `getCaller`). `send-prescription`, `assign-role`, `admin-reset-password`, `lgpd-export*`, `no-show-reminder-tick`, webhooks — padrão correto de auth/ownership.
- ⚠️ **Fraco:** adoção **inconsistente** do padrão seguro. Dezenas de funções tratam `verify_jwt=true` como "autenticado" quando a `anon key` já passa o gateway → **"efetivamente públicas"** (`whatsapp-notify/qr`, `compreface-proxy`, `metered-room`, `docuseal-proxy`, `post-consultation-survey`). Segredos na query string (`memed-prescriber:81,131`). Sem rate limit nos endpoints de LLM (abuso de custo). Erros internos (`String(e)`) vazados ao cliente.

### 🖥️ Frontend (512 arquivos)
- ✅ **Forte:** code-splitting (211 `lazy`), `manualChunks` por lib, PWA/offline com cache por camada, ErrorBoundary+VideoErrorBoundary, Sentry, 322 testes unitários com MSW, boa a11y (322 `aria-*`).
- ⚠️ **Fraco:**
  - **Segurança de tipos desligada** — `strict:false`, `no-explicit-any:off`, cliente `db = supabase as any` em 229 arquivos, ~761 `any`. Inaceitável para dados médicos.
  - **Sem camada de dados** — react-query configurado mas usado em 17 arquivos vs **546 `db.from` diretos** em componentes.
  - **Componentes-monstro** — `VideoRoom.tsx` 1816 linhas / 35 `useState`; 15 arquivos >800 linhas.
  - **i18n de fachada** — infra p/ 3 idiomas, ~5 call sites reais; switcher engana o usuário.
  - **E2E não cobre fluxos autenticados** (login/consulta/prescrição) — só smoke; um browser.

### 🔒 Segurança ofensiva
Top 5 vetores: (1) auto-admin no signup, (2) auto-support público, (3) `public-api` valida chave em texto puro/timing-unsafe, (4) sinalização de teleconsulta por HTTP puro (MITM), (5) documentos clínicos por `getPublicUrl`. Sessão em `localStorage` + CSP com `unsafe-inline`/`unsafe-eval` (mitigado por ausência de `dangerouslySetInnerHTML`/`eval`). Rate-limit **fail-open** (`_shared/auth.ts:107`).

### 🚀 DevOps
- ✅ **Forte:** `test.yml` completo (tsc+lint+vitest+build+e2e), nginx endurecido, RUNBOOK/SMOKE_TEST de qualidade, rollback dedicado.
- ⚠️ **Fraco:**
  - **Deploy sem gate de qualidade** — `deploy.yml` publicava direto no push a `main`, sem depender do CI. **[corrigido neste PR]**
  - `deploy-supabase` com `continue-on-error:true` (deploy de backend nunca falhava). **[corrigido]**
  - **`setup-production.sh` aponta para o projeto ERRADO** (`oaixgmuocuwhsabidpei`) e descreve stack que não é a do app (Asaas/DeepSeek/Metered vs MercadoPago/Anthropic/MiroTalk).
  - **Backup frágil** — mesmo-projeto, 9/117 tabelas, truncado em 50k linhas, sem retenção/offsite.
  - **Builds não-reprodutíveis** — `npm install` + `^` em tudo + 3 lockfiles (2 do Bun mortos). **[corrigido: `npm ci` + bun lockfiles removidos]**
  - **Mixed-content** — `http://72.62.138.208:*` em 17 arquivos (CSP, functions, workflows).

### ⚖️ CFM / LGPD
- ✅ TCLE apresentado e registrado antes da teleconsulta; prontuário SOAP + PDF; RLS; portabilidade/eliminação LGPD implementadas; logs de auditoria imutáveis.
- ⚠️ Assinatura falsa (item #6); identificação do médico só em painel opcional; sem opção ativa de presencial no agendamento; consentimento de gravação não auditável; draft legal com placeholders `[PREENCHER]` (Razão Social, CNPJ, **Diretor Técnico Médico**).

---

## ✅ O que foi corrigido NESTE PR (código)

| Fix | Arquivo |
|---|---|
| `handle_new_user` — bloqueia auto-atribuição de `admin`/`support` | `migrations/20260718120000_security_hardening_audit.sql` |
| `fn_get_cartao_summary` — guard de ownership + revoga `anon` | idem |
| `cpf_in_use` — revoga `anon` (anti-enumeração) | idem |
| `search_path` fixo em TODAS as funções `SECURITY DEFINER` (loop) | idem |
| Backdoor legado de admin por e-mail — drop defensivo | idem |
| Remove rótulo falso "Assinatura digital/ICP-Brasil"; `is_signed:false` | `generate-prescription-pdf`, `generate-certificate-pdf` |
| Remove rota pública `/suporte/cadastro` | `src/App.tsx` |
| Chaves CompreFace/KYC → env (fim do hardcode) | `didit-kyc/index.ts` |
| Gate de qualidade antes do deploy + `npm ci` + fail-loud no backend | `.github/workflows/deploy.yml` |
| Remove lockfiles do Bun (mortos) | `bun.lock`, `bun.lockb` |

---

## 🚧 O que FALTA para produção — checklist priorizado

### Só VOCÊ pode fazer (precisa de acesso à infra) — **antes de qualquer go-live**
1. **Aplicar a migração** `20260718120000_security_hardening_audit.sql` no Supabase.
2. **Auditar `user_roles`** e revogar admins/support criados por signup (query no fim da migração).
3. **Rotacionar TODAS as chaves vazadas** que estavam hardcoded no git (CompreFace/KYC, e revisar histórico por outras) e configurá-las como secrets.
4. **Tornar privados** os buckets de documentos clínicos e confirmar que nenhum é `public`.
5. **TLS/HTTPS** nos microserviços do VPS (CompreFace, DocuSeal, coturn, mídia) — hoje `http://72.62.138.208:*`. Remover todos os `http://` do CSP.
6. **Backup real** — PITR do Supabase ou `pg_dump` offsite, cobrindo todas as tabelas, com retenção.
7. **Corrigir/remover `setup-production.sh`** (projeto e stack errados).

### Código a fazer (posso continuar) — próximos PRs
8. Fechar as funções "efetivamente públicas" com `getCaller`/gate interno (`daily-backup`, `scheduled-tasks`, `whatsapp-*`, `metered-room`, `compreface-proxy`…).
9. **Validar `amount`/`reference_id` no servidor** nos pagamentos Mercado Pago; corrigir `state` em `mp-oauth-callback`.
10. Migração de **imutabilidade clínica** (bloquear DELETE + travar UPDATE pós-finalização em prontuário/receita/atestado) e **retenção de 20 anos**.
11. `public-api` — verificação de chave server-side com hash + timing-safe.
12. Rate limit + cap de input nos endpoints de LLM; rate-limit **fail-closed**.
13. Ligar assinatura **real** (Memed/VIDaaS) ao fluxo de receita; corrigir `register-signature` p/ validar identidade do médico via JWT.
14. Reintroduzir segurança de tipos nos caminhos de PHI/receitas; padronizar acesso a dados via react-query.
15. E2E automatizado dos fluxos críticos, multi-browser.

---

*Relatório gerado por auditoria automatizada. Os itens marcados "[corrigido neste PR]" estão na branch `security-hardening-audit`.*
