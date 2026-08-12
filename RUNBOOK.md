# AloClínica — Runbook operacional

Documento de referência para operar e diagnosticar a plataforma em produção.
Atualizado em 2026-05-29 — versão **v2.0**.

---

## 🗺️ Mapa rápido

| Recurso | Onde fica |
|---|---|
| **Site público** | https://aloclinica.com.br |
| **Status page** | https://aloclinica.com.br/status |
| **Repositório** | https://github.com/nexsilesbancodados/aloclinica |
| **Supabase project** | `pwxvvimdtmvziynbspgx` |
| **VPS (frontend + MiroTalk)** | `72.62.138.208` (root via `~/.ssh/aloclinica_github_actions`) |
| **Edge functions URL** | `https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/<name>` |
| **Vídeo (MiroTalk)** | https://meet.telemedicinaaloclinica.sbs |
| **Subdomínios B2G** | `acoes.`, `parceiros.`, `orgaos.`, `empresas.` |

---

## 🚀 Deploy

Tudo automático via **GitHub Actions** ao push para `main`:

```
deploy.yml
├── deploy-frontend (scp do dist/ para a VPS)
└── deploy-supabase (supabase functions deploy --project-ref ...)
```

**Forçar deploy manual**:
```bash
gh workflow run "Deploy to Production"
```

**Aplicar migration sem push**:
```bash
# 1. Crie supabase/migrations/<timestamp>_descricao.sql
# 2. Aplique via Management API:
node -e "const fs=require('fs'),https=require('https');
const sql=fs.readFileSync('supabase/migrations/<arquivo>.sql','utf8');
const body=JSON.stringify({query:sql});
https.request('https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/database/query',
  {method:'POST',headers:{'Authorization':'Bearer <TOKEN>','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},
  r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(r.statusCode,d));}
).end(body);"
```

---

## 🔐 Secrets

### Edge Function Secrets (Supabase dashboard ou via Management API)

| Nome | Função |
|---|---|
| `ANTHROPIC_API_KEY` | IA Clínica (clinical-ai) |
| `MERCADOPAGO_ACCESS_TOKEN` | Pagamentos MP |
| `MERCADOPAGO_WEBHOOK_SECRET` | Verificação de webhooks |
| `MERCADOPAGO_APP_ID` *⚠️ falta* | OAuth marketplace (split 90/10) |
| `MERCADOPAGO_CLIENT_SECRET` *⚠️ falta* | OAuth marketplace |
| `AUTO_PAYOUT_TICK_SECRET` | Auth dos crons auto-payout e no-show-reminder |
| `MEMED_API_KEY` / `MEMED_SECRET_KEY` | Assinatura digital de receitas |
| `EVOLUTION_API_*` | WhatsApp |
| `BREVO_API_KEY` | E-mail transacional |
| `RESEND_API_KEY` | E-mail (backup) |
| `VAPID_PRIVATE_KEY` | Push web |
| `CONSULTA_CRM_API_KEY` | Verificação automática de CRM |
| `DIDIT_API_KEY` | KYC (anti-fraude facial) |
| `COMPREFACE_*` | Face match (KYC) |
| `VIDAAS_*` | Assinatura digital alternativa |
| `MIROTALK_*` | Vídeo P2P |
| `DOCUSEAL_API_KEY` | Termos / contratos |
| `LOVABLE_API_KEY` | Plataforma de origem |
| `SITE_URL` / `SITE_DOMAIN` | URL canônica |

### Vault (acesso restrito ao postgres)

| Nome | Uso |
|---|---|
| `auto_payout_tick_secret` | pg_cron → Header `x-tick-secret` |

### GitHub Secrets (CI)

| Nome | Uso |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Deploy de edge functions |
| `VPS_SSH_PRIVATE_KEY` | Deploy frontend (scp) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Build do frontend |
| `VITE_SENTRY_DSN` | Telemetria de erros |
| `VITE_MP_APP_ID` *⚠️ falta* | OAuth MP no client |

---

## ⏰ Cron jobs (29 ativos)

### Críticos
| Job | Schedule | Função |
|---|---|---|
| `auto-payout-daily` | `0 11 * * *` | Cria withdrawal_requests automaticamente |
| `no-show-reminder-hourly` | `0 * * * *` | WhatsApp + push para alto risco |
| `appointment-reminders` | `*/5 * * * *` | Lembrete 1h antes da consulta |
| `auto-cancel-unpaid` | `*/5 * * * *` | Cancela consultas não pagas |
| `pix-expiry-reminder` | `*/5 * * * *` | Lembra de PIX antes de expirar |
| `daily-backup` | `0 3 * * *` | Backup diário do DB |

### Como ver status dos crons
```sql
SELECT j.jobname, j.active, d.last_finish, d.last_status
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT MAX(end_time)::text AS last_finish,
         (array_agg(status ORDER BY end_time DESC))[1] AS last_status
  FROM cron.job_run_details WHERE jobid = j.jobid
) d ON true
ORDER BY j.jobid;
```

### Como desativar/reativar um cron
```sql
SELECT cron.alter_job(jobid, schedule := '0 0 1 1 *') FROM cron.job WHERE jobname = '<nome>';  -- "desativa" rodando 1×/ano
-- ou
SELECT cron.unschedule('<nome>');
```

---

## 🔧 Diagnóstico de falhas

