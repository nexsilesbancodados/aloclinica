-- =====================================================================
-- Remoção de features: desagenda os crons que invocam edge functions
-- deletadas (senão falhariam em runtime).
--   - generate-sweepstake-tickets  (sorteios do Cartão Pingo — removido)
--   - notify-expired-prescriptions (oftalmologia — removido)
-- Não mexe em dados; apenas remove jobs órfãos do pg_cron. Idempotente.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-sweepstake-tickets') THEN
    PERFORM cron.unschedule('generate-sweepstake-tickets');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-expired-prescriptions') THEN
    PERFORM cron.unschedule('notify-expired-prescriptions');
  END IF;
EXCEPTION WHEN undefined_table OR undefined_function THEN
  -- pg_cron ausente no ambiente: nada a fazer.
  NULL;
END $$;
