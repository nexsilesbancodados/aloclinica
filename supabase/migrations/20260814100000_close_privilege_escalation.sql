-- ============================================================================
-- Fecha duas escaladas de privilégio e o auto-crédito de carteira.
-- ----------------------------------------------------------------------------
-- Verificado nesta auditoria (2026-08-13):
--   1. Rota pública /suporte/cadastro fazia signUp com role="support"; o trigger
--      de signup aceitava 'support' na whitelist. Qualquer visitante virava
--      suporte, com acesso a profiles/tickets/verificações de todos.
--   2. wallet_transactions tinha policy de INSERT
--      `WITH CHECK (user_id = auth.uid())` — o nome era "System can insert" mas
--      permitia QUALQUER usuário creditar a si mesmo, com saque via PIX real.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Papéis auto-registráveis no signup ───────────────────────────────────
-- Remove APENAS 'support' da whitelist. O restante da função (dedup de CPF,
-- normalização de telefone/data, insert de profile) é preservado exatamente
-- como em 20260811120000 — só a lista de papéis muda. (A rota de UI já foi
-- removida; isto é o backstop para chamadas diretas à API.)
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

  -- 'support' REMOVIDO: papel operacional só por concessão de admin (assign-role).
  IF v_role NOT IN ('patient', 'doctor', 'clinic') THEN
    v_role := 'patient';
  END IF;

  v_app_role := v_role::app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 2. Carteira: crédito só por service_role ────────────────────────────────
-- A carteira paga saque real. Nenhum crédito pode vir do cliente. Removemos a
-- policy permissiva; sem policy de INSERT para `authenticated`, apenas
-- service_role (que ignora RLS) e os triggers SECURITY DEFINER de repasse podem
-- inserir. Espelha o padrão já aplicado a pingo_card_transactions.
DROP POLICY IF EXISTS "System can insert transactions" ON public.wallet_transactions;

-- Leitura continua restrita ao dono (recriada aqui por segurança, idempotente).
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.wallet_transactions IS
  'Ledger de carteira. INSERT apenas por service_role / triggers SECURITY DEFINER. Nunca aceitar crédito do cliente.';
