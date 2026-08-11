# Blocked Tasks

Itens que **não** foram implementados porque dependem de decisão de produto ou
de acesso que não tenho. Nenhum é impedimento técnico puro — todos têm o
caminho descrito para quando houver a decisão.

---

## 1. Páginas prometidas pela UI que não existem

A varredura de navegação (`src/test/dead-links.test.ts`) encontrou 11 rotas
referenciadas na interface sem `<Route>` registrado. Sem rota, o fallback do
`Dashboard` manda o usuário de volta para `/dashboard` **sem erro nenhum** —
clica e "não acontece nada".

Os links cujo destino correto já existia foram corrigidos (ver
`AUTONOMOUS_WORK_LOG.md`, ciclo 03). Os de baixo pedem **página nova**, não
correção de link, e por isso pararam aqui.

| Rota | Quem promete | O que falta decidir |
|---|---|---|
| `/dashboard/admin/subscriptions` | `AdminDashboard` (KPI "Assinaturas" + "ver todas") | Escopo da página. Backend pronto: tabelas `subscriptions` + `plans`, RLS `Admins manage subscriptions` já existe. É a de menor risco para implementar. |
| `/dashboard/doctor/analytics` | `DoctorDashboard` (pill + botão) | O dashboard do médico já tem uma seção de análises embutida. Decidir: virar página própria ou o link só rolar até a seção. |
| `/dashboard/plans` | `PaymentHistory` (upgrade de plano) | **Não existe nenhuma página de planos**, nem pública nem interna. É decisão comercial: o que exibir, quais planos, com que preço. |
| `/dashboard/prescribe` | `DoctorPrescriptions` ("Nova Receita"), `empty-state` | Só existe `prescribe/:appointmentId`. Uma receita exige consulta. Decidir: seletor de consulta antes do formulário, ou remover o botão. |
| `/dashboard/clinic/my-exams` | `ClinicDashboard` (pill "Exames") | Não há visão de exames para clínica. `exam-request` é exclusivo de médico. |
| `/dashboard/partner/validate` | `PartnerDashboard` (nav), `RoleOnboarding` | O painel do parceiro tem nav e onboarding apontando para páginas que não existem. O parceiro hoje não consegue validar receita pela UI. |
| `/dashboard/partner/history` | `PartnerDashboard` (nav), `RoleOnboarding` | idem. |
| `/dashboard/reception/schedules` | `ReceptionDashboard` | **O painel da recepção é o mais afetado: as 4 ações principais são links mortos.** Existem páginas equivalentes de clínica (`clinic/schedules`, `clinic/patients`, `clinic/waiting-room`), mas com `allowed={["clinic"]}` — um recepcionista é barrado pelo `RoleGuard`. |
| `/dashboard/reception/checkin` | `ReceptionDashboard` | Não há equivalente de clínica; página nova. |
| `/dashboard/reception/patients` | `ReceptionDashboard` | Reusar `ClinicPatients` exigiria liberar o papel `receptionist`. |
| `/dashboard/reception/waiting` | `ReceptionDashboard` | Equivalente seria `clinic/waiting-room`, mesma questão de papel. |

**Por que não liberei o papel `receptionist` nas rotas de clínica:** seria
ampliar permissão, e a regra vigente é não reduzir segurança em silêncio. As
páginas de clínica escopam os dados pela clínica do usuário logado; um
recepcionista pode não ter registro de clínica próprio, e nesse caso o
resultado seria página vazia — ou, pior, dados de outra clínica. Isso precisa
de decisão explícita sobre o modelo de vínculo recepcionista↔clínica.

Enquanto não houver decisão, as 11 rotas estão registradas em `KNOWN_MISSING`
no teste. O teste **falha se aparecer link morto novo** e falha também se
alguém implementar a página e esquecer de tirar da lista.

---

## 2. `types.ts` não corresponde ao banco que as migrations constroem

**Isto é o achado mais importante do turno e precisa de alguém com acesso ao
banco para resolver.** Não é hipótese: os dois lados estão verificáveis no
repositório e se contradizem.

`src/integrations/supabase/types.ts` é gerado a partir de um banco. Comparando-o
com a cadeia de migrations, eles descrevem **esquemas diferentes**:

| Tabela | Migrations dizem | `types.ts` diz |
|---|---|---|
| `subscriptions` | `starts_at`, `payment_method`, `notes`, `current_period_end` | `started_at`, e nenhuma das outras três |
| `doctor_profiles` | `consultation_price`, `rating`, `total_reviews`, `education`, `experience_years` | `price`, `rating_avg`, `rating_count` |

