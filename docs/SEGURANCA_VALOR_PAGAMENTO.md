# 🔴 Vulnerabilidade: adulteração de VALOR de pagamento (design do fix correto)

**Data:** 2026-07-18 · Severidade: **CRÍTICA** (fraude de receita) · Status: **aberto — precisa de fix testado**

## Resumo

O valor cobrado numa consulta/plantão/renovação é, na prática, **definido pelo cliente** — não pelo servidor. Um usuário autenticado consegue pagar **R$1** por uma consulta real e o webhook a marca como `approved`.

## Por que uma correção simples NÃO resolve (verificado adversarialmente)

Uma primeira tentativa fez o servidor ler o preço de `appointments.price_at_booking` (em vez do `amount` do corpo). **Reprovada na verificação**, porque:

1. **A coluna de preço é escrita pelo próprio cliente.** O RLS de INSERT de `appointments` (`"Patients can create appointments"`) só checa `patient_id = auth.uid()` — o paciente insere `price_at_booking` com **qualquer** valor (`BookAppointment.tsx:493`). Idem `on_demand_queue.price` (`UrgentCareQueue.tsx:245`). Ler essa coluna é ler um número que o atacante controla.
2. **`price_at_booking` é nullable** → cairia no fallback do `amount` do cliente.
3. **Quebraria cupons** (cobraria a mais): `price_at_booking` guarda o `basePrice` (pré-cupom), mas o cliente paga `totalPrice = basePrice − cupom`. Sobrescrever com `price_at_booking` ignora o cupom.

Além disso, o **cupom é validado só no cliente** (`coupons` consultado em `BookAppointment.tsx:349`, desconto aplicado em memória e enviado como `amount`) — ou seja, o desconto também é forjável.

## Fontes autoritativas reais (o que o servidor DEVE usar)

| Preço | Fonte confiável (server-owned) |
|---|---|
| Base da consulta | `doctor_profiles.consultation_price` (só o médico/admin escreve) |
| Consulta de retorno | `consultation_price * 0.5` **se** elegível (checar `return_deadline` da consulta anterior no servidor) |
| Cupom | validar o código na tabela `coupons` **no servidor** e recalcular o desconto |
| Plantão 24h (queue) | recalcular por turno (existe `calculate-shift-price`) — não confiar em `on_demand_queue.price` |
| Renovação de receita | R$80 fixo (já é server-safe) |

## Design do fix correto (a implementar + testar)

Duas camadas (defesa em profundidade):

1. **Tornar a coluna de preço confiável (trigger).** `BEFORE INSERT` em `appointments` que **sobrescreve** `price_at_booking` com o preço calculado no servidor: `doctor_profiles.consultation_price` (× 0.5 se retorno elegível) − cupom validado no servidor. Idem para `on_demand_queue.price`. Assim o cliente não define mais o preço.
2. **Recalcular no pagamento.** Em `mercadopago-create-payment` / `-charge-saved-card`, derivar o valor da fonte autoritativa (após (1), ler `price_at_booking` já é seguro) e **ignorar** o `amount` do corpo. Recomputar `marketplace_fee` e `amount_cents` desse valor.
3. **Cupom server-side.** Endpoint/RPC que valida o código em `coupons` (ativo, dentro da validade, limite de uso) e retorna o desconto real; o front passa só o **código**, nunca o valor.
4. **Endurecer o RLS** de INSERT/UPDATE para o paciente não escrever `price_at_booking`/`price` (ou o trigger sempre sobrescreve).

## Por que não foi entregue já

Reimplementar a lógica de preço (retorno + cupom + turno) num caminho de **pagamento em produção**, sem ambiente para testar, arrisca **quebrar todos os agendamentos** ou **cobrar a mais** de clientes legítimos — pior que a vuln atual. A verificação adversarial recomendou explicitamente não subir sem a fonte de preço server-autoritativa.

## Recomendação

Implementar o design acima **com teste em staging** (agendar → aplicar cupom → pagar, para retorno/normal/plantão/renovação), validando que o valor cobrado bate com o preço real do médico e que cupons continuam funcionando. Posso implementar assim que houver como validar, ou você confirma as regras exatas de cupom/retorno para eu embutir no trigger.

## Mitigação imediata (enquanto o fix não sai)
- Monitorar `payment_transactions` por valores anômalos (ex.: `amount_cents` muito abaixo do `consultation_price` do médico) e alertar.
- Conciliar `appointments.price_at_booking` vs `doctor_profiles.consultation_price` num relatório.
