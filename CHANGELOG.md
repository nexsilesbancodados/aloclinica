# Changelog

Histórico curado das mudanças relevantes da AloClínica.

Convenção: cada migration breaking listada com referência ao arquivo SQL + rollback
strategy. Mudanças puramente de UI/feature são agrupadas por sprint (V*).

## [unreleased]

## 2026-05 — Sprints V6 a V12

### V12 — Quality & escala (esta sprint)

- **Playwright smoke tests** para fluxo paciente público (`tests/smoke-booking.spec.ts`):
  home/teleconsulta/pingo-card/especialidades/faq + páginas legais + sitemap/meta tags
- **CHANGELOG.md** criado (este arquivo)
- Template de DOWN migrations em `supabase/migrations/_template_down.sql`

### V11 — Hygiene (P1)

- `AdminPaymentTest` gated por `IS_DEV` ou `?test=1` (evita cobranças acidentais)
- LGPD/ANPD retention em `medical_record_access_logs` — pg_cron diário deleta
  logs > 180d. Paciente agora pode auditar acessos ao próprio prontuário
  ([20260514_medical_access_logs_retention.sql](supabase/migrations/20260514_medical_access_logs_retention.sql))
- Seed de 6 templates clínicos comuns em `report_templates`
  ([20260514b_report_templates_seed.sql](supabase/migrations/20260514b_report_templates_seed.sql))
- Página `LaudistaTemplates` com CRUD de templates
- Decisão: Sweepstakes/Funeral permanecem flagged-off (código preservado)

### V10 — P0 blockers

- **Feature flag `icp_brasil_signature` default → `true`** com fallback
  automático: hook `useIcpAvailable` checa `vidaas-sign` action `status` que
  reporta se `VIDAAS_CLIENT_ID/SECRET` estão setados. Se não, UI mostra
  "assinatura simplificada ativa" com instrução pro admin
- `PrescriptionSignatureNotice` substitui aviso estático por status dinâmico
- Workflow `verify-idempotency.yml` confirma `uniq_payment_tx_mp_payment_id`
  em produção
- `.env.production.example` + `docs/PRE_DEPLOY_CHECKLIST.md`
- `lib/edgeFunctions.ts` com wrappers tipados (refund/cancel/vidaas) —
  removido 10+ `as any` em paths de pagamento

### V9 — Observability

- `captureBreadcrumb`, `identifyUser`, `setTag` em `lib/sentry.ts`
- `useSentryUser` hook no Dashboard shell propaga user.id em todos eventos
- VideoRoom emite breadcrumbs por status WebRTC + `webrtc.failed` event

### V8 — i18n EN-US

- 40 chaves novas em pt-BR/en/es: patientNav.*, appt.*, book.*, dashboardPatient.*
- `getPatientNav` aceita `t` opcional (sem breaking change)
- PatientDashboard primeiro consumer i18n-aware

### V7 — Push & broadcast

- `notify()` / `notifyMany()` unificam in-app + push (best-effort)
- `AdminBroadcast` — admin envia push+in-app por audiência (todos/role/subscribers)

### V6 — Admin UX

- `useSavedFilters` (escopo+nome no localStorage)
- AdminUsers: checkbox por linha, BulkActionBar com Export/Add-role/Remove-role,
  popover de filtros nomeados

## 2026-05-13 — Mercado Pago + escala

- **Migração Stripe/Asaas/PagBank → Mercado Pago**
  ([20260512_mercadopago_migration.sql](supabase/migrations/20260512_mercadopago_migration.sql))
  - **Breaking**: novos campos em `payment_transactions`, `subscriptions`,
    `saved_cards`. Rollback complexo — requer migrar dados de volta. Tag git
    `pre-mp-migration` salva o snapshot anterior.
- **Idempotency**: `UNIQUE INDEX uniq_payment_tx_mp_payment_id`
  ([20260513_scale_indexes_idempotency.sql](supabase/migrations/20260513_scale_indexes_idempotency.sql))
  - Webhook MP agora usa `UPSERT` com `onConflict: "mp_payment_id"`
- **Tabela `medical_certificates`**
  ([20260513b_medical_certificates_table.sql](supabase/migrations/20260513b_medical_certificates_table.sql))
- **Coluna `doctor_type` em `doctor_profiles`**
  ([20260512d_doctor_type_column.sql](supabase/migrations/20260512d_doctor_type_column.sql))

## 2026-04-26 — Telemedicina como produto principal

- Código legado (oftalmologia, laudística, clínica) preservado atrás de feature
  flags + rotas de admin view-as. Site público focado em consultas avulsas +
  Pingo Card.

---

## Estratégia de DOWN migrations

Não fazemos DOWN automático em produção (risco de perda de dados). Para reverter
schema breaking:

1. Inspecione `supabase/migrations/_template_down.sql` para o padrão
2. Crie um novo arquivo `20YYYYMMDD_revert_<feature>.sql`
3. Aplique via `apply-migration.yml` workflow (não via Supabase CLI direto)

Migrations não-breaking (adicionar coluna nullable, adicionar índice, adicionar
RLS policy) raramente precisam de DOWN.
