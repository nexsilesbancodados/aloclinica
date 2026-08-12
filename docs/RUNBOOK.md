# Runbook Operacional — AloClínica

Procedimentos práticos pra rodar a plataforma em produção.

---

## URLs e credenciais

| Recurso | Onde |
|---|---|
| Site | https://aloclinica.com.br |
| Painel admin | https://aloclinica.com.br/dashboard?role=admin |
| Supabase | https://supabase.com/dashboard/project/pwxvvimdtmvziynbspgx |
| GitHub | https://github.com/nexsilesbancodados/aloclinica |
| VPS SSH | `ssh -i ~/.ssh/aloclinica_github_actions root@72.62.138.208` |
| Easypanel | http://72.62.138.208:3000 |
| MiroTalk | https://meet.telemedicinaaloclinica.sbs |
| WhatsApp gateway | https://whatsapp.telemedicinaaloclinica.sbs |
| CompreFace | https://face.aloclinica.com.br |

---

## Deploy

### Frontend (automático)
Push em `main` → GitHub Actions roda `deploy.yml` → ~3 min até produção.

```bash
git push origin main
# Aguarde ~3min, verifique:
curl -sI https://aloclinica.com.br/health
# OK = deploy concluído
```

### Edge Functions (automático ou manual)

```bash
# Lista funções deployadas
curl -H "Authorization: Bearer $PAT" \
  "https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/functions"

# Deploy manual (PATCH = atualiza, POST = cria)
curl -X PATCH \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/functions/<slug>" \
  -d '{"slug":"<slug>","name":"<slug>","verify_jwt":true,"body":"...código..."}'
```

### Migrations

```bash
# Aplicar via Management API (não precisa SUPABASE_DB_PASSWORD)
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'query':open(sys.argv[1]).read()}))" supabase/migrations/<arquivo>.sql)
curl -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/database/query" -d "$PAYLOAD"
```

---

## Incidentes comuns

### "Não consigo criar conta"
1. Cheque o rate limit em `Auth Config`:
   ```bash
   curl -H "Authorization: Bearer $PAT" \
     "https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/config/auth" | jq .rate_limit_email_sent
   ```
   Deve ser >= 100. Se 2 (default), é bug — ajustar via PATCH.
2. Cheque `site_url`: deve ser `https://aloclinica.com.br` (não `localhost`).
3. Cheque trigger `handle_new_user` — deve criar profile + user_role:
   ```sql
   SELECT pg_get_functiondef('public.handle_new_user'::regproc);
   ```
4. SMTP Brevo ativo? Test:
   ```sql
   SELECT * FROM auth.users ORDER BY created_at DESC LIMIT 1;
   -- confirmation_sent_at deve ter valor recente
   ```

### "Vídeo não conecta"
1. MiroTalk respondendo? `curl -I https://meet.telemedicinaaloclinica.sbs`
2. Coturn no ar? `docker ps | grep coturn` e `ss -lunp | grep 3478`.
   Se o relato for **"só alguns pacientes não conectam"**, a causa mais provável é TURN:
   quem está atrás de NAT simétrico/CGNAT/wifi corporativo depende do relay, e o Google
   STUN não resolve esse caso.
3. Edge function `turn-credentials` retorna ICE servers válidos? Logs no Supabase.
   **O relay só é anunciado se o secret `COTURN_PASS` estiver configurado** e bater com
   `/opt/coturn/credential` na VPS. Divergência entre os dois = 401 no Allocate e vídeo
   caindo só para quem precisa de relay.
4. Testar o relay de fora (não basta o STUN):
   ```bash
   # 401 com realm = auth exigida; Allocate OK = relay funcionando
   docker logs coturn --tail 30 | grep -iE 'allocat|401|error'
   ```
5. Containers up no VPS:
   ```bash
   ssh root@72.62.138.208 'docker ps | grep -E "mirotalk|coturn"'
   ```

### "KYC não funciona"
1. CompreFace UP? `curl https://face.aloclinica.com.br/api/v1/`
2. Edge function `didit-kyc` deployada e ativa?
3. Secrets `COMPREFACE_VERIFY_KEY`, `COMPREFACE_DETECT_KEY`, `ANTHROPIC_API_KEY` setados?
4. Tabela `kyc_verificacoes` recebendo inserts? `SELECT count(*) FROM kyc_verificacoes WHERE created_at > now() - interval '24h';`

