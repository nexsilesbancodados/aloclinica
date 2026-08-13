-- ============================================================================
-- VERIFICAÇÃO DAS 4 MIGRATIONS PENDENTES
-- ----------------------------------------------------------------------------
-- Rode ANTES de aplicar (para ver o estado atual) e DEPOIS (para confirmar).
-- É somente leitura: nenhum comando aqui altera dados ou esquema.
--
--   psql "$DATABASE_URL" -f scripts/verify_pending_migrations.sql
--
-- Ou cole no SQL Editor do Supabase.
--
-- Migrations cobertas:
--   20260809100000_appointment_payment_integrity
--   20260809100100_doctor_profile_insert_protection
--   20260809100200_bare_doctor_role_phi_scope
--   20260810120000_feature_flags
-- ============================================================================

\echo '=== 1. GATILHOS DE PROTEÇÃO (esperado: 3 linhas) ==='
SELECT c.relname AS tabela, t.tgname AS gatilho,
       CASE WHEN t.tgtype & 4 > 0 THEN 'INSERT ' ELSE '' END ||
       CASE WHEN t.tgtype & 16 > 0 THEN 'UPDATE' ELSE '' END AS eventos
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal
   AND t.tgname IN (
     'zzz_protect_appointment_payment',
     'zzz_protect_doctor_verification',
     'zzz_protect_on_demand_queue'
   )
 ORDER BY c.relname;

\echo ''
\echo '=== 2. doctor_profiles: o gatilho C1 cobre INSERT? (esperado: t) ==='
-- Antes da 20260809100100 ele era BEFORE UPDATE apenas — e era por aí que
-- alguém inseria a própria ficha já aprovada.
SELECT COALESCE(bool_or(t.tgtype & 4 > 0), false) AS cobre_insert
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'doctor_profiles'
   AND t.tgname = 'zzz_protect_doctor_verification';

\echo ''
\echo '=== 3. PHI por papel doctor puro (esperado: is_approved_doctor presente) ==='
SELECT p.proname AS funcao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'is_approved_doctor';

\echo '--- policies que ainda usam o papel PURO (esperado: 0 linhas) ---'
SELECT schemaname, tablename, policyname
  FROM pg_policies
 WHERE (qual LIKE '%has_role(auth.uid(), ''doctor''%'
     OR with_check LIKE '%has_role(auth.uid(), ''doctor''%')
   AND policyname NOT LIKE '%approved%'
 ORDER BY tablename, policyname;

\echo ''
\echo '=== 4. Feature flags (esperado: 3 tabelas + 4 funções) ==='
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('feature_flags', 'feature_flag_rules', 'feature_flag_audit')
 ORDER BY table_name;

SELECT p.proname AS funcao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('get_feature_flags', 'set_feature_flag',
                     'set_feature_flag_rule', 'delete_feature_flag_rule')
 ORDER BY p.proname;

\echo ''
\echo '=== 5. PRÉ-REQUISITOS DAS MIGRATIONS (precisam existir ANTES) ==='
-- Se algum vier vazio, a migration correspondente falha ao aplicar.
SELECT 'is_admin()' AS dependencia,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'is_admin') AS existe
UNION ALL
SELECT 'has_role()',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'has_role')
UNION ALL
SELECT 'payment_transactions',
       to_regclass('public.payment_transactions') IS NOT NULL
UNION ALL
SELECT 'payment_transactions.resource_type',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='payment_transactions'
                  AND column_name='resource_type')
UNION ALL
SELECT 'on_demand_queue.appointment_id',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='on_demand_queue'
                  AND column_name='appointment_id')
UNION ALL
SELECT 'user_roles.role',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='user_roles'
                  AND column_name='role');

\echo ''
\echo '=== 6. ARMADILHA CONHECIDA: activity_logs tem duas formas no repositório ==='
-- admin-secret-manager grava com `details` e `performed_by`. Se estas colunas
-- não existirem, a auditoria de secrets falha em silêncio (console.error).
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'activity_logs'
   AND column_name IN ('details', 'metadata', 'performed_by')
 ORDER BY column_name;

\echo ''
\echo '=== 7. ARMADILHA CONHECIDA: discount_cards.discount_percent ==='
-- O gatilho da fila (20260809100300) lê esta coluna. A versão reconstruída da
-- tabela (20260701051000) NÃO a tem — nesse caso o BEFORE INSERT levanta erro e
-- NENHUM paciente entra na fila do plantão.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='discount_cards'
     AND column_name='discount_percent'
) AS discount_percent_existe;
