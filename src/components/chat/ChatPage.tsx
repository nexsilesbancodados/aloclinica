import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Paperclip, ArrowLeft, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getDoctorNav } from "@/components/doctor/doctorNav";
import { getPatientNav } from "@/components/patient/patientNav";
import { motion, AnimatePresence } from "framer-motion";
import mascotWave from "@/assets/mascot-wave.png";
import AppointmentChat from "./AppointmentChat";

interface ChatConversation {
  appointmentId: string;
  otherName: string;
  scheduledAt: string;
  status: string;
  lastMessage?: string;
  unreadCount: number;
}

const QUICK_REPLIES = [
  "Sim, agendar agora",
  "Falar com atendente",
  "Ver meus exames",
];

const ChatPage = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const userId = user?.id;

  const isDoctor = roles.includes("doctor");
  const forceRole = searchParams.get("role");
  const activeRole = forceRole || (isDoctor ? "doctor" : "patient");
  const nav = activeRole === "doctor" ? getDoctorNav("chat") : getPatientNav("chat");
  const backHref = activeRole === "doctor" ? "/dashboard?role=doctor" : "/dashboard?role=patient";

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    let query = db.from("appointments").select("id, scheduled_at, status, patient_id, doctor_id")
      .in("status", ["scheduled", "confirmed", "waiting", "in_progress", "completed"])
      .order("scheduled_at", { ascending: false })
      .limit(50);

    if (isDoctor) {
      const { data: doc } = await db.from("doctor_profiles").select("id").eq("user_id", userId).single();
      if (doc) query = query.eq("doctor_id", doc.id);
      else { setLoading(false); return; }
    } else {
      query = query.eq("patient_id", userId);
    }

    const { data: appts } = await query;
    if (!appts || appts.length === 0) { setLoading(false); return; }

    const otherIds = isDoctor
      ? [...new Set(appts.map(a => a.patient_id).filter(Boolean))]
      : [...new Set(appts.map(a => a.doctor_id))];

    const nameMap = new Map<string, string>();

    if (isDoctor) {
      const { data: profiles } = await db.from("profiles").select("user_id, first_name, last_name").in("user_id", otherIds.filter((id): id is string => id !== null));
      profiles?.forEach(p => nameMap.set(p.user_id, `${p.first_name} ${p.last_name}`));
    } else {
      const { data: docs } = await db.from("doctor_profiles").select("id, user_id").in("id", otherIds.filter((id): id is string => id !== null));
      const docUserIds = docs?.map(d => d.user_id) ?? [];
      const { data: profiles } = docUserIds.length > 0
        ? await db.from("profiles").select("user_id, first_name, last_name").in("user_id", docUserIds)
        : { data: [] };
      const pMap = new Map<string, string>();
      profiles?.forEach(p => pMap.set(p.user_id, `Dr(a). ${p.first_name} ${p.last_name}`));
      docs?.forEach(d => nameMap.set(d.id, pMap.get(d.user_id) ?? "Médico"));
    }

    const apptIds = appts.map(a => a.id);
    const { data: unreadMsgs } = await db
      .from("messages")
      .select("appointment_id")
      .in("appointment_id", apptIds)
      .eq("is_read", false)
      .neq("sender_id", userId);

    const unreadMap = new Map<string, number>();
    (unreadMsgs ?? []).forEach((m: { appointment_id: string }) => {
      unreadMap.set(m.appointment_id, (unreadMap.get(m.appointment_id) ?? 0) + 1);
    });

    const convos: ChatConversation[] = appts.map(a => ({
      appointmentId: a.id,
      otherName: isDoctor
        ? (nameMap.get(a.patient_id ?? "") ?? "Paciente")
        : (nameMap.get(a.doctor_id) ?? "Médico"),
      scheduledAt: a.scheduled_at,
      status: a.status,
      unreadCount: unreadMap.get(a.id) ?? 0,
    }));

    setConversations(convos);
    setLoading(false);
  }, [isDoctor, userId]);

  useEffect(() => { void fetchConversations(); }, [fetchConversations]);

  const statusLabel: Record<string, string> = {
    scheduled: "Agendada", confirmed: "Confirmada", waiting: "Aguardando", in_progress: "Em andamento", completed: "Concluída",
  };

  // Mobile: show chat if selected, list if not
  const showChat = !!selected;

  return (
    <DashboardLayout title={activeRole === "doctor" ? "Médico" : "Paciente"} nav={nav} role={activeRole}>
      <div className="w-full mx-auto max-w-4xl pb-24 md:pb-6">

        {/* Desktop: side-by-side | Mobile: toggle */}
        <div className="hidden md:grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-200px)]">
          {/* Conversation list — desktop */}
          <div className="flex flex-col">
            <h2 className="font-[Manrope] text-lg font-bold text-foreground mb-3">Mensagens</h2>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {renderConversationList()}
            </div>
          </div>
          {/* Chat area — desktop */}
          <div className="flex flex-col rounded-2xl border border-border overflow-hidden bg-card">
            {selected ? (
              <AppointmentChat appointmentId={selected.appointmentId} otherUserName={selected.otherName} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile view */}
        <div className="md:hidden">
          {!showChat ? (
            <div>
              {/* Header with Pingo avatar */}
              <div className="flex items-center gap-3 mb-6">
                <img src={mascotWave} alt="Pingo" className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <h1 className="font-[Manrope] text-xl font-bold text-foreground">AloClínica</h1>
                  <p className="text-xs text-muted-foreground">Suas conversas</p>
                </div>
              </div>

              {/* Quick replies */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-hide">
                {QUICK_REPLIES.map(text => (
                  <button
                    key={text}
                    className="shrink-0 px-4 py-2 rounded-full border border-primary text-primary text-[13px] font-semibold whitespace-nowrap"
                  >
                    {text}
                  </button>
                ))}
              </div>

              {/* Conversation list */}
              <div className="space-y-2">
                {renderConversationList()}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-[calc(100vh-180px)]">
              {/* Chat header */}
              <div className="flex items-center gap-3 pb-3 border-b border-border mb-3">
                <button onClick={() => setSelected(null)} className="text-muted-foreground">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <img src={mascotWave} alt="Pingo" className="w-8 h-8 rounded-full object-cover" />
                <div>
                  <p className="text-sm font-bold text-foreground">{selected.otherName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {statusLabel[selected.status] ?? selected.status}
                  </p>
                </div>
              </div>
              {/* Chat content */}
              <div className="flex-1 overflow-hidden">
                <AppointmentChat appointmentId={selected.appointmentId} otherUserName={selected.otherName} />
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );

  function renderConversationList() {
    if (loading) {
      return (
        <>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3 p-4 rounded-2xl">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </>
      );
    }

    if (conversations.length === 0) {
      return (
        <div className="text-center py-12">
          <img src={mascotWave} alt="Pingo" className="w-20 h-20 mx-auto mb-3 opacity-60" />
          <p className="text-sm font-semibold text-foreground">Nenhuma conversa</p>
          <p className="text-xs text-muted-foreground mt-1">
            Suas conversas com médicos aparecerão aqui após agendar uma consulta.
          </p>
        </div>
      );
    }

    return conversations.map((c, i) => (
      <motion.button
        key={c.appointmentId}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.03 }}
        onClick={() => setSelected(c)}
        className={`w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98] ${
          selected?.appointmentId === c.appointmentId
            ? "bg-primary/5 ring-2 ring-primary"
            : "bg-card hover:bg-muted/30"
        }`}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {c.otherName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground truncate">{c.otherName}</p>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {format(new Date(c.scheduledAt), "dd/MM", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-xs text-muted-foreground truncate">
              {statusLabel[c.status] ?? c.status}
            </p>
            {c.unreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                {c.unreadCount}
              </span>
            )}
          </div>
        </div>
      </motion.button>
    ));
  }
};

export default ChatPage;
