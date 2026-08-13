# Relatório da sessão autônoma — 2026-08-13

Branch: `deploy-production-target` · Tudo pushado · **Nada foi deployado em produção.**

---

## Resumo em três linhas

1. O achado mais importante da noite: **uma das migrations pendentes derrubaria o plantão 24h
   inteiro** se aplicada — e aplicaria "com sucesso", sem erro nenhum na hora.
2. Corrigi um vazamento de memória e cortei **7,5 MB** do carregamento inicial da PWA.
3. Descobri que o painel admin deixava configurar o DocuSeal sem que isso tivesse efeito algum.

---

## Estado inicial (medido, não presumido)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | 0 erros, 99 warnings |
| `vitest run` | 53 arquivos, **358 testes passando** |
| `npm run build` | ok, 40,6 s |
| TODO/FIXME no `src/` | **nenhum** (só 6 `eslint-disable` de `exhaustive-deps`) |
| Playwright E2E | **não executável** — browsers ausentes |

O código estava saudável. O trabalho relevante não estava em dívida de código — estava em
configuração, performance e no banco.

---

## 1. ⛔ Migration que quebraria produção em silêncio

**Severidade: crítica. Bloqueada, não corrigida.**

`20260809100300_on_demand_queue_integrity.sql` escreve em **oito colunas que não existem**:
`paid_at`, `price`, `payment_id`, `shift`, `assigned_at`, `started_at`, `completed_at`,
`appointment_id`.

Verificado por três vias independentes:

- nenhum `CREATE TABLE on_demand_queue` do repositório as declara;
- não existe nenhum `ALTER TABLE ... ADD COLUMN` (os únicos `ALTER` são `ENABLE ROW LEVEL SECURITY`);
- `src/integrations/supabase/types.ts`, **gerado a partir do banco em produção**, lista apenas
  `id, patient_id, specialty_id, status, priority, assigned_doctor_id, symptoms, created_at, updated_at`.

**Por que é traiçoeiro:** o corpo de uma função PL/pgSQL não é validado no `CREATE FUNCTION`.
A migration **aplica limpa**. O erro só aparece na primeira escrita, como
`ERROR: record "new" has no field "paid_at"` (42703). E como o early-return de
`service_role`/admin acontece antes de tocar qualquer campo, **os writers do servidor continuam
funcionando** — o monitoramento não acusa nada, enquanto nenhum paciente entra na fila e nenhum
médico assume atendimento.

**O preflight não pega:** `scripts/verify_pending_migrations.sql` testa só `appointment_id`.
As outras sete passam batido, o script dá verde e a migration destrói a fila mesmo assim.

Ação tomada: aviso de bloqueio no topo de `docs/APLICAR-MIGRATIONS-PENDENTES.md`, que hoje
instrui aplicar essas migrations.

> Isto corrige uma recomendação que **eu mesmo tinha dado antes**, de rodar o preflight e
> aplicar. O preflight não era suficiente.

### Outros achados nas migrations (revisão cruzada, não corrigidos)

Exigem decisão de schema/produto, não conserto mecânico:

- **Teto de preço na coluna errada** — o gatilho ancora em `doctor_profiles.price`, mas o app
  lê e escreve `consultation_price`. Médico ajusta para R$300, paciente paga R$300, o gatilho
  aplica `LEAST(300, 89)` e o repasse sai sobre 89. Subpagamento silencioso em toda consulta.
- **Ordem de INSERT no plantão** — o gatilho exige `assigned_doctor_id` já preenchido, mas
  `DoctorOnDutyPanel` insere a consulta *antes* de gravar esse campo. O único fluxo que a
  migration afirma preservar não tem como passar.
- **Reembolso vira no-op** — `status:'refunded'` não está na lista permitida; o gatilho reverte,
  a UI mostra "Reembolso solicitado com sucesso" e a entrada volta na próxima recarga.
- **`20260809100300` está omitida** do loop de aplicação do próprio runbook e do cabeçalho do
  script de verificação, embora o script cheque um trigger que só ela cria.

### Corrigido

`20260809100200` não era idempotente: dropava `"Doctors view queue"` e criava
`"Approved doctors view waiting queue"` — nomes diferentes, então reexecutar abortava com 42710.
Os outros quatro blocos do mesmo arquivo já dropavam e criavam o mesmo nome; este ficou fora do
padrão. Importa porque o runbook manda aplicar arquivo a arquivo, e retry após falha parcial é
caminho realista.

---

## 2. Performance da PWA — 7,5 MB a menos na primeira visita

**Precache: 311 entradas / 13,7 MB → 273 / 6,2 MB (−54%).**

