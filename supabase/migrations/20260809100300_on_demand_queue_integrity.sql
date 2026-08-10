-- P1 (FINANCE): a patient-owned queue row must not be able to manufacture
-- payment proof, assign itself to a doctor, or choose an arbitrary price.
--
-- The payment edge functions are the only trusted writers of paid_at and the
-- queue assignment flow is doctor-owned. This trigger is defense in depth for
-- the historical broad "Patients manage own queue" UPDATE policy.

CREATE OR REPLACE FUNCTION public.protect_on_demand_queue_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour integer;
  v_base numeric;
  v_discount numeric;
  v_discount_card_found boolean := false;
  v_has_discount_percent boolean := false;
  v_has_valid_until boolean := false;
  v_payment_valid boolean := false;
  v_actor_doctor_id uuid;
  v_requested_payment_id text;
  v_paid_at timestamptz;
BEGIN
  -- Service-role writers and admins are the trusted payment/operations path.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Keep a paid queue entry as an auditable financial resource. Failed or
    -- never-paid reservations may still be removed by the patient.
    IF OLD.payment_id IS NOT NULL
       OR OLD.paid_at IS NOT NULL
       OR OLD.status NOT IN ('pending_payment', 'cancelled')
    THEN
      RETURN NULL;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- The queue price is derived from the server clock and the user's active
    -- discount card. Do not trust shift or price supplied by the browser.
    v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
    IF v_hour >= 7 AND v_hour < 19 THEN
      NEW.shift := 'day';
      v_base := 75;
    ELSIF v_hour >= 19 THEN
      NEW.shift := 'night';
      v_base := 100;
    ELSE
      NEW.shift := 'dawn';
      v_base := 120;
    END IF;

    -- discount_cards was reconstructed in an earlier schema migration. The
    -- catalog can be partially deployed, so fail closed to no discount if the
    -- table is not present yet.
    IF to_regclass('public.discount_cards') IS NOT NULL
    THEN
      SELECT EXISTS (
               SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'discount_cards'
                  AND column_name = 'discount_percent'
             ),
             EXISTS (
               SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'discount_cards'
                  AND column_name = 'valid_until'
             )
        INTO v_has_discount_percent, v_has_valid_until;

      -- Older reconstructed schemas may lack discount_percent. The UI uses
      -- 30% as its documented fallback, so preserve that same price instead
      -- of charging the patient the undiscounted amount or failing the INSERT.
      IF v_has_valid_until AND v_has_discount_percent THEN
        EXECUTE $query$
          SELECT true, discount_percent
            FROM public.discount_cards
           WHERE user_id = $1
             AND status = 'active'
             AND (valid_until IS NULL OR valid_until >= now())
           ORDER BY created_at DESC
           LIMIT 1
        $query$
        INTO v_discount_card_found, v_discount
        USING NEW.patient_id;
      ELSIF v_has_valid_until THEN
        EXECUTE $query$
          SELECT true, 30::numeric
            FROM public.discount_cards
           WHERE user_id = $1
             AND status = 'active'
             AND (valid_until IS NULL OR valid_until >= now())
           ORDER BY created_at DESC
           LIMIT 1
        $query$
        INTO v_discount_card_found, v_discount
        USING NEW.patient_id;
      END IF;
    END IF;

    v_discount := CASE WHEN v_discount_card_found
      THEN LEAST(GREATEST(COALESCE(v_discount, 30), 0), 100)
      ELSE 0
    END;
    NEW.price := ROUND(v_base * (1 - v_discount / 100), 2);
    NEW.status := 'pending_payment';
    NEW.payment_id := NULL;
    NEW.paid_at := NULL;
    NEW.assigned_doctor_id := NULL;
    NEW.assigned_at := NULL;
    NEW.started_at := NULL;
    NEW.completed_at := NULL;
    NEW.appointment_id := NULL;
    RETURN NEW;
  END IF;

  -- Payment and price are immutable for every authenticated non-admin writer.
  v_requested_payment_id := NEW.payment_id;
  NEW.price := OLD.price;
  NEW.paid_at := OLD.paid_at;
  NEW.payment_id := OLD.payment_id;

  -- An approved doctor may claim a waiting row, finish it, and release it back
  -- to waiting if creating the appointment fails. The doctor may only claim
  -- for their own profile; service_role/admin remain the other trusted path.
  SELECT dp.id
    INTO v_actor_doctor_id
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid()
     AND COALESCE(dp.is_approved, false) = true
   LIMIT 1;

  IF v_actor_doctor_id IS NOT NULL
     AND (OLD.assigned_doctor_id = v_actor_doctor_id
          OR NEW.assigned_doctor_id = v_actor_doctor_id)
  THEN
    IF OLD.assigned_doctor_id IS NULL
       AND NEW.assigned_doctor_id <> v_actor_doctor_id
    THEN
      NEW.assigned_doctor_id := OLD.assigned_doctor_id;
      NEW.status := OLD.status;
      RETURN NEW;
    END IF;

    IF OLD.assigned_doctor_id = v_actor_doctor_id
       AND NEW.assigned_doctor_id IS NOT NULL
       AND NEW.assigned_doctor_id <> OLD.assigned_doctor_id
    THEN
      NEW.assigned_doctor_id := OLD.assigned_doctor_id;
    END IF;
    RETURN NEW;
  END IF;

  -- A patient can leave/cancel their own queue entry, but cannot rewrite the
  -- assignment, timestamps, or appointment linkage.
  NEW.assigned_doctor_id := OLD.assigned_doctor_id;
  NEW.assigned_at := OLD.assigned_at;
  NEW.started_at := OLD.started_at;
  NEW.completed_at := OLD.completed_at;
  NEW.appointment_id := OLD.appointment_id;

  -- Synchronous card flows return an approved payment before the browser marks
  -- the row waiting. Permit that one transition only when the server ledger
  -- proves the payment belongs to this queue and this patient. Async PIX/boleto
  -- transitions are performed by service_role and bypass this branch.
  IF NEW.status = 'waiting' AND OLD.status = 'pending_payment' THEN
    IF v_requested_payment_id IS NOT NULL
       AND to_regclass('public.payment_transactions') IS NOT NULL
    THEN
      EXECUTE $query$
        SELECT EXISTS (
          SELECT 1
            FROM public.payment_transactions
           WHERE mp_payment_id = $1
             AND resource_id = $2
             AND resource_type = 'urgent_queue'
             AND user_id = $3
             AND status = 'approved'
        )
      $query$
      INTO v_payment_valid
      USING v_requested_payment_id, NEW.id::text, auth.uid();
    END IF;

    IF NOT v_payment_valid THEN
      NEW.status := OLD.status;
      NEW.payment_id := OLD.payment_id;
      RETURN NEW;
    END IF;

    NEW.payment_id := v_requested_payment_id;

    -- The ledger timestamp is the payment proof used by the appointment
    -- integrity trigger. It is still server-derived, never client-provided.
    EXECUTE $query$
      SELECT paid_at
        FROM public.payment_transactions
       WHERE mp_payment_id = $1
         AND resource_id = $2
         AND resource_type = 'urgent_queue'
         AND user_id = $3
         AND status = 'approved'
       LIMIT 1
    $query$
    INTO v_paid_at
      USING NEW.payment_id, NEW.id::text, auth.uid();
    NEW.paid_at := v_paid_at;
  ELSIF NEW.status = 'waiting'
        AND v_requested_payment_id IS DISTINCT FROM OLD.payment_id THEN
    -- Once waiting, a patient cannot swap the payment reference underneath
    -- the already-proven queue entry.
    NEW.status := OLD.status;
    NEW.payment_id := OLD.payment_id;
    RETURN NEW;
  ELSIF NEW.status NOT IN ('pending_payment', 'cancelled', 'waiting') THEN
    -- Doctors/service_role own assigned/in-progress/completed transitions.
    NEW.status := OLD.status;
    NEW.payment_id := OLD.payment_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_protect_on_demand_queue ON public.on_demand_queue;
CREATE TRIGGER zzz_protect_on_demand_queue
  BEFORE INSERT OR UPDATE OR DELETE ON public.on_demand_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_on_demand_queue_integrity();

COMMENT ON FUNCTION public.protect_on_demand_queue_integrity() IS
  'Prevents patient-side queue price/payment/assignment forgery; trusted server and admin writers bypass it.';
