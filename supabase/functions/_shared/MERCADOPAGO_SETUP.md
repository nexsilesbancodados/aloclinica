# Mercado Pago — Setup das Edge Functions

## 1. Secrets obrigatórios

Configure em **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Como obter | Obrigatório |
|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Painel MP → Suas aplicações → Credenciais → Production token (`APP_USR-...`) | **Sim** |
| `MERCADOPAGO_PUBLIC_KEY` | Painel MP → Credenciais → Public Key | Só pro frontend (passar via Vite env) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Painel MP → Webhooks → Secret Key (segredo de assinatura) | Recomendado |
| `APP_URL` | URL pública da app (ex `https://aloclinica.com.br`) | Sim |

## 2. Configurar Webhook no painel MP

URL:
```
https://<seu-projeto>.functions.supabase.co/mercadopago-webhook
```

Tipos de evento a marcar:
- `payment` (criação, atualização)
- `subscription_preapproval`
- `subscription_authorized_payment`

## 3. Edge functions disponíveis

| Função | Propósito |
|---|---|
| `mercadopago-create-payment` | PIX, boleto e cartão one-shot |
| `mercadopago-save-card` | Vault de cartão (tokenizado client-side) |
| `mercadopago-charge-saved-card` | Cobra cartão salvo (one-shot ou cron) |
| `mercadopago-create-subscription` | Assinatura recorrente (Pre-Approval) |
| `mercadopago-cancel-subscription` | Cancela Pre-Approval |
| `mercadopago-refund` | Estorno total ou parcial |
| `mercadopago-withdraw` | Saque PIX do médico (Money Out) |
| `mercadopago-webhook` | Receive notificações MP |

## 4. Tokenização do cartão no frontend

Carregar SDK no `index.html`:
```html
<script src="https://sdk.mercadopago.com/js/v2"></script>
```

No componente:
```ts
const mp = new (window as any).MercadoPago(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY);
const cardToken = await mp.createCardToken({
  cardNumber, cardholderName, cardExpirationMonth,
  cardExpirationYear, securityCode,
  identificationType: "CPF", identificationNumber: cpf,
});
// Mande cardToken.id pra mercadopago-create-payment ou mercadopago-save-card
```

## 5. Status codes mapeados

| MP status | Status interno |
|---|---|
| approved / authorized | `approved` |
| pending / in_process / in_mediation | `pending` |
| rejected | `refused` |
| cancelled | `cancelled` |
| refunded | `refunded` |
| charged_back | `chargeback` |

## 6. Money Out (saque médico)

`mercadopago-withdraw` chama `/v1/money_requests` no MP. Esse endpoint exige
que a conta tenha **Money Out** habilitado. Se não tiver:
- A função retorna `needs_manual: true`
- O saque fica em status `pending_manual`
- Admin processa manualmente no painel MP

Pra habilitar, contate o gerente da conta MP.

## 7. Checklist pré-produção

- [ ] `MERCADOPAGO_ACCESS_TOKEN` configurado (production token)
- [ ] Webhook criado no painel MP apontando pra `/functions/v1/mercadopago-webhook`
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` configurado e bate com o painel
- [ ] Frontend tem `VITE_MERCADOPAGO_PUBLIC_KEY` no .env
- [ ] SDK MP carregado no `index.html`
- [ ] Testar fluxo PIX completo (criar → pagar → webhook → appointment.payment_status="approved")
- [ ] Testar fluxo cartão (tokenizar → cobrar → resposta imediata)
- [ ] Testar refund de pagamento aprovado
- [ ] Testar criação + cancelamento de assinatura
