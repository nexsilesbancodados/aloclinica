-- ===================================================================
-- clinical_immutability — imutabilidade de registros clínicos (CFM)
-- ===================================================================
-- O CFM (Resolução CFM 1.821/2007) exige que o prontuário e demais
-- registros clínicos sejam IMUTÁVEIS: uma vez lançados, não podem ser
-- apagados pelo profissional. Hoje as tabelas clínicas permitem DELETE
-- pelo role `authenticated` (médico logado), o que viola essa exigência.
--
-- Esta migração adiciona uma política RLS RESTRICTIVE de DELETE em cada
-- tabela clínica existente, negando qualquer exclusão feita pelo role
-- `authenticated`. Políticas RESTRICTIVE combinam com AND: mesmo que
-- exista (agora ou no futuro) uma policy PERMISSIVE liberando DELETE,
-- esta trava (USING false) garante o bloqueio — defesa em profundidade.
--
-- IMPORTANTE / ESCOPO:
--  * A trava afeta APENAS o role `authenticated`. O `service_role`
--    BYPASSA RLS por definição, portanto o backend (Edge Functions com
--    service key) continua podendo corrigir/arquivar dados de forma
--    legítima e auditável. Nenhum fluxo legítimo de leitura/escrita do
--    médico é afetado — só a exclusão, que passa a ser proibida.
--  * Imutabilidade de CAMPOS (impedir alteração de conteúdo já lançado)
--    NÃO é resolvida por RLS, pois políticas de UPDATE não comparam
--    OLD vs NEW. Isso exige triggers BEFORE UPDATE dedicadas e fica
--    como trabalho futuro, para não bloquear updates legítimos hoje
--    (ex.: anexar pdf_url, hash de assinatura, status).
--  * A RETENÇÃO DE 20 ANOS exigida pela CFM 1.821/2007 depende de um
--    processo de arquivamento/backup de longo prazo (cold storage,
--    trilha de auditoria, política de guarda) que precisa ser definido
--    separadamente — esta migração cobre apenas a não-exclusão.
--
-- Idempotência: cada policy é recriada com DROP POLICY IF EXISTS antes
-- do CREATE, e só é aplicada a tabelas que existem (checagem via
-- to_regclass), pulando silenciosamente as ausentes.
--
-- Observação: políticas RESTRICTIVE só têm efeito quando o RLS está
-- habilitado na tabela. Todas as tabelas clínicas abaixo já têm RLS
-- habilitado; esta migração não altera esse estado.
-- ===================================================================

DO $$
DECLARE
  t text;
  clinical_tables text[] := ARRAY[
    'medical_records',
    'consultation_notes',
    'prescriptions',
    'clinical_anamnesis',
    'exam_reports',
    'aloc_exames',
    'aloc_laudos',
    'ophthalmology_exams',
    'ophthalmology_prescriptions',
    'consultation_recordings',
    'vaccination_records',
    'medical_certificates'
  ];
BEGIN
  FOREACH t IN ARRAY clinical_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_delete', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)',
        t || '_no_delete', t
      );
      RAISE NOTICE 'clinical_immutability: no-delete policy aplicada em public.%', t;
    ELSE
      RAISE NOTICE 'clinical_immutability: tabela public.% inexistente — pulando', t;
    END IF;
  END LOOP;
END $$;