`globPatterns` incluía `png`, forçando o download de 38 imagens (7,46 MB) na primeira visita de
um app usado majoritariamente por celular. As imagens **já eram cobertas** pela regra
`CacheFirst` de `images-cache` em `runtimeCaching` — estavam sendo cacheadas duas vezes. Agora
entram no cache quando de fato usadas.

Verificado que não quebrei o service worker: `index.html` segue no precache (sem ele o Workbox
lança `non-precached-url` e a PWA renderiza página em branco), `sw-local.js` e `workbox` gerados,
e todos os assets referenciados pelo `index.html` existem no `dist`. Os ícones do próprio PWA
continuam precacheados — são necessários para instalação.

### Vazamento de listener corrigido

`use-pwa-install.ts` registrava `appinstalled` com **função anônima inline**, impossível de
remover. O cleanup só removia `beforeinstallprompt`. Cada mount deixava um listener permanente
segurando os setters de um componente já desmontado.

### Investigado e descartado (sem bug)

- **`vendor-icons`, 500 KB** — verifiquei antes de "otimizar": não há import de namespace, e os
  lookups dinâmicos indexam mapas locais montados com ícones importados explicitamente. São
  **202 ícones distintos realmente usados** em 260 arquivos. Tree-shaking está funcionando;
  107 KB gzip é uso legítimo.
- **`setInterval` sem limpeza** — nenhum. Todos os 30+ têm `clearInterval`.
- **`PatientDashboard` / `main.tsx`** — falso positivo do meu próprio heurístico: os três
  `removeEventListener` estão na mesma linha, e os de `main.tsx` são de escopo de módulo
  (recuperação de erro de chunk), com tempo de vida da aplicação.

---

## 3. DocuSeal — configuração que não configurava nada

`secret-catalog.ts` declara `DOCUSEAL_BASE` como editável e o painel admin permite salvá-la.
Mas `docuseal-proxy/index.ts` **nunca lia essa env**: usava `http://72.62.138.208:3200`, fixo no
código. O admin salvava a URL, via "salvo com sucesso", e nada mudava — a chamada continuava
indo para um endereço que não existe mais na VPS.

Agora resolve a partir de `DOCUSEAL_BASE` e **exige HTTPS**, pelo mesmo critério já adotado em
`_shared/evolution.ts`: ali trafegam documentos clínicos para assinatura, que não podem ir em
texto claro. Sem a env, responde 503 com mensagem explícita em vez de pendurar a requisição.

Limitação conhecida e registrada no commit: o `functions.invoke` do supabase-js não expõe o corpo
da resposta, então a mensagem detalhada não chega ao usuário final. Não fui adiante porque o
DocuSeal não tem servidor implantado — seria dourar feature morta.

---

## 4. Métricas fabricadas ainda no produto

**Encontrado, não corrigido — precisa da sua decisão.**

Cinco dashboards exibem variação percentual **inventada**, com valor constante no código:

| Arquivo | Valores |
|---|---|
| `AdminDashboard.tsx` | `trend: 18`, `trend: 24` |
| `ClinicDashboard.tsx` | `trend: 5`, `trend: 12`, `trend: 18` |
| `DoctorDashboard.tsx` | `trend: 8`, `trend: 15` |
| `PartnerDashboard.tsx` | `trend: 8` |

O `value` vem de dados reais; a variação ao lado é constante. É a mesma classe que os commits
`replace fabricated dashboard metrics` e `remove hardcoded storage metric` atacaram — a limpeza
foi começada e não terminada.

Não corrigi porque há duas saídas legítimas e a escolha é sua: **remover** a variação (foi o que
o commit anterior fez) ou **calcular de verdade**, o que exige comparação com período anterior e
pode não ter dado histórico disponível. Mostrar crescimento de receita inventado num painel
administrativo não é detalhe cosmético.

---

## Testes executados

| Suíte | Resultado |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | limpo |
| `eslint .` | 0 erros, 99 warnings (pré-existentes) |
| `vitest run` (após as mudanças) | **358/358 passando**, 53 arquivos |
| `npm run build` | ok |
| Verificação de integridade do service worker | ok |
| Playwright E2E | **30 passando**, 1 pulado, exit 0 |

**Teste instável observado:** uma execução do vitest acusou 2 falhas; a seguinte passou 358/358.
Aquela execução levou 95 s contra 27 s da primeira, sob disputa de CPU com o subagente rodando em
paralelo. Não "consertei" mexendo em timeout — não tenho o nome do teste que falhou, e alterar
config de teste com base em palpite é o tipo de mudança que parece produtiva e não é. Fica
registrado: **12 arquivos de teste usam asserção sensível a tempo** e são os suspeitos.

### Playwright E2E — destravado e passando

