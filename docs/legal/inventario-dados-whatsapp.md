# Inventário de dados — canal WhatsApp (Evolution API)

Registro **técnico** do fluxo de dados pessoais pelo canal WhatsApp, para dar suporte ao
trabalho do DPO (ver [`nomeacao-dpo-lgpd.md`](./nomeacao-dpo-lgpd.md)). Não é parecer jurídico:
descreve o que o sistema faz hoje, verificado em código e na infraestrutura.

**Última verificação:** 2026-08-12.

---

## 1. Onde o dado passa

```
Edge Function (Supabase)  →  Evolution API (VPS 72.62.138.208)  →  WhatsApp  →  aparelho do titular
                                      │
                                      └──► Postgres da Evolution (mesma VPS)
```

O gateway é **Evolution API v2.3.7**, em container na VPS, com Postgres e Redis próprios.
O envio é sempre `message/sendText` — **não há envio de mídia/anexo**. Documentos não são
transmitidos pelo WhatsApp; o titular acessa a plataforma autenticada para obtê-los.

## 2. Fluxos que usam o canal

| Fluxo | Dado no corpo da mensagem | Natureza |
|---|---|---|
| `send-prescription` | Titular, profissional, **medicamentos prescritos** | Sensível — ver §4 |
| `appointment-confirmed` | Profissional, data/hora, recibo | Metadado de agenda |
| `appointment-reminders` | Profissional, data/hora | Metadado de agenda |
| `post-consultation-survey` | Profissional | Metadado de agenda |
| `scheduled-tasks` (não comparecimento) | Profissional, data/hora, valor da taxa | Metadado + financeiro |
| `cart-abandonment` | Profissional, data/hora | Metadado de agenda |
| `whatsapp-notify` | Profissional, data/hora (templates fixos) | Metadado de agenda — §5 |

Metadado de agenda revela a existência de relação assistencial e o profissional envolvido.
É o mínimo necessário para a finalidade (lembrar de uma consulta exige dizer qual e quando),
mas ainda assim é dado pessoal e deve constar do inventário.

## 3. Retenção no gateway

A Evolution está configurada com **`DATABASE_SAVE_DATA_NEW_MESSAGE=true`** (também
`DATABASE_SAVE_MESSAGE_UPDATE`, `DATABASE_SAVE_DATA_CONTACTS`, `DATABASE_SAVE_DATA_CHATS`,
`DATABASE_SAVE_DATA_HISTORIC`). Portanto **toda mensagem enviada é persistida** no banco
`aloclinica` do container `aloclinica_evolution-api-db`.

Verificado em 2026-08-12:

- Conteúdo atual: `Message=0`, `Contact=0` — o canal nunca foi usado em produção.
- O Postgres **não tem porta publicada** no host nem na internet; só rede Docker interna.
- Não há política de retenção nem expurgo definidos para esse banco.

> **Pendência:** definir retenção e responsável pelo expurgo, ou desligar a persistência
> (`DATABASE_SAVE_DATA_NEW_MESSAGE=false`). Enquanto o banco está vazio, essa decisão não
> tem custo de migração — é o momento mais barato para tomá-la.

## 4. Decisão tomada: diagnóstico fora do WhatsApp, medicamentos dentro

Até 2026-08-12 a mensagem de `send-prescription` transportava, no corpo, a lista de
medicamentos **e** o diagnóstico. O diagnóstico foi removido; a lista de medicamentos
permaneceu.

O WhatsApp tem três exposições que a plataforma autenticada não tem:

1. O gateway persiste a mensagem no banco (§3);
2. A prévia aparece na tela bloqueada do aparelho;
3. O número pode estar em aparelho compartilhado.

O critério aplicado foi **utilidade para o titular versus sensibilidade**:

- **Medicamentos ficam.** É o que o paciente precisa ter à mão na farmácia. Obrigá-lo a
  abrir a plataforma só para saber o que tomar é atrito sem ganho real — ele já sabe o que
  lhe foi prescrito, e a consulta acabou de acontecer.
- **Diagnóstico sai.** É a parte mais sensível (LGPD, Art. 5º, II) e a menos acionável
  naquele momento: não é necessário para comprar o medicamento. Continua disponível na
  plataforma, sob autenticação.

O critério está registrado em comentário no código, em `send-prescription/index.ts`, para
que uma alteração futura seja uma decisão consciente e não um descuido.

## 5. `whatsapp-notify` — verificado, sem risco de conteúdo livre

O chamador **não** controla o texto. A função aceita apenas `tipo` de um enum fechado
(`consulta_agendada`, `lembrete_1h`, `nova_consulta`) e monta a mensagem a partir de
**templates fixos** no próprio código. O campo `dados` só preenche marcadores de agenda —
`nome_paciente`, `nome_medico`, `data`, `hora`, `appointment_id`. Não há campo clínico, e
`tipo` desconhecido retorna 400.

Controles adicionais já presentes:

- Exige `isInternalOrService`; não é invocável a partir do navegador.
- Os dois chamadores (`lembrete-consultas`, `no-show-reminder-tick`) enviam payload
  estruturado com `x-internal-secret`, nunca texto.

Portanto o conteúdo deste fluxo é **metadado de agenda**, do mesmo nível dos demais em §2.
Não é necessária nenhuma restrição adicional.

## 6. Itens em aberto

- [ ] Definir retenção/expurgo do Postgres da Evolution, ou desligar a persistência (§3)
- [x] ~~Tratar o texto livre de `whatsapp-notify`~~ — verificado: não existe texto livre (§5)
- [ ] Incluir o banco da Evolution no registro de operações de tratamento do DPO
- [ ] Confirmar a base legal do envio por WhatsApp e refleti-la no termo de consentimento
      (ver [`termo-consentimento-telemedicina.md`](./termo-consentimento-telemedicina.md))
