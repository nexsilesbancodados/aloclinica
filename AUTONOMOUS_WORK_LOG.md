# Autonomous Work Log

Registro contínuo do trabalho autônomo. Um bloco por ciclo
(ANALISAR → IMPLEMENTAR → TESTAR → CORRIGIR → VALIDAR → COMMITAR).

Branch: `deploy-production-target`.
**Push desativado por decisão de segurança** — esta branch é alvo de deploy de
produção e a regra vigente é "nunca alterar produção às cegas". Tudo fica
commitado localmente e documentado; o push é decisão do usuário.

---

## Ciclo 01 — Ocultar widgets de usuário comum no console admin

- **Prioridade:** P3 (UX/consistência do shell admin)
- **Tarefa:** admins viam widgets pensados para paciente/médico (assistente de
  dúvidas, convite de instalação do PWA, contador de mensagens do sino).
- **Arquivos:**
  - `src/hooks/use-admin-shell.ts` (novo)
  - `src/App.tsx`
  - `src/components/notifications/NotificationBell.tsx`
  - `src/components/dashboards/DashboardLayout.tsx`
  - `src/hooks/use-keyboard-shortcuts.ts`
- **Implementação:**
  - `PingoAssistantChat` e `PWAInstallPrompt` vivem **fora** do
    `DashboardLayout`, então o gate `!isAdminShell` do layout nunca os
    alcançava. Criado o wrapper `NonAdminOnly` no `App.tsx`.
  - Extraída a regra "estou no console admin" para `useIsAdminShell()` — estava
    duplicada inline em três lugares, com risco de divergir.
  - `NotificationBell` passou a usar papel **de painel** (`isAdminShell`) em vez
    de papel **de usuário** (`roles.includes("admin")`): um admin em "ver como
    paciente" volta a receber o sino do paciente. Como o valor agora varia em
    runtime, foi preciso `setUnreadMessages(0)` ao entrar no shell admin — sem
    isso o badge congelava com a contagem antiga.
  - `FaqChatWidget` virou `lazy()`: o admin não o renderiza e assim não carrega
    `react-markdown` junto com o shell.
  - Bottom-nav admin: `currentPath.includes("live")` → `includes("/admin/live")`
    (o teste antigo casava com qualquer rota contendo "live").
- **Mantidos de propósito:** `OfflineIndicator`, `PWAUpdateBanner`,
  `CookieBanner`, `MaintenanceBanner` — são infraestrutura/compliance, valem
  para todos os papéis.
- **Testes:** typecheck e lint sem erro novo; 5 arquivos de teste do shell,
  27/27 passando. Suíte completa: 334 passed / 2 failed — as 2 falhas
  (`doctor-panel`, `payment-flow`, timeouts de 5s) reproduzem igual no HEAD
  limpo, são flakes de carga pré-existentes, não regressão.
- **Commit:** `6bf633e0 fix(admin): ocultar widgets de usuário comum no console admin`
- **Pendência aberta:** variante admin de `/dashboard/notifications` (a página
  ainda é a do paciente, com hero "Dica de Saúde"). É decisão de produto, não
  bug — deixada fora do escopo.

---

## Ciclo 02 — P0: `Handshake` usado sem import quebra a landing do admin

- **Prioridade:** P0 (feature quebrada em produção)
- **Sintoma:** `src/components/admin/PanelCenter.tsx:237` usa
  `icon: Handshake` na lista `quickActions`, mas `Handshake` não estava no
  bloco de import do `lucide-react`. `quickActions` é montado no corpo do
  componente, então isso é `ReferenceError` **durante o render**.
- **Gravidade:** `PanelCenter` é a landing page do admin —
  `Dashboard.tsx:230` redireciona todo admin para
  `/dashboard/admin/panel-center`. É a primeira tela após o login.
- **Por que passou pelo build:** o `vite build` usa esbuild, que não faz
  typecheck. O `tsc` acusava o erro, mas o build ignora. Nenhum teste
  renderizava o `PanelCenter`.
- **Correção:** `Handshake` adicionado ao import do `lucide-react`
  (export válido, confirmado em runtime).