### "Pagamento não funciona"
1. Mercado Pago: chamar `mercadopago-create-payment` com PIX R$ 1 e ler resposta. Use a tela `/dashboard/admin/payment-test`.
2. Se "MERCADOPAGO_ACCESS_TOKEN não configurado": setar em Supabase Dashboard → Edge Functions → Secrets.
3. Se "unauthorized": token está errado ou inativo. Pegar novo em https://www.mercadopago.com.br/developers/panel/credentials.
4. Webhook chega? `SELECT * FROM payment_transactions WHERE gateway = 'mercadopago' AND status = 'approved' ORDER BY created_at DESC LIMIT 10;`
5. URL no painel MP: `https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/mercadopago-webhook` (eventos: payment, subscription_preapproval, subscription_authorized_payment)
6. Saque médico não saiu? Pode ser Money Out não habilitado — admin processa manualmente no painel MP, registro fica em `withdrawal_requests` com `status='pending_manual'`.

### "Site fora do ar"
1. Cloudflare/DNS resolvendo? `nslookup aloclinica.com.br`
2. VPS up? `ping 72.62.138.208`
3. Container nginx rodando? `ssh root@72.62.138.208 'docker ps | grep aloclinica-web'`
4. Traefik forwarding? Logs: `docker logs easypanel-traefik.* --tail 20`

### "Domínio mostra uma versão antiga"
Compare a origem da VPS com o domínio passando pelo Cloudflare:

```bash
curl -skL --resolve aloclinica.com.br:443:72.62.138.208 https://aloclinica.com.br/ | grep -o 'index-[A-Za-z0-9_-]*.js' | head -1
curl -skL https://aloclinica.com.br/ | grep -o 'index-[A-Za-z0-9_-]*.js' | head -1
```

Se os hashes forem diferentes, o deploy da VPS está correto, mas o origin do
Cloudflare ainda aponta para outro servidor (ou a zona está usando uma regra de
origem antiga). No Cloudflare, confirme `aloclinica.com.br` e `www` apontando
para `72.62.138.208`, remova regras de origem/Workers antigos e faça purge do
cache. Não altere DNS sem validar também os subdomínios de vídeo e WhatsApp.

---

## Manutenção rotineira

### Diária (automatizada via pg_cron)
- 04:00 UTC — `archive_old_activity_logs` move logs >90d
- Assinaturas recorrentes: cobrança automatizada pelo Mercado Pago (Pre-Approval), sem cron próprio

### Semanal (manual)
- Verificar fila KYC via `/dashboard/admin/kyc-review` — pendentes >24h em vermelho
- Revisar PRs do Lovable (commits `gpt-engineer-app[bot]` no histórico)
- Conferir Sentry: novos erros, regressões

### Mensal
- Backup do banco: Supabase faz automático mas vale exportar dump
- Revisar `withdrawal_requests` pendentes
- Conferir secrets que podem expirar (Brevo, MERCADOPAGO_ACCESS_TOKEN)

---

## Comandos úteis

### SSH para VPS
```bash
chmod 600 ~/.ssh/aloclinica_github_actions
ssh -i ~/.ssh/aloclinica_github_actions root@72.62.138.208
```

### Ver containers
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs <container> --tail 50 -f
```

### Reiniciar serviço específico
```bash
# Front
docker restart aloclinica-web

# Vídeo
docker restart mirotalk

# TURN (cuidado: desconecta vídeos em curso)
docker restart coturn
```

### Query Supabase via API
```bash
PAT="sbp_..."
curl -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/pwxvvimdtmvziynbspgx/database/query" \
  -d '{"query":"SELECT count(*) FROM appointments WHERE created_at > now() - interval '"'"'24h'"'"';"}'
```

### Ver logs de edge function
Via dashboard Supabase: Functions → escolha → Logs (últimas 24h).

---

## Próximos itens do roadmap

Ver `ARCHITECTURE.md` (final) ou `git log --oneline -20` para mudanças recentes.

Curto prazo:
- [x] Sentry DSN ativo (já em prod)
- [x] pg_cron archive_activity_logs >90d
- [x] AdminKycReview com SLA visual >24h
- [ ] Testar Mercado Pago com R$ 1 real (via `/dashboard/admin/payment-test`) — exige `MERCADOPAGO_ACCESS_TOKEN` configurado
- [ ] Painel Supabase: configurar alertas (CPU, disk, RLS errors) — manual

Médio prazo:
- [ ] Refactor páginas >800 LOC (AuthPaciente, AdminFinancial, AuthMedico)
- [ ] Documentar APIs de edge functions (OpenAPI)
- [ ] E2E coverage >70% no CI
