-- ===================================================================
-- ESCALA S1 — Indexes hot-path + idempotency do webhook MP
-- ===================================================================
-- Problemas atacados:
--   1. mercadopago-webhook insere transactions sem dedupe → MP retry duplica
--   2. Queries hot (DoctorSearch, Dashboard, Webhook lookup) sem indexes
-- ===================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. IDEMPOTENCY — UNIQUE em mp_payment_id (MP retry vira no-op)
-- ──────────────────────────────────────────────────────────────────
-- Antes de criar, dedupe linhas existentes (se houver)
DELETE FROM public.payment_transactions a
USING public.payment_transactions b
WHERE a.id < b.id
  AND a.mp_payment_id = b.mp_payment_id
  AND a.mp_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_tx_mp_payment_id
  ON public.payment_transactions (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. INDEXES — DoctorSearch
-- Filtro: WHERE is_approved=true AND doctor_type=X ORDER BY rating DESC
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_search
  ON public.doctor_profiles (doctor_type, is_approved, rating DESC)
  WHERE is_approved = true;

-- ──────────────────────────────────────────────────────────────────
-- 3. INDEXES — Appointments (queries do dashboard)
-- ──────────────────────────────────────────────────────────────────
-- Patient dashboard: WHERE patient_id=X AND status IN (...) ORDER BY scheduled_at
CREATE INDEX IF NOT EXISTS idx_appts_patient_scheduled
  ON public.appointments (patient_id, scheduled_at DESC)
  WHERE status IN ('scheduled', 'waiting', 'in_progress', 'completed');

-- Doctor dashboard: WHERE doctor_id=X AND status=X ORDER BY scheduled_at
CREATE INDEX IF NOT EXISTS idx_appts_doctor_status_scheduled
  ON public.appointments (doctor_id, status, scheduled_at DESC);

-- Admin appointments: ORDER BY scheduled_at DESC com filtro status
CREATE INDEX IF NOT EXISTS idx_appts_status_scheduled
  ON public.appointments (status, scheduled_at DESC);

-- BookAppointment: slots ocupados em data específica
CREATE INDEX IF NOT EXISTS idx_appts_doctor_date
  ON public.appointments (doctor_id, scheduled_at)
  WHERE status NOT IN ('cancelled', 'no_show');

-- ──────────────────────────────────────────────────────────────────
-- 4. INDEXES — Notifications + Messages (NotificationBell)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread_recipient
  ON public.messages (is_read, sender_id, created_at DESC)
  WHERE is_read = false;

-- ──────────────────────────────────────────────────────────────────
-- 5. INDEXES — Subscriptions + Saved Cards (Billing Portal)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON public.subscriptions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_cards_user_active
  ON public.saved_cards (user_id, is_default DESC, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_payment_tx_user_status
  ON public.payment_transactions (user_id, status, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 6. INDEXES — Pingo Card
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pingo_card_sub_user_status
  ON public.pingo_card_subscriptions (user_id, status, started_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 7. INDEXES — Availability Slots (BookAppointment lookup)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_availability_slots_doctor_active
  ON public.availability_slots (doctor_id, day_of_week, start_time)
  WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────────
-- 8. INDEXES — Activity logs (admin queries)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created
  ON public.activity_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs (entity_type, entity_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 9. ANALYZE pra atualizar planner stats
-- ──────────────────────────────────────────────────────────────────
ANALYZE public.payment_transactions;
ANALYZE public.appointments;
ANALYZE public.doctor_profiles;
ANALYZE public.notifications;
ANALYZE public.subscriptions;
ANALYZE public.pingo_card_subscriptions;
