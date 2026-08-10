-- ============================================================================
-- P0 (FINANCEIRO): o PACIENTE conseguia marcar a própria consulta como PAGA.
-- ----------------------------------------------------------------------------
-- A policy de UPDATE é `USING (auth.uid() = patient_id)` — sem WITH CHECK e sem
-- restrição de coluna — e NÃO havia gatilho protegendo as colunas financeiras
-- (diferente de doctor_profiles, que ganhou zzz_protect_doctor_verification).
-- O front fazia literalmente isso em BookAppointment.finalizeApprovedAppointment:
--
--   update appointments set payment_status='approved', payment_confirmed_at=now()
--
-- Como existem gatilhos AFTER UPDATE que CREDITAM O MÉDICO nessa transição
-- (trg_credit_doctor_on_payment_confirmed, fn_create_payout_on_completion,
--  payout_fee_50_50), uma única chamada REST com o token do próprio paciente
-- marcava a consulta como paga, liberava o atendimento e GERAVA REPASSE REAL
-- (withdrawal_requests → Money Out) de dinheiro que nunca entrou. Prejuízo
-- direto, sem exigir habilidade nenhuma.
--
-- Correção (defensiva, mesmo padrão do C1 — não quebra fluxo legítimo):
-- gatilho BEFORE INSERT OR UPDATE que, para chamadas de USUÁRIO comum, força as
-- colunas financeiras. Chamadas do SERVIDOR (service_role → auth.uid() é NULL:
-- webhooks do Mercado Pago/PagBank, edge functions) e de ADMIN continuam livres,
-- que é exatamente por onde a confirmação de pagamento LEGÍTIMA acontece.
--
-- Fluxos legítimos preservados:
--  - Agendamento normal: nasce 'pending'; quem aprova é o webhook (service_role).
--  - Plantão/urgência: o médico cria a consulta já 'approved' a partir de uma
--    entrada da fila que o PACIENTE já pagou (on_demand_queue.paid_at). Este é
--    o ÚNICO caminho de usuário que pode nascer aprovado, e é verificado no banco.
--  - Cancelar / entrar na sala / iniciar / concluir: continuam funcionando.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_appointment_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap        numeric;
  v_queue_paid boolean;
  v_is_doctor  boolean;
