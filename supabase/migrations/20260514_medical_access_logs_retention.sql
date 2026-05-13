-- ===================================================================
-- LGPD/CFM — Retenção e patient self-read em medical_record_access_logs
-- ===================================================================
-- Gaps atacados:
--   1. Tabela registra TUDO indefinidamente → vai inflar e violar LGPD Art. 16
--      (princípio da retenção mínima necessária).
--   2. Paciente não consegue ver quem acessou seu próprio prontuário —
--      exigido por LGPD Art. 18 (direito de acesso) + CFM 1.997/2012.
-- ===================================================================

-- 1. Política: paciente vê acessos ao SEU prontuário
-- Já existia: admin vê tudo + médico vê seus próprios acessos.
-- Falta: o próprio paciente conseguir auditar quem leu o EMR dele.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medical_record_access_logs'
      AND policyname = 'Patients can view access to their own records'
  ) THEN
    CREATE POLICY "Patients can view access to their own records"
      ON public.medical_record_access_logs FOR SELECT
      USING (patient_id = auth.uid());
  END IF;
END $$;

-- 2. Função de retenção: deleta logs com mais de N dias
-- Chamada pelo pg_cron (admin via service_role, bypassa RLS).
-- Default 180 dias — alinhado a recomendação ANPD para logs de auditoria
-- de operações de tratamento de dados sensíveis (saúde).
CREATE OR REPLACE FUNCTION public.prune_medical_access_logs(retention_days INT DEFAULT 180)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.medical_record_access_logs
   WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Trilha de auditoria do próprio pruning (meta-log)
  INSERT INTO public.activity_logs (action, entity_type, details)
  VALUES (
    'medical_access_logs_pruned',
    'system',
    jsonb_build_object('deleted_rows', deleted_count, 'retention_days', retention_days)
  );

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_medical_access_logs(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_medical_access_logs(INT) TO service_role;

-- 3. Schedule diário via pg_cron (se a extensão estiver instalada)
-- Roda todo dia às 03:30 UTC (00:30 BRT) — horário de baixa carga.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove schedule anterior se houver (idempotência)
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'prune-medical-access-logs';

    PERFORM cron.schedule(
      'prune-medical-access-logs',
      '30 3 * * *',
      $cron$ SELECT public.prune_medical_access_logs(180); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron pode não estar disponível em alguns ambientes; falhar é não-bloqueante
  RAISE NOTICE 'pg_cron schedule pulado: %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.prune_medical_access_logs(INT)
  IS 'LGPD/ANPD retention — deleta logs antigos de acesso a prontuário. Default 180 dias. Roda diariamente via pg_cron.';
COMMENT ON COLUMN public.medical_record_access_logs.created_at
  IS 'Timestamp do acesso. Logs com created_at < now() - 180 dias são purgados via prune_medical_access_logs().';
