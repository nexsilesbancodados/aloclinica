-- ===================================================================
-- MERCADO PAGO MIGRATION — adiciona colunas mp_* nas tabelas de pagamento
-- ===================================================================
-- Estratégia: mantém colunas pagbank_* por enquanto pra preservar histórico
-- de cobranças passadas. Frontend novo escreve em mp_*. PR3 (cleanup)
-- removerá as colunas pagbank_* depois que histórico for arquivado.
-- ===================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. SAVED CARDS — adiciona mp_card_id (vault Mercado Pago)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.saved_cards
  ADD COLUMN IF NOT EXISTS mp_card_id TEXT,
  -- Mercado Pago atrela cartões a um customer; guardamos o customer_id também
  ADD COLUMN IF NOT EXISTS mp_customer_id TEXT,
  -- Gateway de origem do cartão (pra coexistência durante migração)
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'mercadopago' CHECK (gateway IN ('mercadopago', 'pagbank'));

-- Permite NULL em pagbank_card_id (que era NOT NULL) pra cartões criados via MP
ALTER TABLE public.saved_cards
  ALTER COLUMN pagbank_card_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_cards_mp_card ON public.saved_cards (user_id, mp_card_id) WHERE mp_card_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. SUBSCRIPTIONS — adiciona mp_preapproval_id
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payer_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'mercadopago' CHECK (gateway IN ('mercadopago', 'pagbank'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_preapproval ON public.subscriptions (mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 3. PAYMENT_TRANSACTIONS — adiciona mp_payment_id
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_qr_code TEXT,            -- PIX copy-paste
  ADD COLUMN IF NOT EXISTS mp_qr_code_base64 TEXT,     -- PIX QR image
  ADD COLUMN IF NOT EXISTS mp_boleto_url TEXT,         -- Boleto external resource URL
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'mercadopago' CHECK (gateway IN ('mercadopago', 'pagbank'));

CREATE INDEX IF NOT EXISTS idx_payment_tx_mp_payment ON public.payment_transactions (mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 4. WITHDRAWAL_REQUESTS — adiciona mp_payout_id (substitui asaas_transfer_id)
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
    EXECUTE 'ALTER TABLE public.withdrawal_requests
      ADD COLUMN IF NOT EXISTS mp_payout_id TEXT,
      ADD COLUMN IF NOT EXISTS mp_money_request_id TEXT,
      ADD COLUMN IF NOT EXISTS payout_gateway TEXT NOT NULL DEFAULT ''mercadopago'' CHECK (payout_gateway IN (''mercadopago'', ''asaas''))';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 5. PROFILES — guarda o customer_id MP do paciente pra reaproveitar
--     entre cobranças (mesmo customer pra vault, recurring, etc)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mp_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_mp_customer ON public.profiles (mp_customer_id) WHERE mp_customer_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 6. PLANS — remove stripe_price_id (legado morto), adiciona mp_plan_id
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plans' AND column_name='stripe_price_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.plans DROP COLUMN stripe_price_id';
  END IF;
END $$;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS mp_plan_id TEXT;

-- ──────────────────────────────────────────────────────────────────
-- 7. View helper pra admin enxergar status do migration
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.payment_gateway_status AS
SELECT
  'saved_cards' AS table_name,
  COUNT(*) FILTER (WHERE gateway = 'mercadopago') AS mp_count,
  COUNT(*) FILTER (WHERE gateway = 'pagbank') AS pagbank_count
FROM public.saved_cards
UNION ALL
SELECT
  'subscriptions' AS table_name,
  COUNT(*) FILTER (WHERE gateway = 'mercadopago') AS mp_count,
  COUNT(*) FILTER (WHERE gateway = 'pagbank') AS pagbank_count
FROM public.subscriptions
UNION ALL
SELECT
  'payment_transactions' AS table_name,
  COUNT(*) FILTER (WHERE gateway = 'mercadopago') AS mp_count,
  COUNT(*) FILTER (WHERE gateway = 'pagbank') AS pagbank_count
FROM public.payment_transactions;

GRANT SELECT ON public.payment_gateway_status TO authenticated;