Os browsers não estavam instalados, então a suíte **nunca havia rodado**. Instalei o Chromium e
esbarrei num descompasso: `playwright-core/browsers.json` fixa o chromium na revisão **1208**,
mas o `playwright install` baixou a **1234**, e o diretório `chromium-1208` ficou vazio. Todos os
pacotes são 1.58.2 — o conflito é entre manifesto e download, não entre versões.

Isso se manifesta como "suíte inteira quebrada"
(`Executable doesn't exist at .../chromium_headless_shell-1208`), o que engana: não há nada
errado com os testes. Contornei com `PLAYWRIGHT_EXECUTABLE_PATH` — gancho que o próprio
`playwright.config.ts` já suportava — apontando para o chrome 1234 existente.

**Resultado: 30 passando, 1 pulado, exit 0.** Cobre erros de console na landing, viewports 375px
e 1280px, proteção de `/dashboard` e das rotas de consulta, validação de formulário, navegação
por teclado, dark mode e manifest PWA. Isso também valida a mudança do precache num browser real.

Deixei o diagnóstico e o contorno comentados no `playwright.config.ts` para o próximo não perder
uma hora achando que a suíte está quebrada.

Comando para reproduzir:

```bash
PLAYWRIGHT_EXECUTABLE_PATH=".../ms-playwright/chromium-1234/chrome-win64/chrome.exe" \
  npx playwright test
```

---

## Commits (todos pushados)

| Hash | O quê |
|---|---|
| `b31fcbc5` | `perf(pwa)` — leak de listener + 7,5 MB fora do precache |
| `ed97c54f` | `fix(docuseal)` — honrar `DOCUSEAL_BASE`, exigir HTTPS |
| `512dbd2f` | `fix(db)` — bloqueio da migration + idempotência |

Antes destes, na mesma noite: `8b9b8037` (documentação da colisão de nomes que quebrou a home),
`e0bb2de1`, `63a3ea0c`, `e9c32cb5`.

`git push` → ok. **Nenhum merge para `main`, nenhum deploy disparado.**

---

## Incidente de produção resolvido antes desta sessão

Registrado aqui porque é da mesma noite e explica o estado da VPS.

O merge do PR #90 disparou deploy e o health check falhou de verdade: a home respondia 200 **sem
CSS**, para ~2 em cada 3 usuários. Causa: o serviço swarm do Easypanel declara o alias de rede
`aloclinica-web`, o mesmo nome do container do compose. O DNS do Docker registrava o nome duas
vezes e fazia round-robin, servindo um build de 10/08 que referenciava um CSS já inexistente.

Corrigido com `docker service scale aloclinica_web=0`. O sintoma que entrega o caso rápido:
`Content-Length` oscilando entre dois valores e `getent hosts aloclinica-web` devolvendo mais de
um IP. Documentado em `ARCHITECTURE.md` e `RUNBOOK.md`.

**Antes de reescalar `aloclinica_web`, remova o alias** — senão a produção quebra do mesmo jeito.

---

## Bloqueios que dependem de você

| Bloqueio | Impacto |
|---|---|
| `COTURN_PASS` nos secrets | O coturn está **no ar e testado**, mas não é usado sem o secret. Senha em `/opt/coturn/credential`. |
| `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` | WhatsApp 100% parado. O log do Traefik prova que a URL atual está errada. |
| Parear o WhatsApp por QR | Instância em `connecting`, `ownerJid: null`, 0 mensagens desde 30/jul. Precisa do celular da clínica. |
| Decisão sobre as migrations | Uma não pode ser aplicada; três têm achados abertos. |
| Merge para `main` | Deploy de produção de plataforma médica. Não faço sem autorização explícita. |

---

## Próximos passos recomendados, em ordem

1. **Não aplique `20260809100300`.** Decida antes: criar as oito colunas ou remover a migration.
2. Corrigir a âncora do teto de preço (`price` vs `consultation_price`) — é subpagamento silencioso.
3. Decidir sobre as métricas fabricadas nos cinco dashboards.
4. Configurar `COTURN_PASS` — é um comando e destrava vídeo para quem está atrás de NAT simétrico.
5. Investigar o teste instável do vitest com o nome em mãos.
6. Resolver o descompasso do Playwright na raiz (o CI vai bater nele) — ou fixar
   `PLAYWRIGHT_EXECUTABLE_PATH` no workflow, ou forçar o download da revisão 1208.

---

## O que eu deliberadamente não fiz

- **Não deployei em produção.** Uma mudança minha, analisada e verificada, quebrou a home hoje
  para 2 em cada 3 usuários e só apareceu após investigação de várias camadas. Fazer isso sem
  supervisão numa plataforma de telemedicina não é autonomia, é aposta.
- **Não corrigi as migrations restantes** — exigem decisão de schema e de produto.
- **Não "consertei" o teste instável** com base em palpite.
- **Não otimizei o `vendor-icons`** depois de verificar que não havia problema real.
