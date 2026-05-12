-- Pingo Card subscriptions: adiciona colunas Mercado Pago
ALTER TABLE public.pingo_card_subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payer_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'mercadopago' CHECK (gateway IN ('mercadopago', 'asaas')),
  ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pingo_card_sub_mp ON public.pingo_card_subscriptions (mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

-- Permite UPDATE de cancelled_at via auth.uid (paciente cancela própria assinatura)
DROP POLICY IF EXISTS "users cancel own pingo sub" ON public.pingo_card_subscriptions;
CREATE POLICY "users cancel own pingo sub" ON public.pingo_card_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
