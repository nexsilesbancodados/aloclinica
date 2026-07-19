-- =====================================================================
-- ⚠️⚠️  DESTRUTIVO E IRREVERSÍVEL  ⚠️⚠️
-- =====================================================================
-- Remove as TABELAS das features descontinuadas: Oftalmologia, Laudos e
-- Cartão de Benefícios (Pingo Card + funeral + sorteios + convites B2B).
--
-- ANTES DE APLICAR EM PRODUÇÃO:
--   1. FAÇA BACKUP (PITR/pg_dump). Depois do DROP não há como recuperar.
--   2. ⚖️ RETENÇÃO CFM: `aloc_laudos`, `aloc_exames` e `ophthalmology_*`
--      contêm DADOS CLÍNICOS. A CFM (Res. 1.821/2007) exige guarda mínima
--      (~20 anos). CONFIRME com jurídico/DPO se pode apagar — ou EXPORTE/
--      arquive antes. Se NÃO puder apagar agora, COMENTE a Seção C abaixo.
--   3. Teste primeiro em STAGING.
--
-- `CASCADE` remove automaticamente FKs, policies, triggers e views que
-- dependem destas tabelas (tabelas PRESERVADAS não perdem dados — apenas
-- eventuais constraints que apontavam para as tabelas removidas).
--
-- NÃO inclui (preservado de propósito): health_cards, b2b_leads,
-- dependents, family_members, discount_cards, subscriptions, plans,
-- appointments, exam_*.
-- =====================================================================

-- ── Seção A — Cartão de Benefícios (Pingo Card) ──────────────────────
DROP TABLE IF EXISTS public.pingo_card_benefit_usage   CASCADE;
DROP TABLE IF EXISTS public.pingo_card_invoices        CASCADE;
DROP TABLE IF EXISTS public.pingo_card_transactions    CASCADE;
DROP TABLE IF EXISTS public.pingo_card_subscriptions   CASCADE;
DROP TABLE IF EXISTS public.pingo_card_partners        CASCADE;
DROP TABLE IF EXISTS public.pingo_card_plans           CASCADE;
DROP TABLE IF EXISTS public.pingo_ticket_transactions  CASCADE;
DROP TABLE IF EXISTS public.pingo_ticket_accounts      CASCADE;
-- Benefícios do cartão: assistência funeral + sorteios + convites B2B
DROP TABLE IF EXISTS public.funeral_assistance_requests CASCADE;
DROP TABLE IF EXISTS public.funeral_providers          CASCADE;
DROP TABLE IF EXISTS public.sweepstake_tickets         CASCADE;
DROP TABLE IF EXISTS public.sweepstake_winners         CASCADE;
DROP TABLE IF EXISTS public.sweepstakes                CASCADE;
DROP TABLE IF EXISTS public.employee_invites           CASCADE;

-- ── Seção B — Oftalmologia (contém dados clínicos) ───────────────────
DROP TABLE IF EXISTS public.ophthalmology_prescription_documents CASCADE;
DROP TABLE IF EXISTS public.ophthalmology_prescriptions CASCADE;
DROP TABLE IF EXISTS public.ophthalmology_exams        CASCADE;

-- ── Seção C — Laudos (⚖️ DADOS CLÍNICOS — CFM) ───────────────────────
-- Se a retenção CFM impedir a exclusão agora, COMENTE as 2 linhas abaixo.
DROP TABLE IF EXISTS public.aloc_laudos                CASCADE;
DROP TABLE IF EXISTS public.aloc_exames                CASCADE;

-- =====================================================================
-- OBSERVAÇÕES (não executadas automaticamente):
--  • Funções/RPCs específicas destas features (ex.: fn_get_cartao_summary,
--    funções de funeral/sorteio) ficam órfãs mas NÃO são chamadas pela UI
--    removida. Podem ser dropadas manualmente depois se desejar.
--  • Os VALORES do enum `app_role` (cartao_beneficios, ophthalmologist,
--    laudista, optician) permanecem — Postgres não remove valor de enum
--    facilmente; são inofensivos (dormentes). Regenere types.ts após aplicar.
--  • Crons órfãos já são desagendados em 20260718140000.
-- =====================================================================
