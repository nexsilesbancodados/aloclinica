-- ===================================================================
-- medical_certificates — atestados médicos persistidos
-- ===================================================================
-- AppointmentDetail.tsx (Sprint G) buscava medical_certificates pra
-- mostrar atestados emitidos no detalhe da consulta. Mas a tabela não
-- existia — query retornava silenciosamente null.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.medical_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Dados do atestado
  type TEXT NOT NULL CHECK (type IN ('absence', 'attendance', 'fitness', 'other')),
  patient_name TEXT NOT NULL,
  patient_cpf TEXT,
  doctor_name TEXT NOT NULL,
  doctor_crm TEXT NOT NULL,
  days INTEGER,
  reason TEXT,
  cid TEXT,

  -- Documento + verificação
  pdf_url TEXT,
  storage_path TEXT,
  verification_code TEXT NOT NULL UNIQUE,
  document_hash TEXT,

  -- Timestamps
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_certs_appointment ON public.medical_certificates (appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medical_certs_patient ON public.medical_certificates (patient_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_certs_doctor ON public.medical_certificates (doctor_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_certs_verification ON public.medical_certificates (verification_code);

-- RLS
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient sees own certificates" ON public.medical_certificates;
CREATE POLICY "patient sees own certificates" ON public.medical_certificates
  FOR SELECT USING (auth.uid() = patient_id OR auth.uid() = doctor_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "doctor creates certificates" ON public.medical_certificates;
CREATE POLICY "doctor creates certificates" ON public.medical_certificates
  FOR INSERT WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "service role full" ON public.medical_certificates;
CREATE POLICY "service role full" ON public.medical_certificates
  FOR ALL TO service_role USING (true);

COMMENT ON TABLE public.medical_certificates IS 'Atestados/declarações emitidos pelos médicos. PDF assinado fica em storage.';
