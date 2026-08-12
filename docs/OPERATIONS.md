# Operação, carga e alertas

## Staging

O workflow `Deploy to Staging` usa a branch `dev` e o environment `staging`. Ele agora exige estes secrets antes de iniciar:

- `STAGING_VPS_HOST`, `STAGING_VPS_USER`, `STAGING_VPS_SSH_PRIVATE_KEY`;
- `STAGING_SITE_URL`;
- `STAGING_SUPABASE_PROJECT_REF`;
- `STAGING_VITE_SUPABASE_URL`, `STAGING_VITE_SUPABASE_PUBLISHABLE_KEY`;
- `STAGING_VITE_SENTRY_DSN` é opcional.

O workflow publica o frontend, Edge Functions, health check e smoke E2E contra a URL de staging. O banco de staging deve ser um projeto Supabase separado, sem dados de pacientes de produção.

## Teste HTTP

```bash
npm run load:baseline -- --target https://aloclinica.com.br/health --duration 60 --concurrency 50
```

## Teste de sinalização de consultas

Este teste abre canais Supabase Realtime temporários e envia mensagens de broadcast. Não cria consultas, pagamentos, prontuários ou gravações:

```bash
SUPABASE_URL="https://<projeto>.supabase.co" \
SUPABASE_ANON_KEY="<chave-publicável>" \
npm run load:consultation -- --concurrency 25 --duration 30
```

Repita com `--concurrency 50`, `100` e `150`. Registre p95 de inscrição/broadcast, erros e CPU/memória do VPS. Isso não substitui um teste real de WebRTC; mídia deve ser validada com usuários de teste e janela autorizada.

## Monitoramento

`npm run monitor:production -- --json` verifica site, status, Supabase REST, vídeo, KYC, WhatsApp, último backup, falhas recentes em `activity_logs`, falhas de pagamento em `payment_transactions`, falhas de e-mail/WhatsApp em `notification_log`, CPU/memória dos containers, memória do host e disco.

O workflow `Production Monitoring` roda a cada 15 minutos. Se houver falha, salva um artifact, abre um único issue com a label `production-alert` e envia para `ALERT_WEBHOOK_URL` quando esse secret existir.

Secrets usados pelo monitor:

- `SUPABASE_ACCESS_TOKEN` para consultar backup e falhas recentes sem expor dados;
- `VPS_SSH_PRIVATE_KEY` para métricas privadas da VPS;
- `ALERT_WEBHOOK_URL` opcional para Slack, Discord ou outro receptor compatível.

## OpenAPI

```bash
npm run docs:openapi
npm run docs:openapi:check
```

O arquivo [openapi.yaml](./openapi.yaml) é gerado a partir das pastas `supabase/functions/*` e da política `supabase/config.toml`. Ele documenta o inventário, métodos detectados, autenticação JWT e origem do contrato. Os schemas específicos de negócio devem ser detalhados antes de entregar um SDK externo.
