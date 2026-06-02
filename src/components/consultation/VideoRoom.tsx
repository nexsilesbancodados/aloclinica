import { useState, useEffect, useRef, useCallback } from "react";
import type { AppointmentRow } from "@/types/domain";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { notifyConsultationStarted, notifyConsultationCompleted } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logError } from "@/lib/logger";
import { captureBreadcrumb, trackEvent } from "@/lib/sentry";
import {
  MessageSquare, FileText, Clock, Send, X, PanelLeftClose, PanelLeft,
   UserRound, Pill, PhoneOff, Mic, MicOff, Video, VideoOff, Shield, UserPlus,
  MoreVertical, Maximize2, Minimize2, Copy, Share2, FileBadge, Paperclip, Image,
  Sparkles, Loader2, Stethoscope, ClipboardList, SwitchCamera, CheckCircle2,
  PictureInPicture2, Camera, Disc, Download
} from "lucide-react";
import ConsentTCLE from "./ConsentTCLE";
import AIClinicalPanel from "./AIClinicalPanel";
import { TemplateControls, type TemplateType } from "./DoctorTemplates";
import VideoConsultation, { type VideoConsultationHandle } from "./VideoConsultation";
import JitsiRoom from "./JitsiRoom";
import { gerarRoomId } from "@/lib/jitsi";
import VideoErrorBoundary from "./VideoErrorBoundary";
import PreCallCheck from "./PreCallCheck";
import WaitingRoom from "./WaitingRoom";
import ConnectionStatus from "./ConnectionStatus";
import MedicalAutocomplete from "./MedicalAutocomplete";
import SpeechToText from "./SpeechToText";
import PostConsultationSummary from "./PostConsultationSummary";
import PatientInfoPanel from "./PatientInfoPanel";
import DoctorInfoPanel from "./DoctorInfoPanel";
import { ConsultationChatPanel } from "./ConsultationChatPanel";
 import { ReferralSystem } from "@/components/doctor/ReferralSystem";
import { useSOAPNotes, type SOAPNotes } from "@/hooks/useSOAPNotes";
 import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatMessage {
  id: string;
  sender: "patient" | "doctor";
  text: string;
  time: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: "image" | "document";
}

