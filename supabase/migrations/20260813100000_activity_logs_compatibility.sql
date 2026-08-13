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

-- Fallback for Edge Function instances that have not refreshed an environment
-- secret yet. The candidate is compared inside the database and the decrypted
-- value is never returned to the caller.
CREATE OR REPLACE FUNCTION public.verify_internal_function_secret(candidate_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  configured_secret text;
BEGIN
  IF candidate_secret IS NULL OR length(candidate_secret) = 0 THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret
    INTO configured_secret
    FROM vault.decrypted_secrets
   WHERE name = 'internal_function_secret'
   LIMIT 1;

  RETURN configured_secret IS NOT NULL AND candidate_secret = configured_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_internal_function_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_function_secret(text) TO service_role;
