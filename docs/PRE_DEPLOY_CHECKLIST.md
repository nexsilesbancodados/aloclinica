# Pre-Deploy Checklist — AloClínica

Use este checklist antes de qualquer deploy de produção. Cada item ou está
verde ✅ ou bloqueia o release.

## 1. Variáveis de ambiente

- [ ] `.env.production` preenchido a partir de [`.env.production.example`](../.env.production.example)
- [ ] Supabase Edge Secrets sincronizados (dashboard ou `supabase secrets set`)
- [ ] `VITE_MERCADOPAGO_PUBLIC_KEY` é a chave PÚBLICA, não o access token
- [ ] `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` configurados
- [ ] `VIDAAS_CLIENT_ID` + `VIDAAS_CLIENT_SECRET` configurados (senão ICP-Brasil
      fica em fallback automático — ver `src/hooks/useIcpAvailable.ts`)
- [ ] `VITE_SENTRY_DSN` apontando pra projeto de produção
- [ ] `ANTHROPIC_API_KEY` válido (PingoChat)
- [ ] `BREVO_API_KEY` + `EMAIL_FROM` configurados

## 2. Migrations

- [ ] Todas as migrations em `supabase/migrations/` aplicadas em produção
- [ ] **Crítico:** `20260513_scale_indexes_idempotency.sql` aplicada
      — rode o workflow **"Verify — Idempotency do webhook MP"** pra confirmar
- [ ] Sem migrations pendentes não-revisadas

## 3. Edge Functions deployadas

- [ ] `mercadopago-webhook` (recebe notificações de pagamento)
- [ ] `mercadopago-create-payment` / `-create-subscription` / `-charge-saved-card`
- [ ] `vidaas-sign` + `vidaas-callback` (assinatura ICP-Brasil)
- [ ] `send-push-notification` (web push)
- [ ] `send-email` (transacional via Brevo)
- [ ] `send-whatsapp` (via Evolution API)

## 4. Webhooks externos

- [ ] Mercado Pago > Webhooks aponta para `…/functions/v1/mercadopago-webhook`
- [ ] Assinatura HMAC do MP é a mesma de `MERCADOPAGO_WEBHOOK_SECRET`
- [ ] (Opcional) PACS aponta para `…/functions/v1/orthanc-pacs-webhook`
      com `PACS_WEBHOOK_SECRET`

## 5. DNS + TLS

- [ ] `aloclinica.com.br` aponta pro ambiente certo (Easypanel/Traefik)
- [ ] HTTPS válido (cert Let's Encrypt renovado)
- [ ] `VITE_APP_URL` e `APP_URL` consistentes com domínio público

## 6. Health checks pós-deploy

Após subir, valide manualmente:

- [ ] `GET https://aloclinica.com.br/` retorna 200 e renderiza landing
- [ ] `POST /functions/v1/mercadopago-webhook` retorna 401 sem assinatura
      (não 500/CORS error)
- [ ] Logar como paciente, abrir uma consulta, abrir vídeo (PreCallCheck OK)
- [ ] Logar como médico, abrir receita: o aviso de assinatura mostra
      "ICP-Brasil ativa" ou "simplificada ativa" (não fica em loading)
- [ ] Dashboard admin > Saúde Sistema: todas edge functions verdes

## 7. Rollback

- [ ] Tag git do release anterior pronta pra reverter (`git tag` antes de subir)
- [ ] Plano de rollback definido (Easypanel: deploy anterior; Supabase: migrations
      têm DOWN onde aplicável)

---

## Comandos úteis

```bash
# Aplicar uma migration específica via Management API
# (workflow GitHub Actions: "One-shot — Aplicar migration específica")

# Listar secrets configurados no Supabase
supabase secrets list

# Verificar idempotency do webhook MP (workflow)
gh workflow run verify-idempotency.yml
```
