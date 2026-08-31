-- Hardening RLS SEGURO (sem quebrar parceiro/validador público): só
-- (1) fecha document_verifications ao acesso direto anon (validação usa RPC)
-- (2) remove o backdoor assign_admin_on_signup (admin por e-mail hardcoded)

-- (1) garante a RPC pública e bloqueia leitura direta
CREATE OR REPLACE FUNCTION public.verify_document_public(p_code text)
RETURNS TABLE (verification_code text, document_type text, patient_name text,
  doctor_name text, doctor_crm text, issued_at timestamptz, details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dv.verification_code, dv.document_type, dv.patient_name, dv.doctor_name,
         dv.doctor_crm, dv.issued_at, COALESCE(dv.details,'{}'::jsonb)
  FROM public.document_verifications dv WHERE dv.verification_code = p_code LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_document_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_document_public(text) TO anon, authenticated;

DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.document_verifications') IS NOT NULL THEN
    FOR pol IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='document_verifications' AND cmd='SELECT'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.document_verifications', pol.policyname); END LOOP;
    EXECUTE $p$ CREATE POLICY "doc_verif_admin_read" ON public.document_verifications
      FOR SELECT TO authenticated USING (public.is_admin() OR public.has_role(auth.uid(),'support')) $p$;
    REVOKE ALL ON public.document_verifications FROM anon, PUBLIC;
  END IF;
END $$;

-- (2) remove o backdoor de admin por e-mail
DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
CREATE OR REPLACE FUNCTION public.assign_admin_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN NEW; END; $$;

SELECT 'hardening_rls_safe_ok' AS resultado;
