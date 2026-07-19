 import { Video, Pill, Upload, FileText, TrendingUp, Smile } from "lucide-react";
 export const useHealthTimeline = (limit: number = 5) => {
   const { user } = useAuth();
   return useQuery({
     queryKey: ["patient-health-timeline", user?.id, limit],
     queryFn: async () => {
       if (!user) return [];
 
       const [apptsRes, prescsRes, docsRes, recordsRes, metricsRes, diaryRes] = await Promise.all([
         db.from("appointments").select("id, scheduled_at, status, doctor_id").eq("patient_id", user.id).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(limit),
         db.from("prescriptions").select("id, created_at, diagnosis, doctor_id").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(limit),
         db.from("patient_documents").select("id, created_at, file_name, description").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(limit),
         db.from("medical_records").select("id, created_at, title, record_type, cid_code").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(limit),
         db.from("health_metrics").select("id, measured_at, type, value, unit, notes").eq("patient_id", user.id).order("measured_at", { ascending: false }).limit(limit),
         db.from("symptom_diary").select("id, entry_date, mood, symptoms, notes").eq("patient_id", user.id).order("entry_date", { ascending: false }).limit(limit),
       ]);
 
       // Group all events
       const timeline: any[] = [
         ...(apptsRes.data?.map(a => ({
           id: `appt-${a.id}`, date: a.scheduled_at, type: "consultation",
           title: "Consulta Realizada", subtitle: "Médico",
           icon: Video, color: "text-primary bg-primary/10",
         })) ?? []),
         ...(prescsRes.data?.map(p => ({
           id: `presc-${p.id}`, date: p.created_at, type: "prescription",
           title: p.diagnosis || "Receita Médica", subtitle: "Médico",
           icon: Pill, color: "text-amber-500 bg-amber-500/10",
         })) ?? []),
         ...(docsRes.data?.map(d => ({
           id: `doc-${d.id}`, date: d.created_at, type: "document",
           title: d.file_name, subtitle: d.description || "Documento anexado",
           icon: Upload, color: "text-blue-500 bg-blue-500/10",
         })) ?? []),
         ...(recordsRes.data?.map(r => ({
           id: `rec-${r.id}`, date: r.created_at, type: "record",
           title: r.title, subtitle: `${r.record_type}`,
           icon: FileText, color: "text-slate-500 bg-slate-500/10",
         })) ?? []),
         ...(metricsRes.data?.map(m => ({
           id: `met-${m.id}`, date: m.measured_at!, type: "metric",
           title: `${m.type}: ${m.value} ${m.unit}`, subtitle: m.notes || "Métrica registrada",
           icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/10",
         })) ?? []),
         ...(diaryRes.data?.map(d => ({
           id: `diary-${d.id}`, date: d.entry_date, type: "symptom",
           title: `Humor: ${d.mood}`, subtitle: "Registro diário",
           icon: Smile, color: "text-rose-500 bg-rose-500/10",
         })) ?? []),
       ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
 
       return timeline.slice(0, limit);
     },
     enabled: !!user,
     staleTime: 5 * 60 * 1000,
   });
 };
import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";

export type ServiceType = "telemedicina" | "all";

/**
 * Detect service type from patient's active appointments
 * Returns the primary service type or "all" as default
 */
export const useDetectPatientService = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-service-type", user?.id],
    queryFn: async (): Promise<ServiceType> => {
      if (!user) return "all";

      // Fetch recent appointments to detect service type
      const { data: appts } = await db
        .from("appointments")
        .select("appointment_type")
        .eq("patient_id", user.id)
        .in("status", ["scheduled", "waiting", "in_progress", "completed"])
        .order("scheduled_at", { ascending: false })
        .limit(10);

      if (!appts || appts.length === 0) return "all";

      // Count by type
      const types = appts.map(a => a.appointment_type?.toLowerCase());
      const telemedicineCount = types.filter(t => t?.includes("telemedicina") || t?.includes("video")).length;

      // Return dominant service type
      if (telemedicineCount > 0) return "telemedicina";

      return "all";
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// ─── Shared helper: resolve doctor names from a list of doctor_profile IDs ────

interface WithDoctorId { doctor_id: string }

/**
 * Given an array of records that have a doctor_id field,
 * resolves each doctor's display name in a single batch fetch.
 * Returns a new array with a `doctor_name` field added to each record.
 */
async function enrichWithDoctorNames(
  records: any[],
): Promise<any[]> {
  if (!records.length) return [];

  const doctorIds = [...new Set(records.map(r => r.doctor_id))];
  const { data: docs } = await db
    .from("doctor_profiles")
    .select("id, user_id")
    .in("id", doctorIds);

  if (!docs?.length) return records.map(r => ({ ...r, doctor_name: "Médico" }));

  const userIds = docs.map(d => d.user_id);
  const { data: profiles } = await db
    .from("profiles")
    .select("user_id, first_name, last_name")
    .in("user_id", userIds);

  const nameMap = new Map<string, string>();
  docs.forEach(d => {
    const p = profiles?.find(pr => pr.user_id === d.user_id);
    if (p) nameMap.set(d.id, `Dr(a). ${p.first_name} ${p.last_name}`);
  });

  return records.map(r => ({ ...r, doctor_name: nameMap.get(r.doctor_id) ?? "Médico" }));
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const usePatientStats = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-dashboard-stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [completedRes, prescRes, docsRes] = await Promise.all([
        db
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", user.id)
          .eq("status", "completed"),
        db
          .from("prescriptions")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", user.id),
        db
          .from("patient_documents")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", user.id),
      ]);
      return {
        total: completedRes.count ?? 0,
        prescriptions: prescRes.count ?? 0,
        documents: docsRes.count ?? 0,
      };
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
};

export const usePatientUpcoming = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-upcoming-enriched", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: appts } = await db
        .from("appointments")
        .select("id, scheduled_at, status, doctor_id, duration_minutes, appointment_type")
        .eq("patient_id", user.id)
        .gte("scheduled_at", new Date().toISOString())
        .in("status", ["scheduled", "waiting", "in_progress"])
        .order("scheduled_at", { ascending: true })
        .limit(5);

      return enrichWithDoctorNames(appts ?? []);
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useReturnAppointments = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-return-appts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: returnData } = await db
        .from("appointments")
        .select("id, scheduled_at, doctor_id, return_deadline")
        .eq("patient_id", user.id)
        .eq("status", "completed")
        .not("return_deadline", "is", null)
        .gte("return_deadline", new Date().toISOString());

      return enrichWithDoctorNames(returnData ?? []);
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
};

