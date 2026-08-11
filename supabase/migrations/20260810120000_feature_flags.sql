-- ============================================================================
-- FEATURE FLAGS (§4 do Super Painel)
-- ----------------------------------------------------------------------------
-- Fundação para controlar recursos sem deploy: ligar/desligar, liberar por
-- papel, por usuário específico, ou gradualmente por percentual.
--
-- Escopos implementados AQUI (avaliados no servidor):
--   global      — status on/off/percentage
--   role        — regra por papel (usa user_roles)
--   user        — regra por usuário específico (maior precedência)
--   percentage  — rollout estável por (usuário, flag)
--
-- Escopos NÃO implementados nesta migration: clínica e plano. Ficam de fora de
-- propósito — a resolução de "usuário → clínica" e "usuário → plano" depende de
-- tabelas cujo estado real ainda não foi confirmado (ver drift C2). Melhor não
-- oferecer um escopo que não é avaliado do que entregar uma regra que o admin
-- configura e o sistema ignora em silêncio.
--
-- Precedência (primeira que casar vence):
--   1. regra de usuário
--   2. regra de papel
--   3. status global (on / off / percentage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key                text PRIMARY KEY
                     CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  label              text NOT NULL,
  description        text,
  status             text NOT NULL DEFAULT 'off'
                     CHECK (status IN ('on', 'off', 'percentage')),
  rollout_percentage integer NOT NULL DEFAULT 0
                     CHECK (rollout_percentage BETWEEN 0 AND 100),
  -- Valor devolvido quando a flag existe mas a avaliação falha. Deixa explícito
  -- se a flag é um "kill switch" (default_value=true: o recurso está ligado e a
  -- flag serve para desligar) ou um gate de recurso novo (default false).
  default_value      boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_flags IS
  'Feature flags da plataforma. Avaliação sempre via public.get_feature_flags().';

CREATE TABLE IF NOT EXISTS public.feature_flag_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key    text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  scope_type  text NOT NULL CHECK (scope_type IN ('user', 'role')),
  scope_value text NOT NULL,
  enabled     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flag_key, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_rules_flag ON public.feature_flag_rules (flag_key);

-- Trilha de auditoria: quem mudou, quando, o quê e por quê (§4 pede responsável,
-- data, motivo e rollback). O `before` permite reverter.
CREATE TABLE IF NOT EXISTS public.feature_flag_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key   text NOT NULL,
  changed_by uuid,
  action     text NOT NULL,
  reason     text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_flag ON public.feature_flag_audit (flag_key, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.feature_flags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_audit ENABLE ROW LEVEL SECURITY;

-- Leitura da definição é liberada a autenticados: os nomes das flags não são
-- segredo e o app precisa saber que existem. A AVALIAÇÃO, porém, é sempre feita
-- server-side pela função abaixo — o cliente nunca decide se uma flag está ativa.
DROP POLICY IF EXISTS ff_read ON public.feature_flags;
CREATE POLICY ff_read ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ff_admin ON public.feature_flags;
CREATE POLICY ff_admin ON public.feature_flags
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Regras só o admin lê: `scope_value` de uma regra de usuário é um user_id, e
-- expor a lista de quem está em qual teste é PII desnecessária.
DROP POLICY IF EXISTS ffr_admin ON public.feature_flag_rules;
CREATE POLICY ffr_admin ON public.feature_flag_rules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ffa_admin_read ON public.feature_flag_audit;
CREATE POLICY ffa_admin_read ON public.feature_flag_audit
  FOR SELECT TO authenticated USING (public.is_admin());
-- Sem policy de INSERT: a auditoria é gravada só pelo gatilho SECURITY DEFINER,
-- então não pode ser forjada nem suprimida pelo próprio ator.

-- ── Auditoria automática ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_feature_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feature_flag_audit (flag_key, changed_by, action, reason, before, after)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END,
    auth.uid(),
    lower(TG_OP),
    -- Motivo opcional passado pelo chamador via SET LOCAL app.flag_change_reason
    NULLIF(current_setting('app.flag_change_reason', true), ''),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_feature_flag ON public.feature_flags;
CREATE TRIGGER trg_audit_feature_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_feature_flag();

-- Auditoria das REGRAS de escopo. Sem isto, "liberei o recurso só para o usuário
-- X" ficaria fora do histórico — e é justamente a mudança mais sensível.
CREATE OR REPLACE FUNCTION public.fn_audit_feature_flag_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feature_flag_audit (flag_key, changed_by, action, reason, before, after)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.flag_key ELSE NEW.flag_key END,
    auth.uid(),
    'rule_' || lower(TG_OP),
    NULLIF(current_setting('app.flag_change_reason', true), ''),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_feature_flag_rule ON public.feature_flag_rules;
CREATE TRIGGER trg_audit_feature_flag_rule
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flag_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_feature_flag_rule();

CREATE OR REPLACE FUNCTION public.fn_touch_feature_flag()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_feature_flag ON public.feature_flags;
CREATE TRIGGER trg_touch_feature_flag
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_feature_flag();

-- ── Avaliação ───────────────────────────────────────────────────────────────
-- Devolve { "flag_key": true/false } para o usuário autenticado.
-- SECURITY DEFINER porque precisa ler feature_flag_rules (admin-only via RLS)
-- sem expor a tabela ao usuário.
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_flag   record;
  v_rule   boolean;
  v_bucket integer;
BEGIN
  FOR v_flag IN SELECT * FROM public.feature_flags LOOP
    v_rule := NULL;

    IF v_uid IS NOT NULL THEN
      -- 1. Regra por usuário (precedência máxima)
      SELECT r.enabled INTO v_rule
        FROM public.feature_flag_rules r
       WHERE r.flag_key = v_flag.key
         AND r.scope_type = 'user'
         AND r.scope_value = v_uid::text
       LIMIT 1;

      -- 2. Regra por papel. Se o usuário tem vários papéis e há regras
      --    conflitantes, HABILITAR vence — evita que um papel secundário
      --    esconda um recurso que o papel principal deveria enxergar.
      IF v_rule IS NULL THEN
        SELECT bool_or(r.enabled) INTO v_rule
          FROM public.feature_flag_rules r
          JOIN public.user_roles ur
            ON ur.role::text = r.scope_value
           AND ur.user_id = v_uid
         WHERE r.flag_key = v_flag.key
           AND r.scope_type = 'role';
      END IF;
    END IF;

    IF v_rule IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(v_flag.key, v_rule);
      CONTINUE;
    END IF;

    -- 3. Estado global
    IF v_flag.status = 'on' THEN
      v_result := v_result || jsonb_build_object(v_flag.key, true);
    ELSIF v_flag.status = 'off' THEN
      v_result := v_result || jsonb_build_object(v_flag.key, false);
    ELSE
      -- percentage: bucket ESTÁVEL por (usuário, flag) — o mesmo usuário cai
      -- sempre no mesmo balde, então aumentar o percentual só ACRESCENTA gente
      -- (ninguém perde o recurso), e cada flag sorteia um grupo diferente.
      IF v_uid IS NULL THEN
        v_result := v_result || jsonb_build_object(v_flag.key, false);
      ELSE
        -- 7 dígitos hex → bit(28): cabe em int e é SEMPRE não-negativo. Com 8
        -- dígitos (bit(32)) o int vira assinado e o módulo poderia dar negativo,
        -- fazendo o bucket nunca bater o percentual.
        v_bucket := (('x' || substr(md5(v_uid::text || ':' || v_flag.key), 1, 7))::bit(28)::integer % 100);
        v_result := v_result || jsonb_build_object(
          v_flag.key, v_bucket < v_flag.rollout_percentage
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_flags() FROM public;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO authenticated, anon;

COMMENT ON FUNCTION public.get_feature_flags() IS
  'Avalia todas as feature flags para o chamador. Precedência: usuário > papel > global.';

-- ── Alteração com MOTIVO ────────────────────────────────────────────────────
-- O gatilho de auditoria lê o motivo de um GUC de transação, que o cliente não
-- consegue definir sozinho (supabase-js não emite SET LOCAL). Este RPC define o
-- GUC e faz o UPDATE na MESMA transação, então o motivo entra no histórico.
-- É o caminho que o painel usa; alterações diretas na tabela continuam
-- auditadas, só que sem motivo.
CREATE OR REPLACE FUNCTION public.set_feature_flag(
  p_key      text,
  p_status   text,
  p_rollout  integer DEFAULT NULL,
  p_reason   text    DEFAULT NULL
)
RETURNS public.feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.feature_flags;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('on', 'off', 'percentage') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.flag_change_reason', COALESCE(p_reason, ''), true);

  UPDATE public.feature_flags
     SET status = p_status,
         rollout_percentage = COALESCE(p_rollout, rollout_percentage)
   WHERE key = p_key
  RETURNING * INTO v_row;

  IF v_row.key IS NULL THEN
    RAISE EXCEPTION 'Flag inexistente: %', p_key USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feature_flag(text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, text, integer, text) TO authenticated;

COMMENT ON FUNCTION public.set_feature_flag(text, text, integer, text) IS
  'Altera uma feature flag registrando o motivo na auditoria. Admin-only.';

CREATE OR REPLACE FUNCTION public.set_feature_flag_rule(
  p_flag_key    text,
  p_scope_type  text,
  p_scope_value text,
  p_enabled     boolean,
  p_reason      text DEFAULT NULL
)
RETURNS public.feature_flag_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.feature_flag_rules;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;
  IF p_scope_type NOT IN ('user', 'role') THEN
    RAISE EXCEPTION 'Escopo inválido' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(p_scope_value), '') IS NULL THEN
    RAISE EXCEPTION 'Valor do escopo obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('app.flag_change_reason', left(coalesce(p_reason, ''), 500), true);

  INSERT INTO public.feature_flag_rules (flag_key, scope_type, scope_value, enabled)
  VALUES (p_flag_key, p_scope_type, trim(p_scope_value), p_enabled)
  ON CONFLICT (flag_key, scope_type, scope_value)
  DO UPDATE SET enabled = EXCLUDED.enabled
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feature_flag_rule(text, text, text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_feature_flag_rule(text, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_feature_flag_rule(
  p_rule_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS public.feature_flag_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.feature_flag_rules;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.flag_change_reason', left(coalesce(p_reason, ''), 500), true);

  DELETE FROM public.feature_flag_rules
   WHERE id = p_rule_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Regra inexistente' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_feature_flag_rule(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_feature_flag_rule(uuid, text) TO authenticated;
