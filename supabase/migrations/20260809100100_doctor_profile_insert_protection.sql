-- ============================================================================
-- P0 (ESCALADA DE PRIVILÉGIO): auto-aprovação como médico via INSERT.
-- ----------------------------------------------------------------------------
-- O C1 (20260803110000) fechou a auto-aprovação por UPDATE, mas o gatilho é
-- BEFORE UPDATE — não dispara em INSERT. E a policy de INSERT é apenas
--
--   WITH CHECK (auth.uid() = user_id)
--
-- sem qualquer restrição de coluna. Ou seja, bastava INSERIR a própria linha já
-- aprovada para pular toda a verificação:
--
--   insert into doctor_profiles (user_id, is_approved, crm_verified, kyc_status)
--   values (auth.uid(), true, true, 'approved')
--
-- Resultado: médico listado no diretório público, agendável, recebendo
-- pagamento e com acesso a dados de paciente, sem CRM nem KYC de verdade.
-- O próprio front fazia isso em AuthMedico (insert com is_approved: true).
--
-- Correção: estende a MESMA função do C1 para INSERT. Para usuário comum, uma
-- ficha de médico SEMPRE nasce não-verificada; servidor (service_role → uid
-- NULL) e admin continuam podendo criar já aprovada (seed, aprovação manual,
-- KYC server-side). O cadastro legítimo (SignupDoctor) já insere is_approved
-- false — este gatilho apenas passa a garantir isso no banco.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_doctor_verification_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Servidor (service_role, sem usuário) e admin podem definir verificação.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ficha criada pelo próprio médico: nasce SEMPRE não verificada.
    NEW.crm_verified         := false;
    NEW.crm_verified_at      := NULL;
    NEW.kyc_status           := 'pending';
    NEW.kyc_verified_at      := NULL;
    NEW.kyc_face_match_score := NULL;
    NEW.is_approved          := false;
    RETURN NEW;
  END IF;

  -- UPDATE (comportamento original do C1): mantém a verificação anterior.
  NEW.crm_verified         := OLD.crm_verified;
  NEW.crm_verified_at      := OLD.crm_verified_at;
  NEW.kyc_status           := OLD.kyc_status;
  NEW.kyc_verified_at      := OLD.kyc_verified_at;
  NEW.kyc_face_match_score := OLD.kyc_face_match_score;
  NEW.is_approved          := OLD.is_approved;

  RETURN NEW;
END;
$$;

-- Recria o gatilho cobrindo INSERT além de UPDATE.
DROP TRIGGER IF EXISTS zzz_protect_doctor_verification ON public.doctor_profiles;
CREATE TRIGGER zzz_protect_doctor_verification
  BEFORE INSERT OR UPDATE ON public.doctor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_doctor_verification_fields();

COMMENT ON FUNCTION public.protect_doctor_verification_fields() IS
  'C1 + P0: colunas de verificação/aprovação do médico só são definidas pelo '
  'servidor ou por admin — nem por UPDATE nem por INSERT do próprio usuário.';
