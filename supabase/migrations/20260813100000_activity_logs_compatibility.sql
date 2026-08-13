-- Keep the audit table compatible with Edge Functions created against the
-- original activity_logs contract. Both additions are nullable/defaulted and
-- therefore preserve all existing audit records.
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS performed_by uuid,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;

UPDATE public.activity_logs
SET details = COALESCE(details, metadata, '{}'::jsonb)
WHERE details IS NULL;

ALTER TABLE public.activity_logs
  ALTER COLUMN details SET DEFAULT '{}'::jsonb;
