import { useState, useEffect, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User, Star, GraduationCap, Stethoscope, Shield, FileText, Clock,
  Award, Calendar, BadgeCheck
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";

interface DoctorInfoPanelProps {
  doctorId: string;
  appointmentId: string;
}

interface DoctorData {
  crm: string;
  crm_state: string;
  bio: string | null;
  education: string | null;
  experience_years: number | null;
  rating: number | null;
  total_reviews: number | null;
  consultation_price: number | null;
  first_name: string;
  last_name: string;
  specialties: string[];
}

interface PrescriptionInfo {
  id: string;
  diagnosis: string | null;
  medications: Array<{ name: string; dosage?: string; frequency?: string }>;
  created_at: string;
}

const DoctorInfoPanel = ({ doctorId, appointmentId }: DoctorInfoPanelProps) => {
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [docRes, specRes] = await Promise.all([
      db.from("doctor_profiles")
        .select("crm, crm_state, bio, education, experience_years, rating, total_reviews, consultation_price, user_id")
        .eq("id", doctorId)
        .single(),
      db.from("doctor_specialties")
        .select("specialties(name)")
        .eq("doctor_id", doctorId),
    ]);

    if (docRes.data) {
      const { data: profile } = await db
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", docRes.data.user_id)
        .single();

      const specialties = (specRes.data ?? []).map((s: { specialties?: { name?: string } | null }) => s.specialties?.name).filter(Boolean) as string[];

      setDoctor({
        ...docRes.data,
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        specialties,
      });
    }

    const { data: prescData } = await db
      .from("prescriptions")
      .select("id, diagnosis, medications, created_at")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (prescData) setPrescriptions(prescData as unknown as PrescriptionInfo[]);
    setLoading(false);
  }, [doctorId, appointmentId]);

  useEffect(() => {
    if (!doctorId) return;
    void fetchData();
  }, [doctorId, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-[hsl(220,15%,40%)]">Carregando perfil...</p>
        </div>
      </div>
    );
  }

  if (!doctor) return null;

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${i < Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-[hsl(220,15%,20%)]"}`}
      />
    ));
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-3">
        {/* Doctor header card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-br from-[hsl(220,20%,10%)] to-[hsl(220,20%,8%)] border border-[hsl(220,15%,15%)] shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[hsl(150,60%,40%)] flex items-center justify-center border-2 border-[hsl(220,20%,8%)]">
                <BadgeCheck className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">
                Dr(a). {doctor.first_name} {doctor.last_name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[hsl(220,20%,12%)] text-[hsl(220,15%,55%)] border border-[hsl(220,15%,18%)] font-mono">
                  CRM {doctor.crm}/{doctor.crm_state}
                </span>
              </div>
            </div>
          </div>

          {/* Rating */}
          {doctor.rating && doctor.rating > 0 && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[hsl(220,15%,13%)]">
              <div className="flex items-center gap-0.5">
                {renderStars(doctor.rating)}
              </div>
              <span className="text-sm font-bold text-amber-400">{doctor.rating.toFixed(1)}</span>
              <span className="text-[10px] text-[hsl(220,15%,40%)]">({doctor.total_reviews} avaliações)</span>
            </div>
          )}

          {/* Specialties */}
          {doctor.specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[hsl(220,15%,13%)]">
              {doctor.specialties.map(s => (
                <span key={s} className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/8 text-primary border border-primary/15 flex items-center gap-1.5 font-medium">
                  <Stethoscope className="w-2.5 h-2.5" />{s}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        {/* About */}
        {(doctor.bio || doctor.education || doctor.experience_years) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-[hsl(220,15%,12%)] bg-[hsl(220,20%,7%)] p-4 space-y-3"
          >
            <p className="text-xs font-semibold text-[hsl(220,15%,65%)] flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[hsl(220,20%,12%)] flex items-center justify-center">
                <GraduationCap className="w-3.5 h-3.5 text-[hsl(220,15%,50%)]" />
              </div>
              Sobre o profissional
            </p>
            {doctor.bio && (
              <p className="text-xs text-[hsl(220,15%,60%)] leading-relaxed">{doctor.bio}</p>
            )}
            {doctor.education && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[hsl(220,20%,9%)] border border-[hsl(220,15%,13%)]">
                <Award className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-[hsl(220,15%,55%)]">{doctor.education}</p>
              </div>
            )}
            {doctor.experience_years && doctor.experience_years > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[hsl(220,20%,9%)] border border-[hsl(220,15%,13%)]">
                <Calendar className="w-3.5 h-3.5 text-[hsl(220,15%,50%)]" />
                <p className="text-[11px] text-[hsl(220,15%,55%)]">
                  <span className="font-bold text-white">{doctor.experience_years}</span> anos de experiência
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Security badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-[hsl(150,40%,15%)] bg-[hsl(150,40%,6%)] p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(150,60%,40%,0.1)] flex items-center justify-center shrink-0 border border-[hsl(150,60%,40%,0.15)]">
              <Shield className="w-5 h-5 text-[hsl(150,60%,45%)]" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[hsl(150,60%,55%)]">Consulta protegida</p>
              <p className="text-[10px] text-[hsl(150,40%,35%)] mt-0.5">Criptografia E2E · LGPD · CFM 2.314/2022</p>
            </div>
          </div>
        </motion.div>

        {/* Prescriptions from this consultation */}
        {prescriptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-[hsl(220,15%,12%)] bg-[hsl(220,20%,7%)] p-4 space-y-3"
          >
            <p className="text-xs font-semibold text-[hsl(220,15%,65%)] flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[hsl(220,20%,12%)] flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-[hsl(220,15%,50%)]" />
              </div>
              Receitas desta consulta
            </p>
            {prescriptions.map(p => (
              <div key={p.id} className="p-3 rounded-xl bg-[hsl(220,20%,9%)] border border-[hsl(220,15%,13%)] hover:border-[hsl(220,15%,18%)] transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[hsl(220,15%,50%)]">
                    {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  <span className="text-[10px] text-[hsl(220,15%,40%)]">
                    {Array.isArray(p.medications) ? `${p.medications.length} med.` : ""}
                  </span>
                </div>
                {p.diagnosis && <p className="text-xs text-white font-medium mt-1">{p.diagnosis}</p>}
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </ScrollArea>
  );
};

export default DoctorInfoPanel;