const VideoRoom = () => {
  const { appointmentId } = useParams();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  
  const isMobile = useIsMobile();

  const [appointment, setAppointment] = useState<AppointmentRow | null>(null);
  const [otherPartyName, setOtherPartyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasConsent, setHasConsent] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(true);
  const [crmBlocked, setCrmBlocked] = useState(false);
  const [deviceChecked, setDeviceChecked] = useState(true);
  const [paymentBlocked, setPaymentBlocked] = useState(false);
  const [participationBlocked, setParticipationBlocked] = useState<{ reason: string; hint?: string } | null>(null);
  const [waitingRoomPassed, setWaitingRoomPassed] = useState(false);
  const [showConsentSheet, setShowConsentSheet] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [useJitsi, setUseJitsi] = useState(false);
  const [jitsiRoomId, setJitsiRoomId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
   const [activePanel, setActivePanel] = useState<"chat" | "notes" | "info" | "referral" | "ai" | null>(null);
   // Ferramenta aberta SOBRE a chamada (médico não sai do vídeo): {url, título}
   const [toolOverlay, setToolOverlay] = useState<{ url: string; title: string } | null>(null);
  const presenceLogId = useRef<string | null>(null);
  const videoRef = useRef<VideoConsultationHandle>(null);
  const [webrtcStatus, setWebrtcStatus] = useState<string>("idle");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isDoctor = roles.includes("doctor") || roles.includes("admin");

  // Centralizar SOAP notes com hook
  const soap = useSOAPNotes(appointmentId || "", isDoctor);
  const [activeSOAP, setActiveSOAP] = useState<"S" | "O" | "A" | "P">("S");
  const [aiFillingSOAP, setAiFillingSOAP] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Robustez: estado de rede e auto-fallback WebRTC → Jitsi
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const reconnectStartRef = useRef<number | null>(null);
  const autoFallbackDoneRef = useRef(false);

  /** Switch atomically to Jitsi (usado pela UI manual e pelo fallback automático). */
  const switchToJitsi = useCallback(async (reason: "manual" | "auto") => {
    const rid = gerarRoomId(appointmentId ?? "");
    setUseJitsi(true);
    setJitsiRoomId(rid);
    localStorage.setItem(`jitsi_${appointmentId}`, "true");
    try {
      await db.from("appointments").update({ jitsi_room_id: rid } as any).eq("id", appointmentId ?? "");
    } catch (err) {
      logError("switchToJitsi: falha ao persistir room_id", err);
    }
    if (reason === "auto") {
      toast.warning("Conexão P2P instável", {
        description: "Trocamos para o servidor de vídeo (Jitsi) automaticamente para manter sua consulta.",
        duration: 6000,
      });
    }
  }, [appointmentId]);

  // Sync panel state helpers
   const openPanel = (panel: "chat" | "notes" | "info" | "referral" | "ai") => {
    setActivePanel(prev => prev === panel ? null : panel);
    setShowChat(panel === "chat" ? !showChat : false);
    setShowNotes(panel === "notes" ? !showNotes : false);
     setShowInfo(panel === "info" ? !showInfo : false);
     setShowAI(panel === "ai" ? !showAI : false);
     if (panel === "referral") {
       // Reset others if we had separate booleans, but here we use activePanel mostly
     }
  };

  const closeAllPanels = () => {
    setActivePanel(null);
    setShowChat(false);
    setShowNotes(false);
    setShowInfo(false);
    setShowAI(false);
  };

  // Atalhos de teclado durante a chamada (médico). Ignora quando foco está em input/textarea.
  useEffect(() => {
    if (!isDoctor) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      switch (k) {
        case "m": e.preventDefault(); videoRef.current?.toggleMute(); break;
        case "v": e.preventDefault(); videoRef.current?.toggleVideo(); break;
        case "c": e.preventDefault(); openPanel("chat"); break;
        case "n": e.preventDefault(); if (isDoctor) openPanel("notes"); break;
        case "i": e.preventDefault(); if (isDoctor) openPanel("ai"); break;
        case "s": e.preventDefault(); setSplitMode((v) => !v); break;
        case "p": e.preventDefault(); videoRef.current?.requestPiP?.(); break;
        case "?": e.preventDefault(); setShowShortcuts((v) => !v); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDoctor]);

  const [showShortcuts, setShowShortcuts] = useState(false);

  /** Recebe texto da IA e injeta no prontuário SOAP (append não destrutivo). */
  const handleAISendToNotes = (text: string, field?: "subjective" | "objective" | "assessment" | "plan") => {
    const f = field ?? "plan";
    const current = (soap.notes as any)?.[f] ?? "";
    soap.updateSection(f, current ? `${current}\n${text}` : text);
  };

  // Snapshot clínico do vídeo do paciente → baixa o quadro capturado
  const handleSnapshot = () => {
    const url = videoRef.current?.captureSnapshot?.();
    if (!url) { toast.info("Sem vídeo do paciente para capturar agora."); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = `captura-consulta-${appointmentId}-${Date.now()}.jpg`;
    a.click();
    toast.success("Captura salva", { description: "Anexe no painel IA → “Resumir exames” se quiser análise." });
  };

  // Picture-in-Picture do vídeo do paciente
  const handlePiP = async () => {
    if (!videoRef.current?.requestPiP) { toast.info("Disponível no modo de vídeo P2P."); return; }
    await videoRef.current.requestPiP();
  };

  // Gravação da consulta (requer consentimento expresso — CFM 2.314/2022 / TCLE)
  const handleToggleRecording = () => {
    const v = videoRef.current;
    if (!v) { toast.info("Gravação disponível no modo de vídeo P2P."); return; }
    if (v.isRecording) {
      v.stopRecording();
      toast.success("Gravação finalizada", { description: "Clique em “Baixar gravação” para salvar o arquivo." });
      return;
    }
    const ok = window.confirm(
      "Gravar a teleconsulta exige consentimento expresso de ambas as partes (CFM 2.314/2022 e TCLE). " +
      "Confirme que o paciente consentiu com a gravação antes de prosseguir."
    );
    if (!ok) return;
    v.startRecording();
    toast.success("Gravando a consulta…", { description: "O arquivo é gerado localmente; baixe ao final." });
  };

  const handleDownloadRecording = () => {
    videoRef.current?.downloadRecording?.(`consulta-${appointmentId}-${Date.now()}.webm`);
  };

  // ─── Check CRM verified (doctors only) ───
  useEffect(() => {
    if (!user || !isDoctor) return;
    const checkCrm = async () => {
      const { data } = await db
        .from("doctor_profiles")
        .select("crm_verified")
        .eq("user_id", user.id)
        .single();
      if (data && !data.crm_verified) setCrmBlocked(true);
    };
    checkCrm();
  }, [user, isDoctor]);

  // ─── Check existing TCLE consent (patients only) ───
  useEffect(() => {
    if (!appointmentId || !user) return;
    if (isDoctor) {
      setHasConsent(true);
      setCheckingConsent(false);
      return;
    }
    // Failsafe: nunca deixa consent check travar UI por mais de 8s
    const failsafeTimer = setTimeout(() => setCheckingConsent(false), 8000);
    const checkConsent = async () => {
      try {
        const { data } = await db
          .from("patient_consents")
          .select("id")
          .eq("appointment_id", appointmentId ?? '')
          .eq("patient_id", user.id)
          .is("revoked_at", null)
          .limit(1);
        setHasConsent((data?.length ?? 0) > 0);
      } catch {
        // Falha silenciosa: assume sem consent (UI vai pedir TCLE)
        setHasConsent(false);
      } finally {
        clearTimeout(failsafeTimer);
        setCheckingConsent(false);
      }
    };
    checkConsent();
    return () => clearTimeout(failsafeTimer);
  }, [appointmentId, user, isDoctor]);

  useEffect(() => {
    if (appointmentId) fetchAppointment();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appointmentId]);

  // ─── Queue position check (patients only) — realtime + polling fallback ───
  useEffect(() => {
    if (!appointment || isDoctor) return;
    let pollActive = true;
    let pollInterval = 8000;
    let pollTimeout: ReturnType<typeof setTimeout>;

    const checkQueue = async () => {
      const { data: activeAppts } = await db
        .from("appointments")
        .select("id, scheduled_at")
        .eq("doctor_id", appointment.doctor_id)
        .eq("status", "in_progress")
        .neq("id", appointmentId ?? '');

      if (activeAppts && activeAppts.length > 0) {
        setDoctorBusy(true);
        const { data: waitingAhead } = await db
          .from("appointments")
          .select("id")
          .eq("doctor_id", appointment.doctor_id)
          .in("status", ["waiting", "in_progress"])
          .neq("id", appointmentId ?? '')
          .lt("scheduled_at", appointment.scheduled_at);
        setQueuePosition((waitingAhead?.length ?? 0) + 1);
      } else {
        setDoctorBusy(false);
        setQueuePosition(null);
      }
    };
    checkQueue();

    // Primary: realtime
    const queueChannel = db
      .channel(`queue-${appointment.doctor_id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments", filter: `doctor_id=eq.${appointment.doctor_id}` }, () => {
        checkQueue();
        pollInterval = 8000; // reset backoff on realtime event
      })
      .subscribe();

    // Fallback: polling with exponential backoff
    const poll = async () => {
      await checkQueue();
      pollInterval = Math.min(pollInterval * 1.3, 30000);
      if (pollActive) pollTimeout = setTimeout(poll, pollInterval);
    };
    pollTimeout = setTimeout(poll, pollInterval);

    return () => {
      pollActive = false;
      clearTimeout(pollTimeout);
      db.removeChannel(queueChannel);
    };
  }, [appointment, isDoctor]);

  // ─── Timer ───
  useEffect(() => {
    if (!deviceChecked) return;
    timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [deviceChecked]);

  // ─── Online/offline awareness ───
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      toast.success("Conexão restaurada", { description: "Reconectando à consulta..." });
    };
    const goOffline = () => {
      setIsOnline(false);
      toast.error("Sem conexão", { description: "Verifique sua internet. A consulta tentará reconectar quando voltar." });
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ─── Auto-fallback WebRTC → Jitsi ───
  // Critério: status "failed" (imediato) ou "reconnecting" persistente por > 15s.
  // Roda apenas uma vez por sessão para evitar oscilação. Quando volta a "connected",
  // reseta o timer (mas não desfaz o switch — para evitar flapping).
  useEffect(() => {
    if (useJitsi || autoFallbackDoneRef.current || !appointmentId) return;

    if (webrtcStatus === "failed") {
      autoFallbackDoneRef.current = true;
      switchToJitsi("auto");
      return;
    }

    if (webrtcStatus === "reconnecting") {
      if (reconnectStartRef.current === null) {
        reconnectStartRef.current = Date.now();
      }
      const elapsed = Date.now() - reconnectStartRef.current;
      if (elapsed > 15_000) {
        autoFallbackDoneRef.current = true;
        switchToJitsi("auto");
        return;
      }
      const remaining = 15_000 - elapsed;
      const t = setTimeout(() => {
        if (!autoFallbackDoneRef.current && webrtcStatus === "reconnecting") {
          autoFallbackDoneRef.current = true;
          switchToJitsi("auto");
        }
      }, remaining + 100);
      return () => clearTimeout(t);
    }

    // Estado saudável: zera o cronômetro de reconexão
    if (webrtcStatus === "connected") {
      reconnectStartRef.current = null;
    }
    return undefined;
  }, [webrtcStatus, useJitsi, appointmentId, switchToJitsi]);

  // ─── Load persisted chat messages on mount ───
  useEffect(() => {
    if (!appointmentId) return;
    const loadMessages = async () => {
      const { data } = await db
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        const loaded: ChatMessage[] = data.map(m => ({
          id: m.id,
          sender: m.sender_id === user?.id ? (isDoctor ? "doctor" : "patient") : (isDoctor ? "patient" : "doctor"),
          text: m.content,
          time: format(new Date(m.created_at), "HH:mm"),
        }));
        setMessages(loaded);
      }
    };
    loadMessages();
  }, [appointmentId, user, isDoctor]);

  // ─── Realtime chat (postgres_changes + broadcast fallback) ───
  const lastMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!appointmentId || !user) return;

    // Primary: postgres_changes for persisted messages
    const roomChannel = db.channel(`video-room-${appointmentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `appointment_id=eq.${appointmentId}` },
        (payload) => {
          const newMsg = payload.new as { id: string; sender_id: string; content: string; created_at: string; is_read: boolean };
          if (newMsg.sender_id === user.id) return; // skip own messages
          if (lastMsgIdRef.current === newMsg.id) return; // deduplicate
          lastMsgIdRef.current = newMsg.id;
          const msg: ChatMessage = {
            id: newMsg.id,
            sender: isDoctor ? "patient" : "doctor",
            text: newMsg.content,
            time: format(new Date(newMsg.created_at), "HH:mm"),
          };
          setMessages(prev => [...prev, msg]);
          if (!showChat) setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    channelRef.current = roomChannel;

    // Fallback polling: every 5s check for new messages
    let pollActive = true;
    let pollInterval = 5000;
    let lastPollTime = new Date().toISOString();
    let pollTimeout: ReturnType<typeof setTimeout>;

    const pollChat = async () => {
      const { data } = await db
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("appointment_id", appointmentId)
        .gt("created_at", lastPollTime)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        lastPollTime = data[data.length - 1].created_at;
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = data
            .filter(m => !existingIds.has(m.id))
            .map(m => ({
              id: m.id,
              sender: (isDoctor ? "patient" : "doctor") as "patient" | "doctor",
              text: m.content,
              time: format(new Date(m.created_at), "HH:mm"),
            }));
          if (newMsgs.length > 0 && !showChat) setUnreadCount(c => c + newMsgs.length);
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
        pollInterval = 5000; // reset on activity
      } else {
        pollInterval = Math.min(pollInterval * 1.3, 15000); // back off
      }
      if (pollActive) pollTimeout = setTimeout(pollChat, pollInterval);
    };
    pollTimeout = setTimeout(pollChat, pollInterval);

    return () => {
      pollActive = false;
      clearTimeout(pollTimeout);
      db.removeChannel(roomChannel);
    };
  }, [appointmentId, user, isDoctor]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  // Fullscreen
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const fetchAppointment = async () => {
    const { data } = await db
      .from("appointments").select("*").eq("id", appointmentId ?? '').single();

    if (!data) { setLoading(false); return; }

    // Block entry for cancelled/no_show appointments
    if (["cancelled", "no_show"].includes(data.status)) {
      toast.error("Consulta indisponível", { description: "Esta consulta foi cancelada ou marcada como não comparecimento." });
      navigate("/dashboard");
      return;
    }

    // Verify correct participant — show in waiting room instead of redirect
    let blockedParticipation = false;
    if (isDoctor) {
      const { data: dp } = await db.from("doctor_profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (dp && dp.id !== data.doctor_id) {
        setParticipationBlocked({
          reason: "Esta consulta não está atribuída a você.",
          hint: "Confira se você abriu o link correto da sua agenda.",
        });
        blockedParticipation = true;
      }
    } else if (user && data.patient_id && data.patient_id !== user.id) {
      setParticipationBlocked({
        reason: "Esta consulta pertence a outro paciente.",
        hint: "Verifique se você está logado na conta correta.",
      });
      blockedParticipation = true;
    }

    // Payment check — show in waiting room instead of redirect
    if (!isDoctor && data.payment_status === "pending" && data.status === "scheduled") {
      setPaymentBlocked(true);
    }

    setAppointment(data);

    // If blocked, do not start the consultation or notify peers
    const blockedPayment = !isDoctor && data.payment_status === "pending" && data.status === "scheduled";
    if (blockedParticipation || blockedPayment) {
      setLoading(false);
      return;
    }

    if (isDoctor) {
      // Check if doctor previously opted into Jitsi for this appointment
      const savedJitsi = localStorage.getItem(`jitsi_${appointmentId}`);
      if (savedJitsi === 'true') {
        setUseJitsi(true);
        const newRoomId = gerarRoomId(appointmentId ?? '');
        setJitsiRoomId(newRoomId);
      }
      await db.from("appointments").update({ status: "in_progress" } as any).eq("id", appointmentId ?? '');
      const docName = user?.user_metadata?.first_name ? `Dr(a). ${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim() : "Seu médico";
      notifyConsultationStarted(appointmentId ?? '', docName).catch(err => logError("notifyConsultationStarted failed", err));
    } else {
      // Patient: check if doctor enabled Jitsi for this consultation
      const existingRoomId = (data as any).jitsi_room_id;
      if (existingRoomId) {
        setUseJitsi(true);
        setJitsiRoomId(existingRoomId);
      }
    }

    const otherUserId = isDoctor ? data.patient_id : null;
    const otherDoctorId = !isDoctor ? data.doctor_id : null;

    if (otherUserId) {
      const { data: profile } = await db
        .from("profiles").select("first_name, last_name").eq("user_id", otherUserId).single();
      if (profile) setOtherPartyName(`${profile.first_name} ${profile.last_name}`);
    } else if (otherDoctorId) {
      const { data: doc } = await db
        .from("doctor_profiles").select("user_id").eq("id", otherDoctorId).single();
      if (doc) {
        const { data: profile } = await db
          .from("profiles").select("first_name, last_name").eq("user_id", doc.user_id).single();
        if (profile) setOtherPartyName(`Dr(a). ${profile.first_name} ${profile.last_name}`);
      }
    }

    if (isDoctor) {
      const { data: noteData } = await db
        .from("consultation_notes").select("content").eq("appointment_id", appointmentId ?? '').maybeSingle();
      if (noteData) {
        // Try to parse SOAP JSON, fallback to plain text
        try {
          const parsed = JSON.parse(noteData.content);
          if (parsed.subjective !== undefined) {
            Object.entries(parsed).forEach(([k, v]) => {
              if (["subjective","objective","assessment","plan"].includes(k)) soap.updateSection(k as keyof import("@/hooks/useSOAPNotes").SOAPNotes, v as string);
            });
          } else {
            soap.updateSection("subjective", noteData.content);
          }
        } catch {
          soap.updateSection("subjective", noteData.content);
        }
      }
    }

    setLoading(false);
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const sendMessage = async (fileUrl?: string, fileName?: string, fileType?: "image" | "document") => {
    if (!chatInput.trim() && !fileUrl) return;
    const content = chatInput.trim() || (fileName ? `[Arquivo: ${fileName}]` : "");
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: isDoctor ? "doctor" : "patient",
      text: chatInput.trim(),
      time: format(new Date(), "HH:mm"),
      fileUrl,
      fileName,
      fileType,
    };
    setMessages((prev) => [...prev, msg]);
    setChatInput("");

    // Persist to DB
    if (appointmentId && user) {
      const { data: inserted } = await db.from("messages").insert({
        appointment_id: appointmentId,
        sender_id: user.id,
        content: fileUrl ? `${content}\n${fileUrl}` : content,
      }).select("id").single();
      // Update local ID with DB id for deduplication
      if (inserted) {
        msg.id = inserted.id;
        lastMsgIdRef.current = inserted.id;
      }
    }
  };

  // File upload for chat component
  const handleFileUploadForChat = async (file: File): Promise<string> => {
    if (!user) throw new Error("User not authenticated");
    const ext = file.name.split('.').pop();
    const filePath = `consultation-chat/${appointmentId}/${Date.now()}.${ext}`;
    const { data, error: uploadErr } = await db.storage
      .from("patient-documents")
      .upload(filePath, file, { contentType: file.type });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = db.storage.from("patient-documents").getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const fileUrl = await handleFileUploadForChat(file);
      await sendMessage(fileUrl, file.name, file.type.startsWith("image") ? "image" : "document");
    } catch (err) {
      logError("File upload error", err);
      toast.error("Erro ao enviar arquivo");
    }
    e.target.value = "";
  };

  // Old saveNotes function — now handled by useSOAPNotes hook
  // Keeping for PDF generation on manual save
  const saveSoapNotesWithPDF = async (silent = false) => {
    if (!appointmentId || !appointment) return;

    // Hook's saveNotes handles the database persistence
    // We just need to generate the PDF here if manual save
    if (!silent) {
      try {
        const { jsPDF } = await import("jspdf");

        // Fetch doctor and patient names
        const { data: doctorProfileData } = await db
          .from("profiles").select("first_name, last_name").eq("user_id", user!.id).single();
        const { data: doctorDocProfile } = await db
          .from("doctor_profiles").select("crm, crm_state").eq("user_id", user!.id).single();
        
        const patientId = appointment.patient_id;
        let patientName = "Paciente";
        if (patientId) {
          const { data: patientProfile } = await db
            .from("profiles").select("first_name, last_name, cpf").eq("user_id", patientId).single();
          if (patientProfile) patientName = `${patientProfile.first_name} ${patientProfile.last_name}`.trim();
        }

        const doctorName = doctorProfileData ? `Dr(a). ${doctorProfileData.first_name} ${doctorProfileData.last_name}`.trim() : "Médico";
        const now = new Date();
        const dateStr = format(now, "dd/MM/yyyy 'às' HH:mm");

        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.getWidth();
        let y = 20;

        // Header
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(33, 115, 70);
        pdf.text("Allo Médico", pageWidth / 2, y, { align: "center" });
        y += 8;
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120, 120, 120);
        pdf.text("Prontuário Eletrônico - Teleconsulta", pageWidth / 2, y, { align: "center" });
        y += 6;

        // Divider
        pdf.setDrawColor(33, 115, 70);
        pdf.setLineWidth(0.5);
        pdf.line(20, y, pageWidth - 20, y);
        y += 10;

        // Info block
        pdf.setFontSize(10);
        pdf.setTextColor(60, 60, 60);
        pdf.setFont("helvetica", "bold");
        pdf.text("Médico:", 20, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(`${doctorName}  |  CRM ${doctorDocProfile?.crm ?? ""}/${doctorDocProfile?.crm_state ?? ""}`, 45, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.text("Paciente:", 20, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(patientName, 45, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.text("Data:", 20, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(dateStr, 45, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.text("Consulta:", 20, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(appointmentId!.slice(0, 8).toUpperCase(), 45, y);
        y += 12;

        // SOAP sections
        const soapSections = [
          { title: "S - Subjetivo (Queixa do Paciente)", content: soap.notes.subjective },
          { title: "O - Objetivo (Exame/Observações)", content: soap.notes.objective },
          { title: "A - Avaliação (Diagnóstico)", content: soap.notes.assessment },
          { title: "P - Plano (Conduta)", content: soap.notes.plan },
        ];

        for (const section of soapSections) {
          // Section header
          pdf.setFillColor(240, 247, 243);
          pdf.rect(20, y - 4, pageWidth - 40, 8, "F");
          pdf.setFontSize(11);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(33, 115, 70);
          pdf.text(section.title, 24, y + 1);
          y += 10;

          // Section content
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(40, 40, 40);
          const content = section.content?.trim() || "(Não preenchido)";
          const lines = pdf.splitTextToSize(content, pageWidth - 50);
          
          for (const line of lines) {
            if (y > 270) {
              pdf.addPage();
              y = 20;
            }
            pdf.text(line, 24, y);
            y += 5;
          }
          y += 8;
        }

        // Footer
        if (y > 260) { pdf.addPage(); y = 20; }
        pdf.setDrawColor(200, 200, 200);
        pdf.line(20, y, pageWidth - 20, y);
        y += 6;
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text("Documento gerado eletronicamente pela plataforma Allo Médico.", pageWidth / 2, y, { align: "center" });
        y += 4;
        pdf.text(`Gerado em: ${dateStr}`, pageWidth / 2, y, { align: "center" });

        // Upload to Supabase Storage
        const pdfBlob = pdf.output("blob");
        const fileName = `soap-${appointmentId!.slice(0, 8)}-${Date.now()}.pdf`;
        const filePath = `${user!.id}/${fileName}`;

        const { error: uploadError } = await db.storage
          .from("patient-documents")
          .upload(filePath, pdfBlob, { contentType: "application/pdf", upsert: true });

        if (!uploadError) {
          // Save reference in patient_documents table
          const { data: urlData } = db.storage.from("patient-documents").getPublicUrl(filePath);
          
          await db.from("patient_documents").insert({
            patient_id: patientId || user!.id,
            uploaded_by: user!.id,
            file_name: `Prontuário SOAP - ${dateStr}`,
            file_url: filePath,
            file_type: "application/pdf",
            file_size: pdfBlob.size,
            appointment_id: appointmentId,
            description: `Prontuário SOAP gerado na teleconsulta de ${dateStr}`,
          });
        }

        toast.success("✅ SOAP salvo e PDF gerado!", { description: "Documento salvo no prontuário do paciente." });
      } catch (pdfErr) {
        logError("PDF generation error in VideoRoom", pdfErr);
        toast.success("✅ Anotações salvas!", { description: "Não foi possível gerar o PDF." });
      }
    }
  };

  // Show "Saved" indicator for 3 seconds after SOAP notes are saved
  useEffect(() => {
    if (soap.isSaving) return undefined;
    if (!soap.isDirty && soap.lastSaved) {
      setShowSavedIndicator(true);
      const timer = setTimeout(() => setShowSavedIndicator(false), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [soap.isSaving, soap.isDirty, soap.lastSaved]);

  // Auto-save SOAP notes every 30 seconds
  useEffect(() => {
    if (!isDoctor || !deviceChecked || !soap.isDirty) return;
    const autoSaveInterval = setInterval(() => {
      soap.saveNotes();
    }, 30000);
    return () => clearInterval(autoSaveInterval);
  }, [isDoctor, deviceChecked, soap.isDirty, appointmentId, appointment]);

  // ─── Video presence logging ───
  useEffect(() => {
    if (!appointmentId || !user || !deviceChecked) return;
    const logPresence = async () => {
      const { data } = await db.from("video_presence_logs").insert({
        appointment_id: appointmentId,
        user_id: user.id,
        user_role: isDoctor ? "doctor" : "patient",
      }).select("id").single();
      if (data) presenceLogId.current = data.id;
    };
    logPresence();

    return () => {
      if (presenceLogId.current) {
        db.from("video_presence_logs").update({
          left_at: new Date().toISOString(),
          duration_seconds: elapsed,
        }).eq("id", presenceLogId.current).then(() => {});
      }
    };
  }, [appointmentId, user, deviceChecked]);

  // Cache SOAP notes for endCall cleanup
  const notesRef = useRef(soap.notes);
  useEffect(() => {
    notesRef.current = soap.notes;
  }, [soap.notes]);
  const elapsedRef = useRef(elapsed);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  const endCall = useCallback(async () => {
    videoRef.current?.hangUp();
    if (presenceLogId.current) {
      await db.from("video_presence_logs").update({
        left_at: new Date().toISOString(),
        duration_seconds: elapsedRef.current,
      }).eq("id", presenceLogId.current);
    }
    // Save SOAP notes if doctor has unsaved changes
    if (isDoctor && soap.isDirty) {
      await soap.saveNotes();
    }
    await db.from("appointments").update({ status: "completed" }).eq("id", appointmentId ?? '');

    // Notify patient that consultation is completed
    if (isDoctor) {
      const docName = user?.user_metadata?.first_name ? `Dr(a). ${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim() : "Seu médico";
      notifyConsultationCompleted(appointmentId!, docName).catch(err => logError("notifyConsultationCompleted failed", err));
    }

    toast.success("Consulta encerrada");
    setShowSummary(true);
  }, [isDoctor, appointmentId, soap.isDirty]);

  const handleSummaryContinue = useCallback(() => {
    if (isDoctor) navigate(`/dashboard/prescribe/${appointmentId}`);
    else navigate(`/dashboard/rate/${appointmentId}`);
  }, [isDoctor, appointmentId]);

  const handleReconnect = useCallback(() => {
    setDeviceChecked(false);
    setTimeout(() => setDeviceChecked(true), 500);
  }, []);

  if (loading || checkingConsent) {
    return (
      <div className="min-h-screen bg-[hsl(220,30%,4%)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Preparando sua consulta</p>
            <p className="text-xs text-[hsl(220,15%,45%)] mt-1">Conectando à sala segura...</p>
          </div>
        </div>
      </div>
    );
  }

  // Patient signing TCLE — opened from waiting room
  if (!isDoctor && showConsentSheet && !hasConsent) {
    return (
      <ConsentTCLE
        appointmentId={appointmentId!}
        doctorName={otherPartyName || undefined}
        onConsented={() => { setHasConsent(true); setShowConsentSheet(false); }}
      />
    );
  }

  // ─── Unified Waiting Room (mandatory checks) ───
  if (!waitingRoomPassed) {
    const paymentCheck = paymentBlocked
      ? {
          state: "blocked" as const,
          reason: "O pagamento ainda não foi confirmado.",
          hint: "Conclua o pagamento na página da consulta. A entrada é liberada automaticamente.",
        }
      : { state: "ok" as const };

    const consentCheck = isDoctor || hasConsent
      ? { state: "ok" as const }
      : {
          state: "blocked" as const,
          reason: "Você ainda não assinou o TCLE.",
          hint: "É uma exigência legal para a teleconsulta. Leva menos de 1 minuto.",
        };

    const participationCheck = participationBlocked
      ? { state: "blocked" as const, reason: participationBlocked.reason, hint: participationBlocked.hint }
      : crmBlocked
      ? {
          state: "blocked" as const,
          reason: "Seu CRM ainda não foi verificado pelo administrador.",
          hint: "A liberação ocorre após a aprovação do cadastro profissional.",
        }
      : { state: "ok" as const };

    return (
      <WaitingRoom
        appointmentId={appointmentId}
        isDoctor={isDoctor}
        payment={paymentCheck}
        consent={consentCheck}
        participation={participationCheck}
        onSignConsent={() => setShowConsentSheet(true)}
        onContinue={() => setWaitingRoomPassed(true)}
      />
    );
  }

  if (!deviceChecked) {
    return (
      <PreCallCheck
        appointmentId={appointmentId}
        doctorName={otherPartyName || undefined}
        doctorSpecialty={undefined}
        scheduledAt={appointment?.scheduled_at}
        isDoctor={isDoctor}
        onReady={() => setDeviceChecked(true)}
      />
    );
  }

  if (showSummary) {
    return (
      <PostConsultationSummary
        appointmentId={appointmentId!}
        isDoctor={isDoctor}
        elapsed={elapsed}
        messageCount={messages.length}
        onContinue={handleSummaryContinue}
      />
    );
  }

  const currentUserName = isDoctor
    ? `Dr(a). ${user?.user_metadata?.first_name || "Médico"}`
    : user?.user_metadata?.first_name || "Paciente";

  const showQueueBanner = !isDoctor && doctorBusy && queuePosition !== null;
  const showSidePanel = (showChat || showNotes || showInfo || showAI || activePanel === "referral") && !isMobile;
  const showBottomSheet = (showChat || showNotes || showInfo || showAI || activePanel === "referral") && isMobile;

  // Timer color based on duration
  const timerColor = elapsed > 3600
    ? "text-destructive"
    : elapsed > 1800
    ? "text-amber-400"
    : "text-[hsl(150,60%,55%)]";

  // Chat panel removed - now using ConsultationChatPanel component
  // Handler for sending messages
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !appointmentId) return;

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: isDoctor ? "doctor" : "patient",
      text,
      time: format(new Date(), "HH:mm"),
    };

    setMessages(prev => [...prev, newMessage]);
    setChatInput("");

    // Persist to database using messages table
    try {
      await (db.from("messages") as any).insert({
        appointment_id: appointmentId,
        sender_id: user?.id,
        content: text,
      });

      // Mark as read for this user
      setUnreadCount(0);
    } catch (err) {
      logError("Failed to save chat message", err);
    }
  };

  const soapTabs: { key: "S" | "O" | "A" | "P"; label: string; field: keyof SOAPNotes; placeholder: string }[] = [
    { key: "S", label: "Subjetivo", field: "subjective", placeholder: "O que o paciente relata: queixas, sintomas, histórico..." },
    { key: "O", label: "Objetivo", field: "objective", placeholder: "Dados objetivos: sinais vitais, exames, observações clínicas..." },
    { key: "A", label: "Avaliação", field: "assessment", placeholder: "Diagnóstico / hipótese diagnóstica (CID-10)..." },
    { key: "P", label: "Plano", field: "plan", placeholder: "Plano terapêutico: medicamentos, exames solicitados, retorno..." },
  ];

  const updateSOAPField = (field: keyof typeof soap.notes, value: string) => {
    soap.updateSection(field, value);
  };

  const handleAIFillSOAP = async () => {
    if (!appointmentId || !appointment) return;
    setAiFillingSOAP(true);
    try {
      // Gather pre-consultation symptoms
      const { data: symptoms } = await db
        .from("pre_consultation_symptoms")
        .select("main_complaint, symptoms, severity, duration, additional_notes")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      // Gather chat messages for context
      const chatContext = messages.slice(-10).map(m => `${m.sender}: ${m.text}`).join("\n");

      const ctx = `Queixa principal: ${symptoms?.main_complaint || "Não informada"}
Sintomas: ${(symptoms?.symptoms as string[])?.join(", ") || "Não informados"}
Severidade: ${symptoms?.severity || "Não informada"}
Duração: ${symptoms?.duration || "Não informada"}
Notas adicionais: ${symptoms?.additional_notes || ""}
Chat médico-paciente: ${chatContext || "Sem mensagens"}
SOAP atual: S=${soap.notes.subjective}, O=${soap.notes.objective}, A=${soap.notes.assessment}, P=${soap.notes.plan}`;

      const { data, error } = await db.functions.invoke("clinical-ai", {
        body: { task: "soap", payload: { context: ctx } },
      });
      if (error) throw error;

      const text: string = (data as any)?.result || "";
      if (text) {
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.subjective) soap.updateSection("subjective", parsed.subjective);
            if (parsed.objective) soap.updateSection("objective", parsed.objective);
            if (parsed.assessment) soap.updateSection("assessment", parsed.assessment);
            if (parsed.plan) soap.updateSection("plan", parsed.plan);
            toast.success("🤖 SOAP preenchido pela IA", { description: "Revise e ajuste antes de salvar." });
          } else {
            toast.error("IA respondeu", { description: "Formato inesperado. Tente novamente." });
          }
        } catch {
          toast.error("IA respondeu", { description: "Não foi possível interpretar o formato. Tente novamente." });
        }
      }
    } catch (err) {
      logError("AI SOAP fill error in VideoRoom", err);
      toast.error("Erro ao preencher", { description: "Tente novamente em alguns segundos." });
    } finally {
      setAiFillingSOAP(false);
    }
  };

  const notesPanel = (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[hsl(220,15%,65%)]">Prontuário SOAP</p>
          <p className="text-[10px] mt-0.5 flex items-center gap-1.5">
            {soap.isSaving ? (
              <span className="text-amber-400 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Salvando…
              </span>
            ) : soap.isDirty ? (
              <span className="text-amber-400/90">● Alterações não salvas</span>
            ) : soap.lastSaved ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Salvo {format(new Date(soap.lastSaved), "HH:mm")}
              </span>
            ) : (
              <span className="text-[hsl(220,15%,40%)]">Auto-save a cada 30s</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg gap-1 px-2"
            disabled={aiFillingSOAP}
            onClick={handleAIFillSOAP}
          >
            {aiFillingSOAP ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {aiFillingSOAP ? "Gerando..." : "IA"}
          </Button>
          <SpeechToText onTranscript={(text) => updateSOAPField(soapTabs.find(t => t.key === activeSOAP)!.field as keyof SOAPNotes, soap.notes[soapTabs.find(t => t.key === activeSOAP)!.field as keyof SOAPNotes] + " " + text)} />
        </div>
      </div>

      {/* SOAP Tabs */}
      <div className="flex gap-1 bg-[hsl(220,20%,8%)] rounded-xl p-1 border border-[hsl(220,15%,16%)]">
        {soapTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSOAP(tab.key)}
            className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${
              activeSOAP === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-[hsl(220,15%,50%)] hover:text-[hsl(220,15%,70%)]"
            }`}
          >
            {tab.key}
          </button>
        ))}
      </div>

      {/* Active SOAP field */}
      {soapTabs.filter(t => t.key === activeSOAP).map(tab => {
        const tmplType = `soap_${tab.field}` as TemplateType;
        return (
          <div key={tab.key} className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-[hsl(220,15%,55%)]">{tab.label}</p>
              <TemplateControls
                type={tmplType}
                currentText={soap.notes[tab.field]}
                onInsert={(t) => updateSOAPField(tab.field as keyof SOAPNotes, soap.notes[tab.field] ? `${soap.notes[tab.field]}\n${t}` : t)}
              />
            </div>
            <MedicalAutocomplete
              value={soap.notes[tab.field]}
              onChange={(val) => updateSOAPField(tab.field as keyof SOAPNotes, val)}
              field="notes"
              placeholder={tab.placeholder}
              className="flex-1 bg-[hsl(220,20%,8%)] border-[hsl(220,15%,16%)] text-white placeholder:text-[hsl(220,15%,30%)] resize-none rounded-xl min-h-[120px] focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button onClick={() => soap.saveNotes()} disabled={soap.isSaving} size="sm" className={`flex-1 rounded-xl gap-1.5 transition-all duration-300 ${
          soap.isSaving
            ? "bg-primary/70 text-primary-foreground"
            : showSavedIndicator
            ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
            : "bg-primary hover:bg-primary/90 text-primary-foreground"
        }`}>
          <FileText className="w-3.5 h-3.5" />
          {soap.isSaving ? (
            <span className="flex items-center gap-1.5">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-3.5 h-3.5" />
              </motion.div>
              Salvando...
            </span>
          ) : showSavedIndicator ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              ✓ Salvo
            </span>
          ) : (
            "Salvar SOAP"
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl border-[hsl(220,15%,18%)] text-[hsl(220,15%,60%)] hover:bg-[hsl(220,20%,12%)]"
          onClick={() => window.open(`/dashboard/prescribe/${appointmentId}`, '_blank')}
        >
          <Pill className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

  // Toolbar button component — 44px minimum touch target
  const ToolbarBtn = ({ active, icon, label, badge, onClick }: {
    active?: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void;
  }) => (
    <button
      className={`relative flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-primary/15 text-primary border border-primary/25 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
          : "text-[hsl(220,15%,55%)] hover:text-white hover:bg-[hsl(220,20%,12%)] active:bg-[hsl(220,20%,16%)] border border-transparent"
      }`}
      onClick={onClick}
      aria-label={badge && badge > 0 ? `${label} (${badge} não lida${badge !== 1 ? "s" : ""})` : label}
      aria-pressed={active}
    >
      {icon}
      {!isMobile && <span aria-hidden="true">{label}</span>}
      {badge && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold shadow-lg animate-pulse" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen bg-[hsl(220,30%,4%)] flex flex-col overflow-hidden">
      <ConnectionStatus onReconnect={handleReconnect} usingJitsi={!!jitsiRoomId} />

      {/* Queue banner */}
      <AnimatePresence>
        {showQueueBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/15 flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
            <p className="text-sm text-amber-300">
              {queuePosition === 1
                ? "O médico está finalizando outro atendimento. Você é o próximo!"
                : `Posição na fila: ${queuePosition}º — aguarde, o médico atenderá em breve.`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar — compact on mobile */}
      <div
        className="flex items-center justify-between px-3 md:px-5 py-2 md:py-2.5 bg-[hsl(220,25%,6%)] border-b border-[hsl(220,15%,10%)] shrink-0"
        style={{ paddingTop: isMobile ? "max(env(safe-area-inset-top, 0px), 8px)" : undefined }}
      >
        {/* Left: participant info */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="relative">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <span className="text-xs font-bold text-primary">
                {(otherPartyName || "C").charAt(0)}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[hsl(150,60%,45%)] border-2 border-[hsl(220,25%,6%)]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold text-white truncate max-w-[120px] md:max-w-none">{otherPartyName || "Consulta"}</p>
            {!isMobile && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${
                    webrtcStatus === "connected" ? "bg-[hsl(150,60%,45%)] animate-pulse" :
                    webrtcStatus === "connecting" ? "bg-amber-400 animate-pulse" :
                    webrtcStatus === "failed" ? "bg-destructive" :
                    "bg-[hsl(220,15%,40%)]"
                  }`} />
                  <span className="text-[10px] text-[hsl(220,15%,40%)]">
                    {webrtcStatus === "connected" ? "P2P Ativo" :
                     webrtcStatus === "connecting" ? "Conectando" :
                     webrtcStatus === "waiting_peer" ? "Aguardando" :
                     webrtcStatus === "reconnecting" ? "Reconectando" :
                     webrtcStatus === "failed" ? "Falha" : "WebRTC"}
                  </span>
                </div>
                <span className="text-[10px] text-[hsl(220,15%,20%)]">•</span>
                <span className="text-[10px] text-[hsl(220,15%,40%)]">CFM 2.314/22</span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Timer (always visible) */}
        <div className="flex items-center gap-1.5 px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl bg-[hsl(220,20%,8%)] border border-[hsl(220,15%,12%)]">
          <div className={`w-2 h-2 rounded-full shimmer-v2 ${
            elapsed > 3600 ? "bg-destructive" : elapsed > 1800 ? "bg-amber-400" : "bg-[hsl(150,60%,45%)]"
          }`} />
          <span className={`text-xs font-mono font-bold tracking-wider ${timerColor}`}>
            {formatTime(elapsed)}
          </span>
        </div>

        {/* Right: End call (always visible) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Fullscreen — desktop only */}
          {!isMobile && (
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(220,15%,45%)] hover:text-white hover:bg-[hsl(220,20%,12%)] transition-all"
              aria-label={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" aria-hidden="true" /> : <Maximize2 className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}

          {/* End call */}
          <Button
            onClick={endCall}
            size="sm"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl gap-1.5 shadow-lg shadow-destructive/20 hover:shadow-destructive/30 transition-all hover:scale-105 active:scale-95 h-9 md:h-9 px-3 md:px-4 min-w-[44px]"
            aria-label="Encerrar consulta"
          >
            <PhoneOff className="w-4 h-4" aria-hidden="true" />
            {!isMobile && <span className="text-xs font-semibold">Encerrar</span>}
          </Button>
        </div>
      </div>

      {/* Desktop toolbar — below top bar, above video */}
      {!isMobile && (
        <div className="flex items-center justify-center gap-1.5 px-5 py-2 bg-[hsl(220,25%,6%)] border-b border-[hsl(220,15%,10%)] shrink-0">
          {/* Media controls */}
          <ToolbarBtn
            active={videoRef.current?.isMuted}
            icon={videoRef.current?.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            label={videoRef.current?.isMuted ? "Ativar Mic" : "Mutar"}
            onClick={() => videoRef.current?.toggleMute()}
          />
          <ToolbarBtn
            active={videoRef.current?.isVideoOff}
            icon={videoRef.current?.isVideoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            label={videoRef.current?.isVideoOff ? "Ativar Cam" : "Câmera"}
            onClick={() => videoRef.current?.toggleVideo()}
          />

          <div className="w-px h-6 bg-[hsl(220,15%,15%)] mx-1" />

          <ToolbarBtn
            active={showChat}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Chat"
            badge={showChat ? 0 : unreadCount}
            onClick={() => openPanel("chat")}
          />
          {isDoctor && (
            <>
              <ToolbarBtn
                active={showNotes}
                icon={<FileText className="w-3.5 h-3.5" />}
                label="Prontuário"
                onClick={() => openPanel("notes")}
              />
              <ToolbarBtn
                active={showAI}
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="IA Clínica"
                onClick={() => openPanel("ai")}
              />
              <ToolbarBtn
                active={splitMode}
                icon={splitMode ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
                label="Split"
                onClick={() => setSplitMode(!splitMode)}
              />
            </>
          )}
          <ToolbarBtn
            active={showInfo}
            icon={<UserRound className="w-3.5 h-3.5" />}
            label={isDoctor ? "Paciente" : "Médico"}
            onClick={() => openPanel("info")}
          />
          {isDoctor && (
            <>
              <div className="w-px h-6 bg-[hsl(220,15%,15%)] mx-1" />
              <ToolbarBtn
                icon={<Pill className="w-3.5 h-3.5" />}
                label="Receita"
                onClick={() => setToolOverlay({ url: `/dashboard/prescribe/${appointmentId}?embed=1`, title: "Receita / Prescrição" })}
              />
              <ToolbarBtn
                icon={<FileBadge className="w-3.5 h-3.5" />}
                label="Atestado"
                onClick={() => setToolOverlay({ url: `/dashboard/certificates?embed=1&appointment=${appointmentId}`, title: "Atestado / Declaração" })}
              />
              <ToolbarBtn
                icon={<Stethoscope className="w-3.5 h-3.5" />}
                label="Exames"
                onClick={() => setToolOverlay({ url: `/dashboard/exam-request?embed=1&appointment=${appointmentId}`, title: "Pedido de Exames" })}
              />
              <div className="w-px h-6 bg-[hsl(220,15%,15%)] mx-1" />
              <ToolbarBtn
                icon={<Camera className="w-3.5 h-3.5" />}
                label="Capturar"
                onClick={handleSnapshot}
              />
              <ToolbarBtn
                icon={<PictureInPicture2 className="w-3.5 h-3.5" />}
                label="PiP"
                onClick={handlePiP}
              />
              <ToolbarBtn
                active={videoRef.current?.isRecording}
                icon={<Disc className={`w-3.5 h-3.5 ${videoRef.current?.isRecording ? "text-red-500 animate-pulse" : ""}`} />}
                label={videoRef.current?.isRecording ? "Parar" : "Gravar"}
                onClick={handleToggleRecording}
              />
              {videoRef.current?.hasRecording && !videoRef.current?.isRecording && (
                <ToolbarBtn
                  icon={<Download className="w-3.5 h-3.5" />}
                  label="Baixar"
                  onClick={handleDownloadRecording}
                />
              )}
              <div className="w-px h-6 bg-[hsl(220,15%,15%)] mx-1" />
              <ToolbarBtn
                active={useJitsi}
                icon={<Video className="w-3.5 h-3.5" />}
                label={useJitsi ? "Jitsi" : "P2P"}
                onClick={() => {
                  if (!useJitsi) {
                    autoFallbackDoneRef.current = true; // troca manual conta como decisão final
                    switchToJitsi("manual");
                  } else {
                    setUseJitsi(false);
                    setJitsiRoomId(null);
                    autoFallbackDoneRef.current = false;
                    reconnectStartRef.current = null;
                    localStorage.setItem(`jitsi_${appointmentId}`, "false");
                    db.from("appointments").update({ jitsi_room_id: null } as any).eq("id", appointmentId ?? "");
                  }
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Banner persistente quando o navegador detecta queda de rede */}
      {!isOnline && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-xs font-semibold text-center shrink-0">
          ⚠️ Sem conexão — a consulta vai retomar quando sua internet voltar.
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video area */}
        <div className={splitMode && isDoctor && !isMobile ? "w-1/2" : "flex-1"} style={{ minHeight: 0 }}>
          <VideoErrorBoundary onEndCall={endCall}>
            {useJitsi && jitsiRoomId ? (
              <JitsiRoom
                roomId={jitsiRoomId}
                displayName={currentUserName}
                onEnd={endCall}
              />
            ) : (
              <VideoConsultation
                ref={videoRef}
                appointmentId={appointmentId!}
                userName={currentUserName}
                onEndCall={endCall}
                onStatusChange={(s) => {
                  setWebrtcStatus(s);
                  captureBreadcrumb("webrtc", `status: ${s}`, { appointmentId });
                  if (s === "failed") {
                    trackEvent("webrtc.failed", { appointmentId, role: isDoctor ? "doctor" : "patient" });
                  }
                }}
              />
            )}
          </VideoErrorBoundary>
        </div>

        {/* Ferramenta SOBRE a chamada — médico não sai do vídeo (continua rodando atrás) */}
        {isDoctor && toolOverlay && (
          <div className={`absolute z-[60] flex flex-col bg-[hsl(220,20%,8%)] ${isMobile ? "inset-0" : "inset-y-0 right-0 w-[58%] border-l border-[hsl(220,15%,18%)] shadow-2xl"}`}>
            <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-[hsl(220,15%,12%)] border-b border-[hsl(220,15%,18%)]">
              <span className="text-sm font-semibold text-white">{toolOverlay.title}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-emerald-400 font-medium hidden sm:inline">● Chamada ativa</span>
                <button
                  onClick={() => setToolOverlay(null)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
                  aria-label="Voltar à chamada"
                >
                  <X className="w-4 h-4" /> Voltar à chamada
                </button>
              </div>
            </div>
            <iframe
              src={toolOverlay.url}
              title={toolOverlay.title}
              className="flex-1 w-full border-0 bg-white"
              allow="clipboard-write; clipboard-read"
            />
          </div>
        )}

        {/* Split screen notes (desktop doctor) */}
        {splitMode && isDoctor && !isMobile && (
          <div className="w-1/2 border-l border-[hsl(220,15%,10%)] bg-[hsl(220,25%,6%)] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[hsl(220,15%,10%)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Prontuário</p>
                  <p className="text-[10px] text-[hsl(220,15%,40%)]">Modo focado</p>
                </div>
              </div>
              <SpeechToText onTranscript={(text) => updateSOAPField(soapTabs.find(t => t.key === activeSOAP)!.field as keyof SOAPNotes, soap.notes[soapTabs.find(t => t.key === activeSOAP)!.field as keyof SOAPNotes] + " " + text)} />
            </div>
            {notesPanel}
          </div>
        )}

        {/* Desktop side panel */}
        <AnimatePresence>
          {showSidePanel && !splitMode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="border-l border-[hsl(220,15%,10%)] bg-[hsl(220,25%,6%)] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-[hsl(220,15%,10%)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    showChat ? "bg-primary/10" : showNotes ? "bg-amber-500/10" : showAI ? "bg-primary/10" : "bg-[hsl(220,20%,12%)]"
                  }`}>
                    {showChat ? <MessageSquare className="w-4 h-4 text-primary" /> :
                     showNotes ? <FileText className="w-4 h-4 text-amber-400" /> :
                     showAI ? <Sparkles className="w-4 h-4 text-primary" /> :
                     <UserRound className="w-4 h-4 text-[hsl(220,15%,55%)]" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {showChat ? "Chat" : showNotes ? "Prontuário" : showAI ? "IA Clínica" : isDoctor ? "Paciente" : "Médico"}
                    </p>
                    <p className="text-[10px] text-[hsl(220,15%,40%)]">
                      {showChat ? `${messages.length} mensagens` : showNotes ? "Auto-save ativo" : showAI ? "Apoio à decisão" : "Informações"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeAllPanels}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(220,15%,40%)] hover:text-white hover:bg-[hsl(220,20%,12%)] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {showChat && (
                <ConsultationChatPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onUploadFile={handleFileUploadForChat}
                  isSending={false}
                  userRole={isDoctor ? "doctor" : "patient"}
                />
              )}
              {showNotes && isDoctor && notesPanel}
              {showAI && isDoctor && (
                <AIClinicalPanel
                  appointmentId={appointmentId!}
                  patientId={appointment?.patient_id ?? undefined}
                  recentMessages={messages.map((m) => ({ sender: m.sender, text: m.text }))}
                  onSendToNotes={handleAISendToNotes}
                />
              )}
              {showInfo && isDoctor && appointment?.patient_id && (
                <PatientInfoPanel patientId={appointment.patient_id} appointmentId={appointmentId!} />
              )}
              {showInfo && !isDoctor && appointment?.doctor_id && (
                <DoctorInfoPanel doctorId={appointment.doctor_id} appointmentId={appointmentId!} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile bottom sheet */}
        <AnimatePresence>
          {showBottomSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
                onClick={closeAllPanels}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  // Swipe-down to close: > 100px ou velocidade alta
                  if (info.offset.y > 100 || info.velocity.y > 500) {
                    closeAllPanels();
                  }
                }}
                className="absolute bottom-0 left-0 right-0 z-40 bg-[hsl(220,25%,8%)/95] backdrop-blur-xl rounded-t-3xl border-t border-[hsl(220,15%,12%)] flex flex-col shadow-2xl"
                style={{
                  maxHeight: "85dvh",
                  paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
                }}
              >
                {/* Drag handle agora é interativo — usuário puxa pra baixo pra fechar */}
                <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                  <div className="w-10 h-1 rounded-full bg-[hsl(220,15%,20%)]" />
                </div>
                <div className="px-4 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      showChat ? "bg-primary/10" : showNotes ? "bg-amber-500/10" : showAI ? "bg-primary/10" : "bg-[hsl(220,20%,12%)]"
                    }`}>
                      {showChat ? <MessageSquare className="w-4 h-4 text-primary" /> :
                       showNotes ? <FileText className="w-4 h-4 text-amber-400" /> :
                       showAI ? <Sparkles className="w-4 h-4 text-primary" /> :
                       <UserRound className="w-4 h-4 text-[hsl(220,15%,55%)]" />}
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {showChat ? "Chat" : showNotes ? "Prontuário" : showAI ? "IA Clínica" : isDoctor ? "Paciente" : "Médico"}
                    </p>
                  </div>
                  <button
                    onClick={closeAllPanels}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(220,15%,40%)] hover:text-white active:bg-[hsl(220,20%,16%)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  {showChat && (
                <ConsultationChatPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onUploadFile={handleFileUploadForChat}
                  isSending={false}
                  userRole={isDoctor ? "doctor" : "patient"}
                />
              )}
                  {showNotes && isDoctor && notesPanel}
                  {showAI && isDoctor && (
                    <AIClinicalPanel
                      appointmentId={appointmentId!}
                      patientId={appointment?.patient_id ?? undefined}
                      recentMessages={messages.map((m) => ({ sender: m.sender, text: m.text }))}
                      onSendToNotes={handleAISendToNotes}
                    />
                  )}
                  {showInfo && isDoctor && appointment?.patient_id && (
                    <PatientInfoPanel patientId={appointment.patient_id} appointmentId={appointmentId!} />
                  )}
                  {showInfo && !isDoctor && appointment?.doctor_id && (
                    <DoctorInfoPanel doctorId={appointment.doctor_id} appointmentId={appointmentId!} />
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Overlay de atalhos de teclado (médico). Abre com `?` */}
      {showShortcuts && isDoctor && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-[hsl(220,25%,8%)] border border-[hsl(220,15%,16%)] shadow-2xl p-5">
            <p className="text-sm font-semibold text-white mb-3">Atalhos de teclado</p>
            <div className="space-y-1.5 text-xs text-[hsl(220,15%,75%)]">
              {[
                ["M", "Mutar / ativar microfone"],
                ["V", "Câmera ligada / desligada"],
                ["C", "Abrir chat"],
                ["N", "Abrir prontuário"],
                ["I", "Abrir IA Clínica"],
                ["S", "Split do prontuário"],
                ["P", "Picture-in-Picture"],
                ["?", "Mostrar / esconder esta lista"],
              ].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-1 py-1 rounded">
                  <span>{label}</span>
                  <kbd className="px-2 py-0.5 text-[10px] font-bold rounded bg-[hsl(220,20%,12%)] border border-[hsl(220,15%,18%)] text-white">{k}</kbd>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-4 w-full text-xs py-2 rounded-lg bg-[hsl(220,20%,12%)] hover:bg-[hsl(220,20%,16%)] text-white">Fechar</button>
          </div>
        </div>
      )}

      {/* Mobile bottom toolbar — fixed at bottom */}
      {isMobile && (
        <div
          className="shrink-0 flex items-center justify-around gap-1 px-2 py-2 bg-[hsl(220,25%,6%)] border-t border-[hsl(220,15%,10%)]"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        >
          <ToolbarBtn
            active={videoRef.current?.isMuted}
            icon={videoRef.current?.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            label="Mic"
            onClick={() => videoRef.current?.toggleMute()}
          />
          <ToolbarBtn
            active={videoRef.current?.isVideoOff}
            icon={videoRef.current?.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            label="Cam"
            onClick={() => videoRef.current?.toggleVideo()}
          />
          <ToolbarBtn
            icon={<SwitchCamera className="w-5 h-5" />}
            label="Flip"
            onClick={() => videoRef.current?.switchCamera()}
          />
          <ToolbarBtn
            active={showChat}
            icon={<MessageSquare className="w-5 h-5" />}
            label="Chat"
            badge={showChat ? 0 : unreadCount}
            onClick={() => openPanel("chat")}
          />
          {isDoctor && (
            <ToolbarBtn
              active={showNotes}
              icon={<FileText className="w-5 h-5" />}
              label="SOAP"
              onClick={() => openPanel("notes")}
            />
          )}
          {isDoctor && (
            <ToolbarBtn
              active={showAI}
              icon={<Sparkles className="w-5 h-5" />}
              label="IA"
              onClick={() => openPanel("ai")}
            />
          )}
          <ToolbarBtn
            active={showInfo}
            icon={<UserRound className="w-5 h-5" />}
            label="Info"
            onClick={() => openPanel("info")}
          />
          {isDoctor && (
            <ToolbarBtn
              icon={<Pill className="w-5 h-5" />}
              label="Rx"
              onClick={() => window.open(`/dashboard/prescribe/${appointmentId}`, '_blank')}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default VideoRoom;