O que descarta as explicações fáceis:

- **Não foi renomeação registrada:** não existe `ALTER TABLE ... RENAME COLUMN`
  para nenhuma dessas colunas, nem `DROP COLUMN` de `starts_at`,
  `payment_method` ou `current_period_end`. Se o banco do `types.ts` fosse o
  mesmo que as migrations constroem, essas colunas ainda estariam lá.
- **As migrations antigas rodaram mesmo:** `20260228203424` faz
  `INSERT INTO public.subscriptions (..., starts_at, current_period_end,
  payment_method)` sem guarda nenhuma. Se essas colunas não existissem, a
  migration teria falhado e travado a cadeia.
- **O código de aplicação usa só os nomes antigos:** `rating_avg` não aparece em
  nenhum arquivo além do próprio `types.ts`; 9 arquivos usam `total_reviews`.
  Não é uma renomeação pela metade — é o app inteiro de um lado e o `types.ts`
  do outro.

A leitura mais provável é que `types.ts` foi gerado a partir do esquema
consolidado da migration `20260415020135` (um `CREATE TABLE` completo, sem
`IF NOT EXISTS`, que falharia num banco já existente — ou seja, feito para
instalação limpa), e não do banco de produção.

**Por que isso trava trabalho:** uma auditoria cruzando os `.select()` do código
com o `types.ts` acusa **149 colunas inexistentes** em ~40 arquivos. Se o
`types.ts` estiver certo, boa parte do app está quebrada silenciosamente (o
PostgREST devolve 400 e a query inteira morre). Se estiver desatualizado, os
149 são falso positivo e mexer neles **quebraria código que funciona**.

Cheguei a alterar `PaymentHistory.tsx` e `AdminDashboard.tsx` para os nomes do
`types.ts` e **revertí ambos** ao perceber que a premissa não se sustentava. Não
dá para decidir isso lendo o repositório.

**Como destravar** (precisa de acesso de leitura ao banco de produção):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='subscriptions'
ORDER BY column_name;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='doctor_profiles'
ORDER BY column_name;
```

- Se vier `starts_at`/`consultation_price` → o `types.ts` está velho: regerar
  (`supabase gen types typescript`) e os 149 achados caem por terra.
- Se vier `started_at`/`price` → é incidente sério: o app está consultando
  colunas inexistentes em ~40 arquivos, e aí vale corrigir com o script de
  auditoria em mãos.

O script da auditoria ficou versionado em `scripts/schema-audit.mjs`. Roda com
`node scripts/schema-audit.mjs` na raiz e imprime arquivo, linha, tabela e
coluna. Vale reaproveitar assim que a dúvida for resolvida.

**Sintoma relacionado, este independente da dúvida acima:** o
`mercadopago-webhook` grava em `subscriptions.last_charge_at`,
`last_charge_status`, `retry_count` e `metadata`, e faz `upsert` em
`payment_transactions` — e a migration `20260602025247` **derruba a tabela
`payment_transactions` e essas colunas**, sem nada recriá-las depois. O
`BillingPortal.tsx` já tem `setTxs([]); // payment_transactions table was
removed`, ou seja, alguém reconciliou aquele arquivo e o webhook ficou para
trás. Se isso se confirmar no banco, o processamento de cobrança recorrente
está falhando calado. **Não mexi**: é caminho de dinheiro, e a regra é parar
antes de alterar cobrança.

---

## 3. Deploy / push

O branch atual é `deploy-production-target`. Não fiz `git push`: o nome indica
que o push dispara deploy, e a regra é não alterar produção às cegas — sem
poder acompanhar health check e rollback, o push fica com o usuário.

**Está tudo commitado localmente.** Para publicar:

```bash
git log --oneline origin/deploy-production-target..HEAD   # revisar o que vai
git push origin deploy-production-target
```

Depois: acompanhar o health check e ter o rollback à mão.

---

## 4. Migration de terceiros na árvore de trabalho

`supabase/migrations/20260810120000_feature_flags.sql` está modificada (+80
linhas) por outro worker que trabalha neste mesmo repositório. **Não toquei e
não commitei** — não é meu trabalho e não sei o estado dele. Todos os meus
commits listam arquivos explicitamente, nunca `git add -A`, justamente para
não arrastar essa migration junto.
