-- ============================================================================
-- CONSTRUTOR DE NAVEGAÇÃO (§5 do Super Painel)
-- ----------------------------------------------------------------------------
-- Permite ao admin ocultar, renomear, reagrupar e reordenar itens de menu sem
-- deploy.
--
-- DECISÃO DE ARQUITETURA: isto é uma tabela de OVERRIDES, não a fonte do menu.
--
-- Os menus continuam definidos em código (`adminNav.tsx`, `doctorNav.tsx`, …) e
-- esta tabela apenas os ajusta. Motivos:
--
--   1. Um menu 100% em banco significa que uma tabela vazia = plataforma sem
--      navegação. Com overrides, banco vazio ou indisponível = menu exatamente
--      como hoje. Falha fechada no sentido certo.
--   2. Cada item de menu aponta para uma ROTA que existe em código. Deixar o
--      admin criar itens livremente produziria links para telas inexistentes.
--   3. Não exige tocar nos arquivos de menu — que estão em edição ativa.
--
-- A chave é o `href` normalizado (sem querystring), que já é único e estável.
-- Assim nenhum arquivo de menu precisa ganhar um campo `key`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nav_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qual menu: admin, patient, doctor, clinic, support, receptionist, partner.
  menu           text NOT NULL CHECK (menu ~ '^[a-z_]{3,32}$'),
  -- Caminho da rota SEM querystring. Ex.: /dashboard/admin/users
  item_href      text NOT NULL CHECK (item_href ~ '^/[A-Za-z0-9/_:-]{0,200}$'),
  hidden         boolean NOT NULL DEFAULT false,
  label_override text CHECK (label_override IS NULL OR length(btrim(label_override)) BETWEEN 1 AND 60),
  group_override text CHECK (group_override IS NULL OR length(btrim(group_override)) BETWEEN 1 AND 40),
  -- NULL = mantém a posição original do código.
  sort_order     integer,
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu, item_href)
);

CREATE INDEX IF NOT EXISTS idx_nav_overrides_menu ON public.nav_overrides (menu);

COMMENT ON TABLE public.nav_overrides IS
  'Ajustes de menu aplicados sobre a navegação definida em código. Tabela vazia = menu padrão.';

ALTER TABLE public.nav_overrides ENABLE ROW LEVEL SECURITY;

-- Leitura liberada a autenticados: o menu do próprio usuário precisa ser
-- resolvido no cliente. Não há PII aqui — só rótulos e rotas.
DROP POLICY IF EXISTS nav_overrides_read ON public.nav_overrides;
CREATE POLICY nav_overrides_read ON public.nav_overrides
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS nav_overrides_admin ON public.nav_overrides;
CREATE POLICY nav_overrides_admin ON public.nav_overrides
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.fn_touch_nav_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_nav_override ON public.nav_overrides;
CREATE TRIGGER trg_touch_nav_override
  BEFORE INSERT OR UPDATE ON public.nav_overrides
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_nav_override();

-- ── Gravação em lote ────────────────────────────────────────────────────────
-- O editor salva o menu inteiro de uma vez. Fazer isso como N chamadas do
-- cliente deixaria o menu num estado intermediário se uma falhasse; aqui é uma
-- transação só. Itens SEM ajuste são removidos da tabela, para que o menu volte
-- ao padrão do código em vez de acumular linhas neutras.
CREATE OR REPLACE FUNCTION public.save_nav_overrides(p_menu text, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  jsonb;
  v_count integer := 0;
  v_hrefs text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items deve ser um array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Só grava quando há de fato algum ajuste. Um item "padrão" não vira linha.
    IF COALESCE((v_item->>'hidden')::boolean, false) = false
       AND NULLIF(btrim(COALESCE(v_item->>'label_override', '')), '') IS NULL
       AND NULLIF(btrim(COALESCE(v_item->>'group_override', '')), '') IS NULL
       AND (v_item->>'sort_order') IS NULL
    THEN
      CONTINUE;
    END IF;

    INSERT INTO public.nav_overrides (menu, item_href, hidden, label_override, group_override, sort_order)
    VALUES (
      p_menu,
      v_item->>'item_href',
      COALESCE((v_item->>'hidden')::boolean, false),
      NULLIF(btrim(COALESCE(v_item->>'label_override', '')), ''),
      NULLIF(btrim(COALESCE(v_item->>'group_override', '')), ''),
      (v_item->>'sort_order')::integer
    )
    ON CONFLICT (menu, item_href) DO UPDATE SET
      hidden         = EXCLUDED.hidden,
      label_override = EXCLUDED.label_override,
      group_override = EXCLUDED.group_override,
      sort_order     = EXCLUDED.sort_order;

    v_hrefs := v_hrefs || (v_item->>'item_href');
    v_count := v_count + 1;
  END LOOP;

  -- Remove ajustes que o admin zerou nesta gravação.
  DELETE FROM public.nav_overrides
   WHERE menu = p_menu
     AND NOT (item_href = ANY (v_hrefs));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_nav_overrides(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_nav_overrides(text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_nav_overrides(text, jsonb) IS
  'Salva os ajustes de um menu inteiro numa transação. Admin-only.';
