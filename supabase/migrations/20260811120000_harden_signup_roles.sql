-- Security hardening: public signup metadata must never grant privileged roles.
-- The signup trigger runs as SECURITY DEFINER, so this validation cannot rely on
-- RLS or on the client-side role selector.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text;
  v_app_role app_role;
  v_cpf text;
BEGIN
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '');

  IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE cpf = v_cpf) THEN
    RAISE EXCEPTION 'CPF_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (
    user_id, first_name, last_name, cpf, phone, date_of_birth
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    v_cpf,
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), ''),
    NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::date
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'patient');

  -- Roles available from the public signup journeys. Admin, receptionist,
  -- clinical specialist and operational roles require an explicit grant.
  IF v_role NOT IN ('patient', 'doctor', 'clinic', 'support') THEN
    v_role := 'patient';
  END IF;

  v_app_role := v_role::app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Defense in depth for every future path that writes user_roles, including
-- SECURITY DEFINER functions. Existing admins and the service role may grant
-- admin explicitly; an unprivileged caller may not self-grant it.
CREATE OR REPLACE FUNCTION public.block_self_admin_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.role = 'admin'
     AND NOT public.is_admin()
     AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'admin role cannot be self-granted';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_roles_block_self_admin ON public.user_roles;
CREATE TRIGGER user_roles_block_self_admin
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.block_self_admin_grant();

