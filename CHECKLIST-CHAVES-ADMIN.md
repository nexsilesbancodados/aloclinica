# Checklist de configuração da AloClinica

## Como usar

Não envie valores de chaves por chat e não salve valores reais neste arquivo.
Use esta lista apenas para conferir o que você já possui e cole cada valor
diretamente no Centro de Manutenção do Admin:

https://aloclinica.com.br/dashboard/admin/maintenance?role=admin

## Primeiro passo — obrigatório no Supabase

- [ ] Criar token fine-grained com `edge_functions_secrets_write`
- [ ] Cadastrar manualmente no Supabase como `PROJECT_SECRETS_MANAGEMENT_TOKEN`
- [ ] Abrir o painel e clicar em **Atualizar diagnóstico**

## Chaves principais

- [ ] `BREVO_API_KEY` — e-mail
- [ ] `MERCADOPAGO_ACCESS_TOKEN` — pagamentos
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` — pagamentos
- [ ] `EVOLUTION_API_URL` — WhatsApp
- [ ] `EVOLUTION_API_KEY` — WhatsApp

## Chaves opcionais por integração

- [ ] `METERED_APP_NAME`
- [ ] `METERED_SECRET_KEY`
- [ ] `MIROTALK_URL`
- [ ] `MIROTALK_API_KEY`
- [ ] `COMPREFACE_URL`
- [ ] `COMPREFACE_VERIFY_KEY`
- [ ] `COMPREFACE_DETECT_KEY`
- [ ] `DOCUSEAL_BASE`
- [ ] `DOCUSEAL_API_KEY`
- [ ] `DOCUSEAL_WEBHOOK_SECRET`
- [ ] `FOCUS_NFE_TOKEN`
- [ ] `MEMED_API_KEY`
- [ ] `MEMED_SECRET_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `VAPID_PRIVATE_KEY`

## Configuradas fora do painel

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `INTERNAL_FUNCTION_SECRET`
- `AUTO_PAYOUT_TICK_SECRET`
- `SEND_EMAIL_HOOK_SECRET`

Essas chaves são gerenciadas pelo Supabase ou precisam permanecer sincronizadas
com jobs, triggers ou configurações externas. Não altere sem confirmar os dois
 lados.

## Depois de salvar

1. Clique em **Salvar chaves**.
2. Clique em **Atualizar diagnóstico**.
3. Confirme que os serviços necessários aparecem como **OK**.
4. Não cole nenhum segredo neste arquivo; apague-o quando terminar.
