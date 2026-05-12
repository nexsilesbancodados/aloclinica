/**
 * usePrescriptionData — Hook centralizado para prescrições
 *
 * Elimina duplicação entre PrescriptionForm, MemedPrescription, CfmPrescription
 * Gerencia validação, persistência e estado compartilhado
 */

import { useState, useEffect, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

export interface Medication {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  contraindications?: string;
}

export interface PrescriptionData {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  patientCpf: string;
  diagnosis: string;
  observations: string;
  medications: Medication[];
  doctorInfo: {
    id: string;
    crm: string;
    crm_state: string;
    user_id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface ValidationError {
  field: keyof Medication | "medications" | "general";
  message: string;
}

export function usePrescriptionData(appointmentId?: string) {
  const [data, setData] = useState<PrescriptionData>({
    appointmentId: appointmentId || "",
    doctorId: "",
    patientId: "",
    patientName: "",
    patientCpf: "",
    diagnosis: "",
    observations: "",
    medications: [emptyMedication()],
    doctorInfo: null,
  });

  const [loading, setLoading] = useState(!!appointmentId);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // ─── Medicamento vazio ─────────────────────────────────────────────────────
  function emptyMedication(): Medication {
    return { name: "", dosage: "", frequency: "", duration: "", instructions: "" };
  }

  // ─── Carregar dados do appointmentId ───────────────────────────────────────
  useEffect(() => {
    if (!appointmentId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // 1. Fetch appointment
        const { data: appt } = await db
          .from("appointments")
          .select("patient_id, guest_patient_id, doctor_id")
          .eq("id", appointmentId)
          .single();

        if (!appt) {
          setErrors([{ field: "general", message: "Agendamento não encontrado" }]);
          setLoading(false);
          return;
        }

        // 2. Fetch patient
        let patientName = "";
        let patientCpf = "";
        const patientId = appt.patient_id || appt.guest_patient_id;

        if (appt.patient_id) {
          const { data: profile } = await db
            .from("profiles")
            .select("first_name, last_name, cpf")
            .eq("user_id", appt.patient_id)
            .single();
          if (profile) {
            patientName = `${profile.first_name} ${profile.last_name}`;
            patientCpf = profile.cpf || "";
          }
        } else if (appt.guest_patient_id) {
          const { data: guest } = await db
            .from("guest_patients")
            .select("full_name, cpf")
            .eq("id", appt.guest_patient_id)
            .single();
          if (guest) {
            patientName = guest.full_name;
            patientCpf = guest.cpf || "";
          }
        }

        // 3. Fetch doctor
        const { data: doctor } = await db
          .from("doctor_profiles")
          .select("id, crm, crm_state, user_id")
          .eq("id", appt.doctor_id)
          .single();

        let doctorInfo = null;
        if (doctor) {
          const { data: docProfile } = await db
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", doctor.user_id)
            .single();

          doctorInfo = {
            ...doctor,
            first_name: docProfile?.first_name ?? "",
            last_name: docProfile?.last_name ?? "",
          } as any;
        }

        // 4. Check for existing prescription draft
        const { data: existing } = await (db as any)
          .from("prescriptions")
          .select("diagnosis, observations, medications")
          .eq("appointment_id", appointmentId)
          .eq("status", "draft")
          .single();

        setData({
          appointmentId,
          doctorId: appt.doctor_id,
          patientId: patientId || "",
          patientName,
          patientCpf,
          diagnosis: (existing as any)?.diagnosis || "",
          observations: (existing as any)?.observations || "",
          medications: (existing as any)?.medications || [emptyMedication()],
          doctorInfo,
        });
      } catch (err) {
        logError("fetchPrescriptionData failed", err);
        setErrors([{ field: "general", message: "Erro ao carregar dados" }]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [appointmentId]);

  // ─── Validação ────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const newErrors: ValidationError[] = [];

    // Diagnóstico
    if (!data.diagnosis?.trim()) {
      newErrors.push({ field: "general", message: "Diagnóstico obrigatório" });
    }

    // Medicamentos
    const validMeds = data.medications.filter(m => m.name?.trim());
    if (validMeds.length === 0) {
      newErrors.push({ field: "medications", message: "Adicione pelo menos um medicamento" });
    }

    // Validar cada medicamento
    validMeds.forEach((med, idx) => {
      if (!med.dosage?.trim()) {
        newErrors.push({
          field: "general",
          message: `Medicamento ${idx + 1}: Dosagem obrigatória`,
        });
      }
      if (!med.frequency?.trim()) {
        newErrors.push({
          field: "general",
          message: `Medicamento ${idx + 1}: Frequência obrigatória`,
        });
      }
      if (!med.duration?.trim()) {
        newErrors.push({
          field: "general",
          message: `Medicamento ${idx + 1}: Duração obrigatória`,
        });
      }
    });

    setErrors(newErrors);
    return newErrors.length === 0;
  }, [data]);

  // ─── Atualizar campos ─────────────────────────────────────────────────────
  const updateField = useCallback(<K extends keyof PrescriptionData>(
    field: K,
    value: PrescriptionData[K]
  ) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateMedication = useCallback((index: number, med: Medication) => {
    setData(prev => {
      const meds = [...prev.medications];
      meds[index] = med;
      return { ...prev, medications: meds };
    });
  }, []);

  const addMedication = useCallback(() => {
    setData(prev => ({
      ...prev,
      medications: [...prev.medications, emptyMedication()],
    }));
  }, []);

  const removeMedication = useCallback((index: number) => {
    setData(prev => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  }, []);

  const clearMedications = useCallback(() => {
    setData(prev => ({
      ...prev,
      medications: [emptyMedication()],
    }));
  }, []);

  const loadTemplate = useCallback((tpl: { diagnosis: string; medications: Medication[]; observations: string }) => {
    setData(prev => ({
      ...prev,
      diagnosis: tpl.diagnosis || prev.diagnosis,
      observations: tpl.observations || prev.observations,
      medications: tpl.medications.length > 0 ? tpl.medications.map(m => ({ ...m })) : prev.medications,
    }));
  }, []);

  // ─── Salvar rascunho ──────────────────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!validate()) return false;

    try {
      const { error } = await (db as any).from("prescriptions").upsert({
        appointment_id: data.appointmentId,
        doctor_id: data.doctorId,
        patient_id: data.patientId,
        diagnosis: data.diagnosis,
        observations: data.observations,
        medications: data.medications.filter(m => m.name?.trim()),
        status: "draft",
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      return true;
    } catch (err) {
      logError("saveDraft failed", err);
      setErrors([{ field: "general", message: "Erro ao salvar rascunho" }]);
      return false;
    }
  }, [data, validate]);

  return {
    data,
    loading,
    errors,
    validate,
    updateField,
    updateMedication,
    addMedication,
    removeMedication,
    clearMedications,
    loadTemplate,
    saveDraft,
    hasErrors: errors.length > 0,
    validMedications: data.medications.filter(m => m.name?.trim()),
  };
}
