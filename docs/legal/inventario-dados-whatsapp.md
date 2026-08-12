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
| `send-prescription` | Nome do titular, nome do profissional | Metadado (ver §4) |
| `appointment-confirmed` | Profissional, data/hora, recibo | Metadado de agenda |
| `appointment-reminders` | Profissional, data/hora | Metadado de agenda |
| `post-consultation-survey` | Profissional | Metadado de agenda |
| `scheduled-tasks` (não comparecimento) | Profissional, data/hora, valor da taxa | Metadado + financeiro |
| `cart-abandonment` | Profissional, data/hora | Metadado de agenda |
| `whatsapp-notify` | Texto livre (limitado a 500 caracteres) | **Variável — ver §5** |

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

## 4. Decisão tomada: conteúdo clínico fora do WhatsApp

Até 2026-08-12 a mensagem de `send-prescription` transportava, **no corpo**, a lista de
medicamentos prescritos e o diagnóstico. Isso foi removido.

Motivo — o WhatsApp tem três pontos de exposição que a plataforma autenticada não tem:

1. O gateway persiste a mensagem no banco (§3);
2. A prévia da mensagem aparece na tela bloqueada do aparelho;
3. O número pode estar em aparelho compartilhado.

Diagnóstico e prescrição são **dado pessoal sensível** (LGPD, Art. 5º, II). O conteúdo
completo permanece disponível na plataforma, sob autenticação, e a própria mensagem já
instruía o titular a acessá-la — a remoção não retira informação do alcance dele.

A restrição está documentada em comentário no código, em `send-prescription/index.ts`,
para não ser reintroduzida por engano.

## 5. Risco aberto: `whatsapp-notify`

`whatsapp-notify` encaminha **texto livre** (truncado em 500 caracteres) para o WhatsApp do
titular. Não há filtro de conteúdo: se um chamador passar conteúdo clínico, ele trafega e é
persistido. A proteção do §4 é específica de `send-prescription` e **não** cobre este fluxo.

> **Pendência:** mapear os chamadores de `whatsapp-notify` e decidir entre restringir o uso,
> validar o conteúdo, ou documentar a responsabilidade de quem chama.

## 6. Itens em aberto

- [ ] Definir retenção/expurgo do Postgres da Evolution, ou desligar a persistência (§3)
- [ ] Tratar o texto livre de `whatsapp-notify` (§5)
- [ ] Incluir o banco da Evolution no registro de operações de tratamento do DPO
- [ ] Confirmar a base legal do envio por WhatsApp e refleti-la no termo de consentimento
      (ver [`termo-consentimento-telemedicina.md`](./termo-consentimento-telemedicina.md))
