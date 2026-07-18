-- =====================================================================
-- SECURITY HARDENING — Auditoria de produção (2026-07-18)
-- Corrige achados CRÍTICOS/ALTOS de segurança encontrados na auditoria.
-- Idempotente. Aplicar via `supabase db push` ou Management API.
--
-- Cobre:
--   1. Escalada de privilégio via role no metadata do signup (CRÍTICO)
--   2. IDOR financeiro em fn_get_cartao_summary (CRÍTICO)
--   3. Oráculo de enumeração de CPF exposto a anon (LGPD)
--   4. Funções SECURITY DEFINER sem search_path fixo (CVE-class) — fix em lote
--   5. Backdoor legado de admin por e-mail hardcoded (defensivo)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CRÍTICO: handle_new_user não pode confiar no `role` do cliente.
--    Roles privilegiados (admin/support) NUNCA são auto-atribuíveis no
--    signup. doctor/clinic continuam permitidos (gate de is_approved a
--    jusante). Qualquer outro valor cai em 'patient'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_app_role app_role;
  v_cpf text;
BEGIN
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'cpf',''), '\D', '', 'g'), '');

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
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone',''), '\D', '', 'g'), ''),
    NULLIF(NEW.raw_user_meta_data->>'date_of_birth','')::date
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_role := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'patient'));

  -- SECURITY: roles privilegiados jamais podem ser concedidos por auto-cadastro.
  -- Devem passar por assign-role (com invite/admin) ou concessão manual.
  IF v_role IN ('admin', 'support') THEN
    v_role := 'patient';
  END IF;

  BEGIN
    v_app_role := v_role::app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_app_role := 'patient'::app_role;
  END;

  -- Defesa extra: mesmo que o enum evolua, bloqueia privilegiados no INSERT.
  IF v_app_role IN ('admin'::app_role, 'support'::app_role) THEN
    v_app_role := 'patient'::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. CRÍTICO: fn_get_cartao_summary aceitava p_user_id arbitrário
--    (IDOR de dados financeiros). Passa a exigir que o id seja o do
--    próprio chamador OU um admin. Também revoga acesso de anon.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_cartao_summary(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_plan RECORD;
  v_ticket_balance numeric := 0;
  v_dep_count integer := 0;
  v_savings_month numeric := 0;
  v_next_invoice RECORD;
BEGIN
  -- SECURITY: impede leitura de dados de cartão de outro usuário.
  IF p_user_id IS NOT NULL
     AND p_user_id <> auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: cannot read another user''s card summary'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('has_subscription', false);
  END IF;

  SELECT * INTO v_sub FROM public.pingo_card_subscriptions
   WHERE user_id = p_user_id AND status IN ('active','trial','past_due')
   ORDER BY started_at DESC LIMIT 1;

  IF NOT FOUND THEN
    SELECT COALESCE(balance,0) INTO v_ticket_balance FROM public.pingo_ticket_accounts WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'has_subscription', false,
      'pingo_ticket_balance', COALESCE(v_ticket_balance,0)
    );
  END IF;

  SELECT * INTO v_plan FROM public.pingo_card_plans WHERE id = v_sub.plan_id;
  SELECT COALESCE(balance,0) INTO v_ticket_balance FROM public.pingo_ticket_accounts WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_dep_count FROM public.dependents WHERE guardian_id = p_user_id;

  SELECT COALESCE(SUM(discount_amount),0) INTO v_savings_month
    FROM public.pingo_card_benefit_usage
    WHERE user_id = p_user_id
      AND used_at >= date_trunc('month', now());

  SELECT * INTO v_next_invoice FROM public.pingo_card_invoices
    WHERE user_id = p_user_id AND status IN ('pending','failed')
    ORDER BY due_date ASC LIMIT 1;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'subscription', jsonb_build_object(
      'id', v_sub.id,
      'status', v_sub.status,
      'billing_cycle', v_sub.billing_cycle,
      'started_at', v_sub.started_at,
      'current_period_end', v_sub.current_period_end,
      'next_charge_at', v_sub.next_charge_at,
      'trial_ends_at', v_sub.trial_ends_at,
      'card_number', v_sub.card_number
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'name', v_plan.name,
      'slug', v_plan.slug,
      'tagline', v_plan.tagline,
      'price_monthly', v_plan.price_monthly,
      'price_yearly', v_plan.price_yearly,
      'consultation_discount_percent', v_plan.consultation_discount_percent,
      'exam_discount_percent', v_plan.exam_discount_percent,
      'partner_discount_percent', v_plan.partner_discount_percent,
      'max_dependents', v_plan.max_dependents,
      'pingo_ticket_monthly_credit', v_plan.pingo_ticket_monthly_credit,
      'benefits', v_plan.benefits,
      'color', v_plan.color
    ),
    'pingo_ticket_balance', v_ticket_balance,
    'dependents_count', v_dep_count,
    'savings_this_month', v_savings_month,
    'next_invoice', CASE WHEN v_next_invoice IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_next_invoice.id, 'amount', v_next_invoice.amount,
                         'due_date', v_next_invoice.due_date, 'status', v_next_invoice.status)
    END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_get_cartao_summary(uuid) FROM anon;

-- ---------------------------------------------------------------------
-- 3. LGPD: cpf_in_use é um oráculo de enumeração. Remove acesso anônimo.
--    A detecção de CPF duplicado no cadastro continua garantida pelo
--    RAISE 'CPF_ALREADY_REGISTERED' em handle_new_user.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.cpf_in_use(text) FROM anon;

-- ---------------------------------------------------------------------
-- 4. CVE-class: toda função SECURITY DEFINER em `public` precisa de
--    search_path fixo (senão é vetor de escalada de privilégio).
--    Fix em lote — pega as que passaram despercebidas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND NOT EXISTS (
         SELECT 1
           FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS c
          WHERE c LIKE 'search_path=%'
       )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
    RAISE NOTICE 'search_path fixado em %', r.sig;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5. Defensivo: garante que o backdoor legado de admin por e-mail
--    hardcoded esteja desativado (caso migrações antigas sejam reaplicadas).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
DROP TRIGGER IF EXISTS assign_admin_on_signup_trigger ON auth.users;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'assign_admin_on_signup'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.assign_admin_on_signup()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS 'BEGIN RETURN NEW; END;'
    $fn$;
  END IF;
END $$;

-- =====================================================================
-- AÇÃO MANUAL OBRIGATÓRIA APÓS APLICAR (não pode ser feita em migração):
--   Auditar e revogar roles privilegiados criados por auto-cadastro:
--
--   SELECT ur.user_id, ur.role, u.email, u.created_at
--     FROM public.user_roles ur
--     JOIN auth.users u ON u.id = ur.user_id
--    WHERE ur.role IN ('admin','support')
--    ORDER BY u.created_at DESC;
--
--   -- Revogar os que NÃO forem legítimos:
--   -- DELETE FROM public.user_roles WHERE user_id = '<uid>' AND role = 'admin';
-- =====================================================================
