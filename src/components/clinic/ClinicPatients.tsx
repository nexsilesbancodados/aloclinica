import { useState, useEffect, useCallback } from "react";
import mascotWelcome from "@/assets/mascot-welcome.png";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Users, Search, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { getClinicNav } from "./clinicNav";

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

interface PatientRow {
  user_id: string;
  name: string;
  phone?: string;
  totalAppts: number;
  lastVisit?: string;
}

const ClinicPatients = () => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const userId = user?.id;

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data: clinic } = await db.from("clinic_profiles").select("id").eq("user_id", userId).single();
    if (!clinic) { setLoading(false); return; }

    const { data: affiliations } = await db.from("clinic_affiliations").select("doctor_id").eq("clinic_id", clinic.id).eq("status", "active");
    const doctorIds = (affiliations ?? []).map(a => a.doctor_id);
    if (doctorIds.length === 0) { setLoading(false); return; }

    const { data: appts } = await db.from("appointments")
      .select("patient_id, scheduled_at, status")
      .in("doctor_id", doctorIds)
      .not("patient_id", "is", null)
      .order("scheduled_at", { ascending: false });

    // Group by patient
    const patientMap = new Map<string, { count: number; lastVisit: string }>();
    (appts ?? []).forEach(a => {
      if (!a.patient_id) return;
      const existing = patientMap.get(a.patient_id);
      if (!existing) {
        patientMap.set(a.patient_id, { count: 1, lastVisit: a.scheduled_at });
      } else {
        existing.count++;
      }
    });

    const patientIds = [...patientMap.keys()];
    if (patientIds.length === 0) { setPatients([]); setLoading(false); return; }

    const { data: profiles } = await db.from("profiles").select("user_id, first_name, last_name, phone").in("user_id", patientIds);

    const rows: PatientRow[] = patientIds.map(pid => {
      const profile = (profiles ?? []).find(p => p.user_id === pid);
      const stats = patientMap.get(pid)!;
      return {
        user_id: pid,
        name: profile ? `${profile.first_name} ${profile.last_name}` : "Paciente",
        phone: profile?.phone ?? undefined,
        totalAppts: stats.count,
        lastVisit: stats.lastVisit,
      };
    }).sort((a, b) => b.totalAppts - a.totalAppts);

    setPatients(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filtered = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? "").includes(search));

  return (
    <DashboardLayout title="Pacientes" nav={getClinicNav("patients")} role="clinic">
      <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="max-w-4xl space-y-5">
        <motion.div variants={fadeUp}>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Pacientes da Clínica</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{patients.length} pacientes atendidos</p>
        </motion.div>

        <motion.div variants={fadeUp} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl" />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="border-border/50">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3 pb-24 md:pb-8">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
              <img src={mascotWelcome} alt="Pingo" className="w-20 h-20 object-contain mx-auto mb-3 select-none" style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,.15))" }} loading="lazy" decoding="async" width={80} height={80} />
                  <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum paciente encontrado</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filtered.map(patient => (
                    <div key={patient.user_id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{patient.name}</p>
                        {patient.phone && <p className="text-xs text-muted-foreground">{patient.phone}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{patient.totalAppts} consulta{patient.totalAppts > 1 ? "s" : ""}</span>
                        </div>
                        {patient.lastVisit && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            Última: {formatDistanceToNow(new Date(patient.lastVisit), { addSuffix: true, locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default ClinicPatients;
