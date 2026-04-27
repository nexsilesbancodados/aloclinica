# 🔐 Rotação de Senhas e Tokens — URGENTE

Vários secrets foram compartilhados em chat durante o setup. **Trocar TODOS antes de operar com clientes reais.**

> 🛡️ Este documento intencionalmente NÃO contém os valores reais dos secrets. Se você tem o histórico do chat de setup, encontra eles lá. Se não tem, basta gerar novos sem preocupar com o que tinha — eles vão ser revogados de qualquer jeito.

## Checklist de rotação

### 1. VPS Hostinger
- [ ] Senha root atual está no histórico de chat (formato: senha curta com símbolos)
- **Como trocar:** painel Hostinger → VPS → "Senha do servidor" → "Alterar senha root" → gerar nova senha forte (16+ chars, mistura)
- **Após trocar, opcional:** desabilitar login por senha (só chave SSH) — me avisar pra eu setar `PasswordAuthentication no` em `/etc/ssh/sshd_config`

### 2. Easypanel admin
- [ ] Login: `servicosdev2026@gmail.com` / senha exposta
- **Como trocar:** Easypanel admin → avatar canto superior direito → "Profile" → "Change password"
- Considere também trocar o email pro `servicosplenasaude@gmail.com` (real)

### 3. GitHub PAT
- [ ] Token `aloclinica-deploy` exposto
- **Como revogar:** https://github.com/settings/tokens → encontre `aloclinica-deploy` → **Delete**
- Gere novo token (mesmo escopo: `repo`, `workflow`)
- Use o novo nas Actions Secrets se quiser fazer mais deploy via API (não obrigatório — CI usa secrets internos)

### 4. Hostinger API token
- [ ] Token de DNS exposto
- **Como revogar:** https://hpanel.hostinger.com/profile/api → Delete token
- Gere novo se precisar fazer mais alterações DNS via API

### 5. Supabase Database password
- [ ] Senha exposta
- **Como trocar:** https://supabase.com/dashboard/project/pwxvvimdtmvziynbspgx/settings/database → "Reset database password"
- Atualizar nos secrets onde estiver hard-coded (não usado direto, só Edge Functions usam via env)

### 6. Supabase Personal Access Token
- [ ] Token `aloclinica-deploy` exposto
- **Como revogar:** https://supabase.com/dashboard/account/tokens → Delete
- Gere novo se for usar Management API
- Atualizar GitHub Secret `SUPABASE_ACCESS_TOKEN`

### 7. WAHA API Key
- [ ] Key exposta
- **Como trocar:** SSH no VPS → editar `/opt/waha/docker-compose.yml` → mudar `WHATSAPP_API_KEY` (gerar nova com `openssl rand -hex 24`) → `docker compose up -d`
- Atualizar Supabase secret `WAHA_API_KEY` via Management API
- Atualizar dashboard WAHA password também

### 8. Evolution API Global Key (já não usado, mas exposto)
- [ ] Key foi exposta mas Evolution foi substituído por WAHA
- Não está sendo usada, pode ignorar a key antiga

### 9. CompreFace API Keys
- [ ] Verify key + Detect key expostas
- **Como trocar:** https://face.aloclinica.com.br → cada service → regenerate key
- Atualizar Supabase secrets `COMPREFACE_VERIFY_KEY` e `COMPREFACE_DETECT_KEY`

### 10. Brevo SMTP Key
- [ ] Key exposta
- **Como trocar:** https://app.brevo.com/settings/keys/smtp → "Generate new key" → revoke a antiga
- Atualizar Supabase Auth Custom SMTP password no painel ou via Management API

### 11. Brevo API Key (transactional)
- [ ] Key exposta
- **Como trocar:** https://app.brevo.com/settings/keys/api → regenerate
- Atualizar Supabase secret `BREVO_API_KEY`

### 12. MiroTalk + Coturn
- [ ] JWT_KEY MiroTalk + API_KEY_SECRET MiroTalk + Coturn password expostos
- **Como trocar:** SSH VPS → editar `/opt/mirotalk/docker-compose.yml` e `/opt/coturn/docker-compose.yml` (gerar novos com `openssl rand -hex 24`) → `docker compose up -d` em cada
- Atualizar Supabase secrets correspondentes (`MIROTALK_API_KEY`, `MIROTALK_JWT_KEY`, `TURN_PASSWORD`)

---

## Após rotação completa

1. ✅ **Conferir** que todos os serviços ainda funcionam (rodar teste E2E)
2. ✅ **Documentar novas credenciais** em gerenciador seguro (1Password, Bitwarden, KeePass)
3. ✅ **Anotar quem tem acesso** ao gerenciador
4. ✅ **Estabelecer rotação periódica** (cada 6 meses idealmente)

## Gerenciadores recomendados

- **Bitwarden** (grátis, open source) — https://bitwarden.com
- **1Password** ($3/mês/usuário) — https://1password.com
- **KeePassXC** (grátis, local) — https://keepassxc.org

## Secrets que NÃO precisam trocar agora

Esses não estão expostos OU já são públicos:
- ✅ Supabase publishable key (formato `sb_publishable_*`) — pública, segura
- ✅ Supabase anon JWT — pública, segura
- ✅ DNS records — públicos
- ✅ URLs dos serviços — públicas

## Como atualizar secrets nos lugares certos

**Após gerar nova credencial, atualizar em TODOS estes lugares simultaneamente:**

| Credential | Local 1 | Local 2 | Local 3 |
|---|---|---|---|
| WAHA_API_KEY | `/opt/waha/docker-compose.yml` env | Supabase secrets via API | (nenhum outro) |
| BREVO_API_KEY | Supabase secrets | (nenhum outro) | — |
| BREVO SMTP key | Supabase Auth Custom SMTP config | Edge Function env | — |
| CompreFace keys | CompreFace UI service | Supabase secrets | — |
| MiroTalk keys | `/opt/mirotalk/docker-compose.yml` | Supabase secrets | — |
| Coturn password | `/opt/coturn/docker-compose.yml` | `/opt/mirotalk/docker-compose.yml` (TURN config) | Supabase secrets |
| Hostinger token | Local CLI/scripts | (nenhum no Supabase) | — |
| GitHub PAT | Local CLI | (nenhum no Supabase) | — |
| Supabase PAT | GitHub Secret `SUPABASE_ACCESS_TOKEN` | Local CLI | — |
| Supabase DB password | (não usado em runtime, só pra psql/migrations) | — | — |

Após qualquer rotação, **rodar testes E2E** pra garantir nada quebrou.
