-- ============================================================================
-- Restaura as colunas de `on_demand_queue` perdidas na recriação da tabela.
-- ----------------------------------------------------------------------------
-- O QUE ACONTECEU
--
-- `20260225132502` criou `on_demand_queue` com shift, price, payment_id,
-- position, assigned_at, started_at, completed_at e appointment_id.
-- `20260415020135` recriou a tabela SEM nenhuma delas. O banco em produção hoje
-- tem apenas: id, patient_id, specialty_id, status, priority,
-- assigned_doctor_id, symptoms, created_at, updated_at.
--
-- Verificado contra produção: um select de `paid_at` responde
-- `42703 column on_demand_queue.paid_at does not exist`.
--
-- POR QUE IMPORTA
--
-- O front escreve nessas colunas (`UrgentCareQueue.tsx`): a entrada na fila
-- grava shift/price, a confirmação de pagamento grava payment_id, e o pedido de
-- reembolso grava completed_at. Sem as colunas, essas escritas falham.
--
-- E a migration `20260809100300`, ainda não aplicada, escreve em oito delas
-- dentro de um gatilho. Corpo de função PL/pgSQL não é validado no
-- CREATE FUNCTION: ela aplicaria limpa e quebraria toda escrita na fila depois,
-- com o early-return de service_role mascarando a falha do monitoramento.
--
-- DECISÕES DE TIPO
--
-- Os tipos abaixo são os do CREATE TABLE original, não uma escolha nova, para
-- que o histórico da tabela volte a ser coerente. A única coluna sem
-- precedente é `paid_at`: `20260809100300` a declara como `timestamptz`
-- (`v_paid_at timestamptz`), e é esse o tipo adotado aqui.
--
-- `price` e `shift` entram com NOT NULL + DEFAULT como no original — seguro em
-- tabela com linhas existentes, porque o default preenche as antigas.
--
-- Idempotente: pode ser reexecutada.
-- ============================================================================

ALTER TABLE public.on_demand_queue
  ADD COLUMN IF NOT EXISTS shift        TEXT NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS price        NUMERIC NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS payment_id   TEXT,
  ADD COLUMN IF NOT EXISTS position     INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS started_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS appointment_id UUID,
  -- Sem precedente na linhagem: o tipo vem da declaração em 20260809100300.
  ADD COLUMN IF NOT EXISTS paid_at      TIMESTAMP WITH TIME ZONE;

-- Chave estrangeira em bloco próprio: ADD CONSTRAINT não aceita IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'on_demand_queue_appointment_id_fkey'
      AND conrelid = 'public.on_demand_queue'::regclass
  ) THEN
    ALTER TABLE public.on_demand_queue
      ADD CONSTRAINT on_demand_queue_appointment_id_fkey
      FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
  END IF;
END $$;

-- A fila é consultada por consulta vinculada e por status; sem estes índices a
-- varredura é sequencial a cada poll do paciente.
CREATE INDEX IF NOT EXISTS idx_on_demand_queue_appointment
  ON public.on_demand_queue (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_demand_queue_status_created
  ON public.on_demand_queue (status, created_at);

COMMENT ON COLUMN public.on_demand_queue.paid_at IS
  'Momento da confirmação do pagamento. Escrita apenas por service_role (edge functions de pagamento).';
COMMENT ON COLUMN public.on_demand_queue.price IS
  'Valor cobrado pela entrada na fila, já com desconto aplicado.';