- **Regressão travada:** novo `src/test/admin-panel-center.test.tsx` monta o
  componente de verdade — um ícone não importado volta a quebrar o teste.
  Cobre: render sem throw, as 8 ações rápidas visíveis (incluindo "Contratos"),
  agregação de presença e limpeza do canal realtime no unmount.
- **Verificação do teste:** rodei o teste contra uma cópia do PanelCenter sem
  o import — falhou com "Handshake is not defined", como esperado. Guarda real,
  não teste de fachada. (Usei cópia descartável em vez de mexer no arquivo
  compartilhado: há outro worker commitando neste mesmo repositório.)
- **Estado da validação:** typecheck 0 erros — os 5 erros pré-existentes
  sumiram (4 corrigidos por outros workers, o 5º era este). `vite build` OK
  em 1m07s. Suíte: 340 passed / 1 failed (`payment-flow`, timeout de 5s; é o
  flake de carga já conhecido, passa isolado).
- **Commit:** `394a1dd7 fix(admin): importar Handshake e travar a regressão no PanelCenter`

---

## Ciclo 03 — Links mortos de navegação

- **Prioridade:** P1 (navegação quebrada em todos os painéis)
- **Como apareceu:** o ciclo 02 mostrou que erro de rota não gera erro visível.
  Fiz então uma varredura cruzando rota referenciada × `<Route>` registrado.
  Achei **16 links mortos**. Sem rota registrada, o fallback do `Dashboard`
  redireciona para `/dashboard` e o do `App` cai no `NotFound` — nos dois casos
  o usuário clica e nada acontece, sem erro no console.
- **Corrigidos (destino correto já existia):**

  | Link morto | Destino correto | Onde |
  |---|---|---|
  | `/termos` | `/terms` | `Footer`, `SignupDoctor` |
  | `/privacidade` | `/privacy` | `Footer`, `SignupDoctor` |
  | `/dashboard/patient/appointments` | `/dashboard/appointments` | `AppointmentReceipt` |
  | `/dashboard/patient/prescriptions` | `/dashboard/history` | `QuickRxRenewal`, `PostConsultationSummary`, `AppointmentDetail`, `GlobalCommand` |
  | `/dashboard/patient/exam-results` | `/dashboard/patient/exams` | `PatientDashboard` |
  | `/dashboard/admin/audit` | `/dashboard/admin/logs` | `PanelCenter` |
  | `/dashboard/prescriptions/:id` | `/dashboard/prescriptions` | `GlobalCommand` (não há rota de detalhe) |

  **`/termos` e `/privacidade` eram os links de Termos de Uso e Política de
  Privacidade no rodapé do site.** Ambos 404 — página legal inacessível em
  plataforma de saúde é problema de conformidade, não só de UX.

- **Bug extra encontrado no caminho** (`GlobalCommand.tsx`): o resultado de
  busca de receita montava `?appt=${r.id}` passando o **id da receita** onde se
  espera o **id da consulta** — e o `select` nem trazia `appointment_id`. Ou
  seja: mesmo que a rota existisse, o destaque nunca casaria. Adicionado
  `appointment_id` ao select e corrigido o link.
- **Deep link agora funciona de verdade:** `MedicalHistory` passou a ler
  `?appt=<id>` e rolar até a consulta, destacando o card. Antes esses links
  levavam a lugar nenhum; agora levam ao ponto certo da lista. O destaque
  **não** dispara o resumo de IA — isso continua sendo ação explícita do
  usuário, para não gerar chamada paga sem ele pedir.
- **Guarda sistêmica:** novo `src/test/dead-links.test.ts` cruza rotas
  registradas × referenciadas e falha se aparecer link morto novo. As 11 rotas
  que exigem página nova ficam num `KNOWN_MISSING` explícito (documentado em
  `BLOCKED_TASKS.md`); o teste também falha se alguém criar a página e esquecer
  de tirar da lista, então a lista só encolhe.
- **Verificação do teste:** removi uma entrada do `KNOWN_MISSING` e o teste
  falhou apontando a rota e o arquivo que a referencia. Guarda real.