export const useRecentHealthMetrics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-recent-metrics", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await db
        .from("health_metrics")
        .select("type, value, unit, measured_at")
        .eq("patient_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(10);

      if (!data?.length) return [];

      // Deduplicate: keep only the most recent entry per metric type
      const latest = new Map<string, typeof data[0]>();
      data.forEach(m => { if (!latest.has(m.type)) latest.set(m.type, m); });
      return Array.from(latest.values()).slice(0, 4);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
};

export const useFavoriteDoctors = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patient-fav-doctors", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: favData } = await db
        .from("favorite_doctors")
        .select("doctor_id")
        .eq("patient_id", user.id);

      if (!favData?.length) return [];
      const favDocIds = favData.map(f => f.doctor_id);

      const { data: favDocs } = await db
        .from("doctor_profiles")
        .select("id, user_id, consultation_price, rating")
        .in("id", favDocIds);

      if (!favDocs?.length) return [];

      // Fetch profiles + specialties in parallel
      const favUserIds = favDocs.map(d => d.user_id);
      const [{ data: favProfiles }, { data: favSpecs }] = await Promise.all([
        db.from("profiles").select("user_id, first_name, last_name").in("user_id", favUserIds),
        db.from("doctor_specialties").select("doctor_id, specialties(name)").in("doctor_id", favDocIds),
      ]);

      return favDocs.map(d => {
        const p = favProfiles?.find(pr => pr.user_id === d.user_id);
        const specs = (favSpecs ?? [])
          .filter((s: { doctor_id: string }) => s.doctor_id === d.id)
          .map((s: { specialties?: { name?: string } | null }) => s.specialties?.name)
          .filter(Boolean) as string[];

        return {
          ...d,
          name: p ? `Dr(a). ${p.first_name} ${p.last_name}` : "Médico",
          specs,
        };
      });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
};
