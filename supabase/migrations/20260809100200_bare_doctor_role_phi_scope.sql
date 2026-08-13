-- ============================================================================
-- P0 (PHI): o papel `doctor` PURO — obtido no auto-cadastro, sem convite e sem
-- aprovação — já dava leitura de dados clínicos de TODOS os pacientes.
-- ----------------------------------------------------------------------------
-- Contexto: `handle_new_user` aceita role='doctor' vindo do metadata do signUp.
-- Isso é INTENCIONAL e correto: existe
-- uma jornada legítima de CANDIDATURA aberta (SignupDoctor → /aguardando-aprovacao),
-- em que o médico se cadastra sem código de convite e um admin aprova depois.
-- Portanto o papel NÃO deve ser removido da whitelist — quebraria esse fluxo.
--
-- O defeito real é de AUTORIZAÇÃO: várias policies gateavam em `has_role(doctor)`,
-- que é satisfeito por um CANDIDATO ainda não aprovado (e por qualquer pessoa que
-- chame signUp com role='doctor' na API, já que a UI é só a fachada). Assim, um
-- cadastro de 30 segundos lia:
--   - on_demand_queue  → fila de urgência COM SINTOMAS de todos os pacientes
--   - bucket 'exames'          → exames de todos os pacientes
--   - bucket 'laudos-assinados'→ laudos assinados de todos os pacientes
--
-- Correção: as concessões passam a exigir médico APROVADO (is_approved), não o
-- papel puro. O fluxo de candidatura continua funcionando — o candidato só deixa
-- de enxergar PHI enquanto não for aprovado, que é o comportamento pretendido.
-- ============================================================================

-- Helper: médico de verdade = tem o papel E a ficha aprovada.
CREATE OR REPLACE FUNCTION public.is_approved_doctor(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.doctor_profiles dp
     WHERE dp.user_id = p_uid
       AND COALESCE(dp.is_approved, false) = true
  );
$$;

COMMENT ON FUNCTION public.is_approved_doctor(uuid) IS
  'True quando o usuário é médico APROVADO. Use no lugar de has_role(uid,''doctor'') '
  'em qualquer policy que libere PHI — o papel puro é obtido no auto-cadastro.';

GRANT EXECUTE ON FUNCTION public.is_approved_doctor(uuid) TO authenticated;

-- ── 1. Fila de urgência (on_demand_queue) ───────────────────────────────────
-- Mantém a triagem ABERTA do plantão 24h (decisão de produto preservada: qualquer
-- médico aprovado pode pegar qualquer paciente da fila), mas:
--   a) exige médico APROVADO;
--   b) restaura o escopo `status = 'waiting'` da policy original (20260225), que
--      o rebuild de 20260415 havia alargado para a fila inteira — inclusive
--      atendimentos em andamento/concluídos de OUTROS médicos, com sintomas.
DROP POLICY IF EXISTS "Doctors view queue" ON public.on_demand_queue;
-- A policy nova tem nome diferente da antiga, então o DROP acima não a cobre.
-- Sem este segundo DROP a migration não é idempotente: reexecutar aborta com
-- 42710 (policy already exists). Isso importa porque o runbook recomenda
-- aplicar arquivo a arquivo, e retry após falha parcial é caminho realista.
DROP POLICY IF EXISTS "Approved doctors view waiting queue" ON public.on_demand_queue;
CREATE POLICY "Approved doctors view waiting queue"
  ON public.on_demand_queue FOR SELECT
  TO authenticated
  USING (
    public.is_approved_doctor()
    AND (
      status = 'waiting'
      OR assigned_doctor_id IN (
        SELECT dp.id FROM public.doctor_profiles dp WHERE dp.user_id = auth.uid()
      )
    )
  );

-- ── 2. Storage: exames e laudos assinados ───────────────────────────────────
-- Estes buckets são do fluxo de TELELAUDO, que hoje não tem consumidor no
-- frontend. Por isso a correção sobe o NÍVEL DE PRIVILÉGIO (médico aprovado)
-- sem inventar convenção de path — escopar por vínculo paciente/laudo exige
-- decidir o layout do path e deve ser feito quando a feature for ligada.
-- TODO(telelaudo): ao ativar, escopar por dono/vínculo como foi feito em
-- 20260724180000 para o bucket 'recordings'.
--
-- DROP + CREATE (em vez de ALTER POLICY) porque há drift documentado entre as
-- migrations e o banco ao vivo — ALTER falharia se o nome não existisse lá.
DROP POLICY IF EXISTS "Authorized view exames" ON storage.objects;
CREATE POLICY "Authorized view exames" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'exames'
    AND (
      public.is_approved_doctor()
      OR public.has_role(auth.uid(), 'laudista')
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Authorized view laudos" ON storage.objects;
CREATE POLICY "Authorized view laudos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'laudos-assinados'
    AND (
      public.is_approved_doctor()
      OR public.has_role(auth.uid(), 'laudista')
      OR public.is_admin()
    )
  );

-- Upload de laudo assinado: mesma régua (era has_role(doctor) puro).
DROP POLICY IF EXISTS "Laudistas upload laudos" ON storage.objects;
CREATE POLICY "Laudistas upload laudos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'laudos-assinados'
    AND (
      public.is_approved_doctor()
      OR public.has_role(auth.uid(), 'laudista')
    )
  );

-- ── 3. Upload de receita ────────────────────────────────────────────────────
-- Também era has_role(doctor) puro: um candidato não aprovado podia subir PDF
-- no bucket de receitas.
DROP POLICY IF EXISTS "Doctors upload prescriptions" ON storage.objects;
CREATE POLICY "Doctors upload prescriptions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND public.is_approved_doctor()
  );
