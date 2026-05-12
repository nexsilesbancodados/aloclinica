-- Adiciona coluna doctor_type em doctor_profiles
-- Frontend (DoctorSearch, BookAppointment, SignupDoctor, SignupOftalmologist) já
-- filtra/insere por essa coluna mas ela não existia → queries silenciosamente falhavam
-- e busca de médicos retornava vazio.

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS doctor_type TEXT NOT NULL DEFAULT 'telemedicina'
    CHECK (doctor_type IN ('telemedicina', 'oftalmologia', 'laudista'));

CREATE INDEX IF NOT EXISTS idx_doctor_profiles_type
  ON public.doctor_profiles (doctor_type)
  WHERE is_approved = true;

-- Médicos sem oftalmologista cadastro vão como telemedicina por default.
-- Admin pode reclassificar caso a caso via /dashboard/admin/doctors.
