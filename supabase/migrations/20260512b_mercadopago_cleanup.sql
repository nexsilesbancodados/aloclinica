-- ===================================================================
-- MERCADO PAGO CLEANUP — remove cron + função PagBank
-- ===================================================================
-- Mercado Pago Pre-Approval cobra assinaturas recorrentes automaticamente,
-- então não precisamos mais do cron diário que chamava pagbank-charge-saved-card.
-- ===================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove cron job legacy
    PERFORM cron.unschedule('process_recurring_subscriptions')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_recurring_subscriptions');
  END IF;
END $$;

-- Remove função (não é mais usada — MP cuida da cobrança recorrente)
DROP FUNCTION IF EXISTS public.process_recurring_subscriptions();
