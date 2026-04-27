# Manual Operacional — Admin AloClínica

Guia rápido pra administrar a plataforma.

## Acesso

- URL: https://aloclinica.com.br/admin
- Usuário: precisa ter role `admin` em `user_roles`
- Atualmente: `servicosdev5@gmail.com` e `servicosplenasaude@gmail.com`

Pra adicionar novo admin, no Supabase SQL Editor:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'novo-admin@email.com';
```

---

## 1. Aprovar Médico Novo

**Cenário:** médico se cadastra em `/medico/cadastro` → fica em status `pending`.

1. Login admin → menu **"Médicos"** → aba **"Aprovação Pendente"**
2. Verifica:
   - Foto profissional
   - CRM informado (consultar manualmente em https://portal.cfm.org.br/busca-medicos/)
   - KYC facial completo (selfie + RG)
3. **"Aprovar"** → médico recebe email `doctor_approved` automaticamente
4. Médico configura disponibilidade (slots) e pode receber agendamentos

**Reprovar:** clicar **"Reprovar"** com motivo. Email `doctor_rejected` automático.

---

## 2. Cadastrar Plano de Telemedicina

**Onde:** banco de dados (`plans`) — falta UI admin específica.

```sql
INSERT INTO public.plans (name, description, price, interval, features, is_active, display_order)
VALUES (
  'Nome do Plano',
  'Descrição comercial',
  79.90,
  'monthly', -- ou 'one_time' ou 'yearly'
  '["benefício 1","benefício 2"]'::jsonb,
  true,
  4 -- ordem de exibição
);
```

**Existentes:** Consulta Avulsa R$ 89, Família R$ 49,90, Premium R$ 99.

---

## 3. Cadastrar Plano Pingo Card

```sql
INSERT INTO public.pingo_card_plans (
  name, slug, tagline, description, price_monthly, price_yearly,
  consultation_discount_percent, exam_discount_percent, partner_discount_percent,
  max_dependents, benefits, color, is_highlighted, is_active, display_order
)
VALUES (
  'Nome', 'slug-unico', 'Tagline curta', 'Descrição completa',
  39.90, 399.00,
  50, 40, 70,  -- % desconto consulta, exame, parceiros
  4,            -- max dependentes
  '["benefício 1","benefício 2","Assistência funeral até R$ 5.000"]'::jsonb,
  '#10b981', true, true, 4
);
```

**Importante:** se incluir "Assistência funeral", o sistema reconhece automaticamente que esse plano cobre o benefício (regex `/funeral/i`).

---

## 4. Cadastrar Parceiro Pingo Card (rede de descontos)

Painel: `/admin/pingo-card` → aba "Parceiros" → "Novo parceiro".

Ou via SQL:
```sql
INSERT INTO public.pingo_card_partners (
  name, category, description, discount_percent, discount_description,
  logo_url, website, phone, address, city, state, zip_code,
  is_active, is_featured, display_order
)
VALUES (
  'Drogaria São Paulo', 'pharmacy', 'Maior rede de farmácias',
  15, 'Até 15% off em medicamentos',
  'https://...', 'https://drogariasaopaulo.com.br', '0800...',
  'Av. Paulista 1000', 'São Paulo', 'SP', '01310-100',
  true, true, 1
);
```

---

## 5. Cadastrar Funeral Provider (funerária parceira)

```sql
INSERT INTO public.funeral_providers (
  name, cnpj, contact_phone, contact_email,
  coverage_areas, is_active, notes
)
VALUES (
  'Funerária Parceira',
  '00.000.000/0001-00',
  '(11) 3000-0000',
  'contato@funeraria.com.br',
  ARRAY['São Paulo','Guarulhos','Osasco'],
  true,
  'Atendimento 24h. Cobertura sepultamento simples.'
);
```

Quando paciente solicita funeral via `/cartao/funeral`:
1. Sistema valida se plano dele tem benefício
2. Cria pedido em `funeral_assistance_requests` (status: pending)
3. Email vai pro admin notificando
4. Admin atribui `assigned_provider_id` no painel
5. Funerária é acionada manualmente (telefone/email do provider)

---

## 6. Criar Sorteio Mensal

```sql
INSERT INTO public.sweepstakes (
  title, description, prize_value, prize_description,
  draw_date, ticket_generation_start, ticket_generation_end,
  authorization_code, regulation_url, status
)
VALUES (
  'Sorteio Maio 2026',
  'Sorteio mensal exclusivo Pingo Card.',
  20000.00,
  'R$ 20.000 em Pix',
  '2026-05-31',
  '2026-05-01',  -- janela início
  '2026-05-30',  -- janela fim
  'CAIXA-2026-XXX',  -- precisa autorização Caixa Econômica (Lei 5.768/71)
  'https://aloclinica.com.br/sorteios/maio-2026/regulamento.pdf',
  'open'
);
```

Cron `generate-sweepstake-tickets` roda no dia 1 de cada mês 03:00 e cria automaticamente:
- 1 cupom por assinante Essencial
- 5 cupons por assinante Família
- 15 cupons por assinante Premium

**Apurar sorteio:**
```sql
-- 1. Selecionar ticket vencedor (random)
WITH winner AS (
  SELECT t.id, t.user_id, t.ticket_number, t.sweepstake_id
  FROM public.sweepstake_tickets t
  WHERE t.sweepstake_id = 'SWEEPSTAKE_ID_AQUI'
  ORDER BY random() LIMIT 1
)
INSERT INTO public.sweepstake_winners (sweepstake_id, ticket_id, user_id, prize_value)
SELECT sweepstake_id, id, user_id, 20000.00 FROM winner;