BEGIN
  -- Servidor (service_role, sem usuário) e admin: sem restrição.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Plantão: o médico aceita um paciente da fila que JÁ PAGOU e cria a consulta
    -- já aprovada. Este é o ÚNICO caminho de usuário que pode nascer aprovado.
    --
    -- A prova de pagamento vem de `payment_transactions`, NÃO de on_demand_queue:
    --   1. A fila é gravável pelo paciente ("Patients manage own queue" FOR ALL,
    --      sem WITH CHECK nem proteção de coluna), então `paid_at`/`price` ali são
    --      FORJÁVEIS — ancorar neles apenas encompridava o ataque em dois passos.
    --      payment_transactions tem RLS com apenas `pt_owner_select` (SELECT do
    --      dono) e nenhuma policy de escrita para usuário: é server-only.
    --   2. `mercadopago-create-payment` grava o ledger de forma SÍNCRONA. Ancorar
    --      em on_demand_queue.paid_at — escrito só pelo webhook, assíncrono —
    --      criava uma corrida: o médico aceita em segundos, o webhook ainda não
    --      chegou, e o repasse do plantonista virava 'pending' em silêncio.
    --
    -- Deliberadamente NÃO gateamos por appointment_type: o código insere
    -- 'urgent_care', mas o enum de 20260415020135 é
    -- ('first_visit','return','urgency') — um rótulo divergente quebraria o
    -- repasse. O que autoriza é o pagamento aprovado, não a string do tipo.
    --
    -- `appointment_id IS NULL` mantém a autorização de uso único: uma entrada de
    -- fila já vinculada a outra consulta não aprova uma nova.
    --
    -- Guarda to_regclass: se a tabela do ledger não existir neste ambiente,
    -- degradamos para 'pending' (fail-closed) em vez de derrubar TODO INSERT de
    -- consulta com erro de relação inexistente.
    IF to_regclass('public.payment_transactions') IS NOT NULL THEN
      EXECUTE $query$
        SELECT (pt.amount_cents::numeric / 100)
          FROM public.on_demand_queue q
          JOIN public.payment_transactions pt
            ON pt.resource_type = 'urgent_queue'
           AND pt.resource_id   = q.id::text
           AND pt.user_id       = $1
           AND pt.status        = 'approved'
         WHERE q.patient_id         = $1
           AND q.assigned_doctor_id = $2
           AND q.appointment_id IS NULL
         ORDER BY pt.paid_at DESC NULLS LAST
         LIMIT 1
      $query$
      INTO v_cap
      USING NEW.patient_id, NEW.doctor_id;
    END IF;

    v_queue_paid := v_cap IS NOT NULL;

    IF NOT v_queue_paid THEN
      NEW.payment_status       := 'pending';
      NEW.payment_confirmed_at := NULL;
      NEW.payment_id           := NULL;

      -- Teto do preço = preço do médico (fonte do servidor, que o paciente não
      -- escreve). Descontos legítimos (retorno 50%, cupom) só REDUZEM o valor,
      -- então LEAST preserva o fluxo e impede inflar repasse/NFS-e com um valor
      -- arbitrário — price_at_booking alimenta fn_create_payout_on_completion.
      SELECT dp.price INTO v_cap
        FROM public.doctor_profiles dp
       WHERE dp.id = NEW.doctor_id;
    END IF;

    -- Teto do preço, com a fonte adequada a cada caminho:
    --   - plantão  → valor REALMENTE cobrado (payment_transactions.amount_cents);
    --   - demais   → preço do médico (doctor_profiles.price).
    -- Ambas server-only. LEAST porque descontos legítimos (retorno 50%, cupom)
    -- só REDUZEM — assim o fluxo normal passa intacto e fica impossível inflar
    -- price_at_booking, que alimenta fn_create_payout_on_completion e a NFS-e.
    IF v_cap IS NOT NULL AND NEW.price_at_booking IS NOT NULL THEN
      NEW.price_at_booking := LEAST(NEW.price_at_booking, v_cap);
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE ──
  -- Colunas financeiras são IMUTÁVEIS para o usuário. Só servidor/admin mudam.
  NEW.payment_status       := OLD.payment_status;
  NEW.payment_confirmed_at := OLD.payment_confirmed_at;
  NEW.payment_id           := OLD.payment_id;
  NEW.price_at_booking     := OLD.price_at_booking;

  -- 'completed' e 'no_show' disparam repasse ao médico. O PACIENTE não pode
  -- declarar esses dois estados na própria consulta (seria autocreditar o médico).
  --
  -- Escopo deliberadamente estreito: bloqueia só o paciente. Médico, recepção
  -- (is_receptionist) e clínica seguem marcando presença/falta normalmente —
  -- ReceptionDashboard e ClinicWaitingRoom dependem disso. Demais transições do
  -- paciente (cancelled, waiting) continuam liberadas.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('completed', 'no_show')
     AND auth.uid() = NEW.patient_id
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
       WHERE dp.id = NEW.doctor_id AND dp.user_id = auth.uid()
    ) INTO v_is_doctor;

    -- (um médico que também seja o paciente da própria consulta é caso de teste,
    --  não de produção — mas não faz sentido bloqueá-lo)
    IF NOT v_is_doctor THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Prefixo 'zzz_' para rodar por ÚLTIMO entre os BEFORE (reverte qualquer coluna
-- que um gatilho anterior tenha alterado a partir da tentativa do usuário).
DROP TRIGGER IF EXISTS zzz_protect_appointment_payment ON public.appointments;
CREATE TRIGGER zzz_protect_appointment_payment
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_appointment_payment_fields();

COMMENT ON FUNCTION public.protect_appointment_payment_fields() IS
  'P0: impede o paciente de marcar a própria consulta como paga (e de inflar '
  'price_at_booking / declarar completed|no_show). Servidor e admin passam livres.';
