-- Persist the trigger secret in Supabase Vault.
-- ALTER DATABASE/ROLE is not permitted by the managed SQL API, so
-- invoke_edge_function reads the secret from Vault at call time.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  request_id bigint;
  base_url text := 'https://pwxvvimdtmvziynbspgx.supabase.co/functions/v1/';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eHZ2aW1kdG12eml5bmJzcGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjMwNDAsImV4cCI6MjA5MTY5OTA0MH0.GYOrbxDlr_GxII92m6Fk7BiVoT5D2uuAk4Uhn0PZzNM';
  internal_secret text := COALESCE(
    current_setting('app.settings.internal_function_secret', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1)
  );
BEGIN
  SELECT net.http_post(
    url := base_url || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-internal-secret', COALESCE(internal_secret, ''),
      'x-aloclinica-internal-secret', COALESCE(internal_secret, '')
    ),
    body := payload,
    timeout_milliseconds := 30000
  ) INTO request_id;
  RETURN request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_edge_function(%) failed: %', fn_name, SQLERRM;
  RETURN NULL;
END $$;