- **Teste E2E que escondia o bug:** `tests/navigation.spec.ts` tinha "terms
  page loads correctly" e "privacy page loads correctly" indo para `/termos` e
  `/privacidade` — as rotas inexistentes — e passando, porque só exigiam
  `body` visível, o que a página de 404 também satisfaz. Passaram a usar a URL
  canônica (a mesma do `sitemap.xml`) e a conferir o título da página, então
  agora um 404 reprova.
- **Documento legal com URL errada:** `docs/legal/termo-consentimento-
  telemedicina.md` mandava o paciente exercer direitos LGPD em
  `/dashboard/privacidade` (2 ocorrências) — rota que não existe. Corrigido
  para `/dashboard/patient/lgpd`. É o termo de consentimento entregue ao
  paciente, então a URL precisa levar a algum lugar.
- **Pendência aberta:** o `PanelCenter` tem dois cards ("Logs de Erro" e
  "Auditoria") indo para a mesma página. Não existe página de logs de erro — o
  `AdminLogs` é "Histórico de Atividades". Só corrigi o link morto; fundir ou
  renomear os cards é decisão de produto.
- **Não implementado de propósito:** 11 rotas exigem página nova, não correção
  de link. Estão em `BLOCKED_TASKS.md` com o que falta decidir em cada uma. A
  mais grave: **o painel da recepção tem as 4 ações principais mortas.**
- **Validação:** typecheck 0 erros, lint sem erro novo (3 warnings
  `exhaustive-deps` pré-existentes, em effects que não são meus),
  **51 arquivos / 345 testes, todos passando** — inclusive o `payment-flow`
  que vinha oscilando.
- **Commit:** `8e0fb88e fix(navegacao): corrigir links mortos e travar regressao`

---

## Ciclo 04 — Divergência de esquema: investigado, **revertido**, documentado

- **Prioridade:** seria P0 (dados/pagamento) — virou bloqueio por falta de
  acesso ao banco.
- **Como começou:** ao estudar a página de assinaturas do admin (a de menor
  risco entre as páginas faltantes), reparei que a migration define
  `subscriptions.started_at` e o `AdminDashboard` consulta `starts_at`.
- **O que encontrei:** `types.ts` (gerado a partir de um banco) e a cadeia de
  migrations descrevem **esquemas diferentes** — em `subscriptions` e também em
  `doctor_profiles`. Uma auditoria cruzando os `.select()` do código com o
  `types.ts` acusa **153 colunas inexistentes** em ~40 arquivos.
- **Erro meu, corrigido no meio do caminho:** tratei o `types.ts` como fonte da
  verdade e cheguei a alterar `PaymentHistory.tsx` e `AdminDashboard.tsx` para
  os nomes de lá. Aí testei a premissa e ela caiu: nenhuma migration renomeia
  ou derruba `starts_at`/`payment_method`, uma migration de seed faz `INSERT`
  usando essas colunas **sem guarda** (teria falhado se não existissem), e
  `rating_avg` não aparece em nenhum arquivo do app — só no `types.ts`. Ou
  seja, o app inteiro está de um lado e o `types.ts` do outro; o mais provável
  é que ele tenha sido gerado do esquema consolidado de instalação limpa, não
  do banco de produção.
- **Ação:** **revertí as duas alterações** (`git checkout --`). Trocar
  `starts_at` por `started_at` com base numa fonte que acabei de desqualificar
  quebraria código que hoje funciona. Nenhuma alteração de código sobreviveu
  deste ciclo — de propósito.
- **Entregue:** `scripts/schema-audit.mjs` versionado (com aviso no cabeçalho
  para não sair corrigindo às cegas) e a seção 2 do `BLOCKED_TASKS.md` com as
  duas queries de `information_schema` que resolvem a dúvida em um minuto para
  quem tiver acesso ao banco.
- **Achado adjacente, não tocado:** o `mercadopago-webhook` grava em colunas e
  numa tabela (`payment_transactions`) que a migration `20260602025247`
  derrubou, e nada recria. O `BillingPortal.tsx` já tinha sido reconciliado com
  essa remoção; o webhook não. Se confirmar, cobrança recorrente falha calada.
  **Não mexi: é caminho de dinheiro** e a regra é parar antes de alterar
  cobrança.