-- 2. Marcar sweepstake como sorteado
UPDATE public.sweepstakes
SET status = 'drawn', drawn_at = now(),
    drawn_ticket_number = (SELECT ticket_number FROM winner)
WHERE id = 'SWEEPSTAKE_ID_AQUI';

-- 3. Marcar ticket como winner
UPDATE public.sweepstake_tickets
SET is_winner = true
WHERE id = (SELECT ticket_id FROM public.sweepstake_winners WHERE sweepstake_id = 'SWEEPSTAKE_ID_AQUI');
```

---

## 7. Vendas B2B (empresa compra cartões)

Empresa acessa `/empresas/checkout` (sem login obrigatório, mas precisa criar conta).

Fluxo:
1. Empresa preenche dados: CNPJ, razão social, contato, plano, qtd cartões (mín 5)
2. Sistema aplica 15% desconto B2B
3. Cria registro `companies` + `company_card_orders` (status: `pending_payment`)
4. **TODO:** integrar com Asaas pra gerar fatura corporativa
5. Funcionários recebem email com link `/funcionario/ativar/:token`
6. Funcionário ativa → cria `pingo_card_subscription` (relacionada à `company_card_order`)

**Verificar pedidos:** `/admin/empresas` (TODO criar UI; por enquanto SQL):
```sql
SELECT c.legal_name, cco.num_seats, cco.total_amount, cco.status, cco.next_billing_date
FROM public.company_card_orders cco
JOIN public.companies c ON c.id = cco.company_id
ORDER BY cco.created_at DESC;
```

---

## 8. Cancelar Assinatura

**Pingo Card:**
```sql
UPDATE public.pingo_card_subscriptions
SET status = 'cancelled', cancelled_at = now()
WHERE id = 'SUB_ID';
```

**Telemedicina:**
```sql
UPDATE public.subscriptions
SET status = 'cancelled'
WHERE id = 'SUB_ID';
```

---

## 9. Reembolso Pagamento

```bash
curl -X POST 'https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/process-refund' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"appointment_id":"...","reason":"motivo do reembolso"}'
```

Ou pelo painel Asaas direto: https://www.asaas.com/transactions

---

## 10. Configurar Cron Jobs

Já existem 20+ cron jobs no Supabase. Pra ver:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

Pra desativar temporariamente:
```sql
SELECT cron.unschedule('JOB_NAME');
```

Pra reativar:
```sql
SELECT cron.schedule('JOB_NAME', '*/5 * * * *', $$ SELECT public.invoke_edge_function('NOME_DA_FUNCTION'); $$);
```

---

## 11. Logs / Debug

**Edge Functions logs:** https://supabase.com/dashboard/project/pwxvvimdtmvziynbspgx/functions

**Database queries:** SQL Editor → "Query History"

**WAHA logs:** SSH no VPS → `docker logs waha --tail 100`

**Frontend logs:** Sentry (quando configurar) ou browser console

**Brevo email logs:** https://app.brevo.com/email-history

**WhatsApp:** dashboard WAHA → Sessions → ver mensagens

---

## 12. Backup / Restore

**Supabase:** painel → Database → Backups (7 dias retidos no Free)

**VPS:** painel Hostinger → Backups (ativar manualmente)

**Restore:** via dashboard Supabase. Não use rollback automatizado sem testar antes.

---

## 13. Adicionar Custom Domain Subsidiária

Se quiser criar `clinica.aloclinica.com.br` ou similar:

1. **DNS:** PUT em Hostinger API criando A record → 72.62.138.208
2. **Traefik:** SSH VPS → editar `/etc/easypanel/traefik/config/aloclinica-stack.yaml` adicionar rota
3. Aguardar Let's Encrypt provisionar (~30s)

---

## 14. Contatos Suporte

| Serviço | URL/Contato |
|---|---|
| Supabase | https://supabase.com/dashboard/support/new |
| Hostinger VPS | painel → Suporte 24/7 |
| Asaas | suporte@asaas.com |
| Brevo | https://help.brevo.com |
| Lovable.dev | dashboard interno |
| CFM (regulatório) | https://portal.cfm.org.br |
| ANPD (LGPD) | https://www.gov.br/anpd |
