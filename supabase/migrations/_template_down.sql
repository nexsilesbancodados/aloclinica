-- ===================================================================
-- TEMPLATE — Down migration (REVERTER mudança X)
-- ===================================================================
--
-- Este NÃO é uma migration executável. Copie para um arquivo com data
-- atual (20YYYYMMDD_revert_<feature>.sql) e adapte.
--
-- IMPORTANTE: DOWNs não são automáticos em produção. Para aplicar,
-- use o workflow GitHub Actions "One-shot — Aplicar migration específica"
-- e tenha um plano de backup ANTES de rodar.
--
-- Estrutura recomendada:
--   1. Comente o motivo do revert (incidente, regressão, feature cancelada)
--   2. Sempre teste em staging primeiro
--   3. Backups: tire snapshot manual antes de drop/rename
--   4. Use IF EXISTS / IF NOT EXISTS pra idempotência
-- ===================================================================

-- ──────────────────────────────────────────────────────────────────
-- CONTEXTO
-- ──────────────────────────────────────────────────────────────────
-- Migration original:  YYYYMMDD_<nome>.sql
-- Motivo do revert:    [descrever — bug, regressão, mudança de escopo]
-- Risco de dados:      [baixo: só DDL] | [médio: drop coluna] | [alto: drop table]
-- Snapshot pré-revert: [link/path do backup]
-- ──────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. POLICIES — sempre drop antes de alterar a tabela
-- ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "policy_name" ON public.table_name;

-- ──────────────────────────────────────────────────────────────────
-- 2. TRIGGERS / FUNCTIONS
-- ──────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trigger_name ON public.table_name;
-- DROP FUNCTION IF EXISTS public.function_name(arg_type);

-- ──────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ──────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_name;

-- ──────────────────────────────────────────────────────────────────
-- 4. CONSTRAINTS
-- ──────────────────────────────────────────────────────────────────
-- ALTER TABLE public.table_name DROP CONSTRAINT IF EXISTS constraint_name;

-- ──────────────────────────────────────────────────────────────────
-- 5. COLUNAS (RISCO MÉDIO — perde dados da coluna)
-- ──────────────────────────────────────────────────────────────────
-- Se houver dados úteis: copie pra coluna temporária OU export antes.
-- ALTER TABLE public.table_name DROP COLUMN IF EXISTS column_name;

-- ──────────────────────────────────────────────────────────────────
-- 6. TABELAS (RISCO ALTO — perde todos os dados)
-- ──────────────────────────────────────────────────────────────────
-- Confirme com 2 stakeholders antes. Sempre renomeie em vez de dropar
-- quando possível:
--   ALTER TABLE public.foo RENAME TO foo_deprecated_YYYYMMDD;
-- Ou para drop real:
-- DROP TABLE IF EXISTS public.table_name CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 7. EXTENSIONS — raramente reverter
-- ──────────────────────────────────────────────────────────────────
-- DROP EXTENSION IF EXISTS extname;

-- ──────────────────────────────────────────────────────────────────
-- 8. ANALYZE pra atualizar stats após mudanças grandes
-- ──────────────────────────────────────────────────────────────────
-- ANALYZE public.table_name;

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO PÓS-REVERT (rode separadamente)
-- ──────────────────────────────────────────────────────────────────
-- SELECT * FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'X';
-- SELECT * FROM pg_policies WHERE tablename = 'X';
-- SELECT count(*) FROM public.affected_table;
