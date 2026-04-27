# Configurar email institucional `dpo@aloclinica.com.br`

DNS já está configurado pra **enviar (Brevo) + receber (ImproveMx)**. Falta só criar conta + alias no ImproveMx.

## Passo a passo (5 min, GRÁTIS)

### 1. Criar conta ImproveMx

1. Acesse https://improvmx.com
2. **Sign up** com `servicosplenasaude@gmail.com`
3. Confirme email
4. Login

### 2. Adicionar domínio

1. Dashboard → **"Add domain"** → digite `aloclinica.com.br`
2. ImproveMx vai pedir pra você adicionar 2 MX records — **JÁ ESTÃO CONFIGURADOS**:
   - `MX 10 mx1.improvmx.com.`
   - `MX 20 mx2.improvmx.com.`
3. Clica **"Verify domain"** — deve aparecer ✅ verde imediatamente
4. Pode demorar até 1h pra propagar globalmente

### 3. Criar alias DPO

1. No domínio aloclinica.com.br → aba **"Aliases"**
2. **"Create alias"**:
   - **Alias:** `dpo`
   - **Forward to:** `servicosplenasaude@gmail.com` (ou outro email do DPO real)
3. Save

### 4. Criar outros aliases úteis (recomendado)

Crie também:
- `suporte@aloclinica.com.br` → seu email
- `contato@aloclinica.com.br` → seu email
- `juridico@aloclinica.com.br` → seu email
- `financeiro@aloclinica.com.br` → seu email
- `cancelamento@aloclinica.com.br` → seu email

Plano grátis ImproveMx permite **5 aliases** + **25 emails/dia**. Se precisar mais, plano $5/mês = ilimitado.

### 5. Testar

1. Mande email de teste pra `dpo@aloclinica.com.br` (de qualquer outro email)
2. Deve chegar na caixa configurada como destino em ~5 segundos

---

## Status atual DNS aloclinica.com.br

| Record | Tipo | Valor | Status |
|---|---|---|---|
| `@` | A | 72.62.138.208 | ✅ |
| `www` | CNAME | aloclinica.com.br. | ✅ |
| `face` | A | 72.62.138.208 | ✅ |
| `@` | MX 10 | mx1.improvmx.com. | ✅ |
| `@` | MX 20 | mx2.improvmx.com. | ✅ |
| `@` | TXT | brevo-code:11c1b30ea2... | ✅ |
| `@` | TXT | v=spf1 include:spf.brevo.com include:improvmx.com ~all | ✅ |
| `_dmarc` | TXT | v=DMARC1; p=none; rua=mailto:... | ✅ |
| `brevo1._domainkey` | CNAME | b1.aloclinica-com-br.dkim.brevo.com. | ✅ |
| `brevo2._domainkey` | CNAME | b2.aloclinica-com-br.dkim.brevo.com. | ✅ |

**Pronto pra:**
- ✅ Receber email em qualquer alias @aloclinica.com.br (após criar conta ImproveMx)
- ✅ Enviar email de @aloclinica.com.br via Brevo (após Brevo confirmar autenticação em ~1h)

---

## Alternativa: Cloudflare Email Routing (também grátis)

Se preferir Cloudflare (mais features mas requer migrar DNS):

1. https://dash.cloudflare.com → Add site `aloclinica.com.br`
2. Cloudflare gera 2 nameservers — você atualiza no Hostinger Domain Settings
3. Aguarda propagação (~24h)
4. Cloudflare → Email → Email Routing → habilita
5. Cria destination email (verifica seu Gmail)
6. Cria alias `dpo@aloclinica.com.br → servicosplenasaude@gmail.com`

**Vantagens Cloudflare:** sem limite de aliases/emails, CDN grátis em cima, DDoS protection
**Desvantagens:** precisa migrar DNS (perde controle direto via Hostinger API)

→ **Recomendo ImproveMx** pra começar (mais simples).

---

## Quando definir o DPO real

Quando você ou outra pessoa formalizar como DPO:

1. **Atualize o forward** no ImproveMx pra ir direto pro DPO (não pro seu Gmail genérico)
2. **Atualize rodapé do site** com nome do DPO (eu ajusto via PR quando me avisar)
3. **Atualize Política de Privacidade** com nome do DPO
4. **Configure** auto-reply no Gmail do DPO confirmando recebimento em até 1h