### Site fora do ar
1. `curl https://aloclinica.com.br/` → deve ser 200.
2. Conferir Traefik na VPS:
   ```bash
   ssh -i ~/.ssh/aloclinica_github_actions root@72.62.138.208 'docker ps | grep -E "traefik|aloclinica-web"'
   ```
3. Reiniciar nginx do site: `docker restart aloclinica-web`.
4. Conferir certificados (Let's Encrypt):
   `cat /etc/easypanel/traefik/acme.json | grep aloclinica`

### Vídeo (MiroTalk) fora
- Health: `curl https://meet.telemedicinaaloclinica.sbs/` → 200.
- Restart: `ssh -i ~/.ssh/aloclinica_github_actions root@72.62.138.208 'docker restart mirotalk'`.
- ⚠️ A **config dos botões** (`/src/app/src/config.js` dentro do container) **reseta** ao recriar o container. Reaplicar via SSH + sed (backup em `app/src/config.js.bak.*`).

### Edge function falhando
1. Testar o endpoint: `curl https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/<name>`.
2. Ver logs no painel Supabase → Edge Functions → `<name>` → Logs.
3. Re-deploy isolado:
   ```bash
   supabase functions deploy <name> --project-ref pwxvvimdtmvziynbspgx
   ```

### Pagamento Mercado Pago travado
- **Webhook**: `mercadopago-webhook` deve receber `POST` do MP.
- Conferir últimas `payment_transactions`:
  ```sql
  SELECT mp_payment_id, status, created_at, raw_response->>'status_detail' AS detail
  FROM public.payment_transactions ORDER BY created_at DESC LIMIT 20;
  ```
- Forçar verificação manual: chamar a função de reconciliação (admin).

### KYC bloqueando paciente
- Tabela: `kyc_verificacoes` (status: `aprovado`, `rejeitado`, etc.)
- Forçar aprovação manual (admin):
  ```sql
  INSERT INTO public.kyc_verificacoes (user_id, status, tipo)
  VALUES ('<UUID>', 'aprovado', 'paciente');
  UPDATE public.profiles SET kyc_status='approved' WHERE user_id='<UUID>';
  ```

### IA Clínica fora
- Testa: `POST clinical-ai` com `{"task":"triage","payload":{"complaint":"teste"}}` (público).
- Se 500 → checar `ANTHROPIC_API_KEY` no painel.
- Rate limit (40/min por user, 12/min por IP no triage) configurável em `clinical-ai/index.ts`.

---

## 🧰 Operações comuns

### Aprovar manualmente um médico
```sql
UPDATE public.doctor_profiles
SET is_approved = true, is_active = true,
    crm_verified = true, crm_verified_at = now(),
    kyc_status = 'approved', kyc_verified_at = now()
WHERE user_id = '<UUID>';
INSERT INTO public.user_roles (user_id, role)
VALUES ('<UUID>', 'doctor'::public.app_role)
ON CONFLICT DO NOTHING;
```

### Criar uma chave de API pública
```sql
-- prefix público (8 chars) + secret aleatório
WITH pre AS (SELECT substr(replace(gen_random_uuid()::text,'-',''), 1, 8) AS p, replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') AS s)
INSERT INTO public.api_keys (owner_user_id, label, prefix, secret_hash, scopes, rate_limit_per_min)
SELECT '<USER_ID_DONO>', 'Parceiro X — produção', p, s, ARRAY['appointments:read'], 60
FROM pre
RETURNING prefix || '.' || (SELECT secret_hash FROM public.api_keys WHERE prefix = (SELECT p FROM pre)) AS apikey;
-- Salvar a chave! O secret_hash não é recuperável.
```

Uso:
```bash
curl -H "Authorization: ApiKey <prefix>.<secret>" \
  https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/public-api/v1/appointments
```

### Limpar dados de teste (depois de testes manuais)
```sql
-- Remove usuários com email *.demo@aloclinica.com.br ou *.teste@example.com em cascata.
-- Vide migration 20260528... ou rode o procedimento da última limpeza no histórico.
```

### Backup manual
- `daily-backup` cron faz automaticamente.
- Para backup pontual: Supabase Dashboard → Database → Backups → Create.

---

## 🚨 Quando algo dá errado

### 1. Reverter um deploy ruim
```bash
git revert HEAD          # cria commit reverso
git push origin main     # dispara redeploy do estado anterior
```

### 2. Rotacionar um secret comprometido
1. Supabase Dashboard → Project Settings → Edge Functions → Manage secrets.
2. Editar o valor.
3. Re-deploy de edge functions afetadas (geralmente automático em alguns minutos).

### 3. Modo manutenção
- Adicionar uma flag em `public.feature_flags` (`maintenance_mode: true`) e fazer o frontend ler no boot para mostrar uma tela.
- Ou: desativar nginx no VPS e o Traefik mostra 503.

### 4. Comunicar status aos clientes
- Atualizar `/status` com mensagem de incidente.
- Banner global via `feature_flags.global_banner_message`.

---

## 📞 Contatos

| Vendor | Contato |
|---|---|
| Supabase | https://supabase.com/dashboard → suporte |
| Mercado Pago | https://www.mercadopago.com.br/developers/panel |
| Memed | https://memed.com.br/api |
| Anthropic | https://console.anthropic.com |
| Evolution API (WhatsApp) | painel de instância |

---

**Última auditoria operacional:** 2026-05-29 — 29 crons ativos, 79 edge functions, 117 tabelas, 0 dados de teste residuais.
