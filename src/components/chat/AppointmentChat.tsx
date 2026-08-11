import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Check, CheckCheck, Paperclip, X, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Message {
  id: string;
  appointment_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
}

interface AppointmentChatProps {
  appointmentId: string;
  otherUserName?: string;
}

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 5 }}
    className="flex justify-start"
  >
    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-muted-foreground/50"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  </motion.div>
);

const AppointmentChat = ({ appointmentId, otherUserName }: AppointmentChatProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [chatExpired, setChatExpired] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check 48h chat window expiration
  useEffect(() => {
    if (!appointmentId) return;
    const checkExpiry = async () => {
      const { data } = await db
        .from("appointments")
        .select("scheduled_at, status")
        .eq("id", appointmentId)
        .single();
      if (data && data.status === "completed") {
        const scheduledAt = new Date(data.scheduled_at);
        const hoursElapsed = (Date.now() - scheduledAt.getTime()) / (1000 * 60 * 60);
        if (hoursElapsed > 48) setChatExpired(true);
      }
    };
    checkExpiry();
  }, [appointmentId]);

  const fetchMessages = useCallback(async () => {
    if (!userId) return;
    const { data } = await db
      .from("messages")
      .select("*")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) ?? []);

    const unread = (data ?? []).filter((m: { is_read: boolean; sender_id: string }) => !m.is_read && m.sender_id !== userId);
    if (unread.length > 0) {
      await db.from("messages").update({ is_read: true }).in("id", unread.map((m: any) => m.id));
    }
  }, [appointmentId, userId]);

  useEffect(() => {
    if (!userId || !appointmentId) return;
    void fetchMessages();

    // Realtime for new messages
    const channel = db
      .channel(`chat-${appointmentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `appointment_id=eq.${appointmentId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_id !== userId) {
            db.from("messages").update({ is_read: true }).eq("id", newMsg.id).then(() => {});
            setOtherTyping(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `appointment_id=eq.${appointmentId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .subscribe();

    // Presence channel for typing indicators
    const presenceChannel = db.channel(`typing-${appointmentId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.user_id !== userId) {
          setOtherTyping(true);
          setTimeout(() => setOtherTyping(false), 3000);
        }
      })
      .subscribe();

    channelRef.current = presenceChannel;

    return () => {
      db.removeChannel(channel);
      db.removeChannel(presenceChannel);
    };
  }, [appointmentId, fetchMessages, userId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    (channelRef.current as any).send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id },
    });
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      broadcastTyping();
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
  };

  const sendMessage = async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    setIsTyping(false);
    const content = input.trim();
    const { error } = await db.from("messages").insert({
      appointment_id: appointmentId,
      sender_id: user.id,
      content,
    });
    if (!error) {
      setInput("");
      // Send push notification to the other participant
      try {
        const { data: appt } = await db
          .from("appointments")
          .select("patient_id, doctor_id")
          .eq("id", appointmentId)
          .single();
        if (appt) {
          // Determine recipient
          let recipientUserId: string | null = null;
          if (appt.patient_id === user.id) {
            // Sender is patient → notify doctor
            const { data: doc } = await db
              .from("doctor_profiles")
              .select("user_id")
              .eq("id", appt.doctor_id)
              .single();
            recipientUserId = doc?.user_id ?? null;
          } else {
            // Sender is doctor → notify patient
            recipientUserId = appt.patient_id;
          }
          if (recipientUserId) {
            db.functions.invoke("send-push-notification", {
              body: {
                user_id: recipientUserId,
                title: `💬 Nova mensagem${otherUserName ? ` de ${otherUserName}` : ""}`,
                message: content.length > 80 ? content.slice(0, 80) + "…" : content,
                link: `/dashboard/chat/${appointmentId}`,
              },
            }).catch(() => {});
          }
        }
      } catch (err: unknown) { /* silent failure */ }
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10MB."); return; }
    setPendingFile(file);
    e.target.value = "";
  };

  const sendFile = async () => {
    if (!pendingFile || !user || uploadingFile) return;
    setUploadingFile(true);
    try {
      const ext = pendingFile.name.split(".").pop() ?? "bin";
      const path = `${appointmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await db.storage
        .from("chat-attachments")
        .upload(path, pendingFile, { contentType: pendingFile.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage.from("chat-attachments").getPublicUrl(path);

      const { error: msgError } = await db.from("messages").insert({
        appointment_id: appointmentId,
        sender_id: user.id,
        content: input.trim() || "",
        file_url: publicUrl,
        file_name: pendingFile.name,
        file_type: pendingFile.type,
        file_size: pendingFile.size,
      });
      if (msgError) throw msgError;
      setInput("");
      setPendingFile(null);
    } catch (err) {
      toast.error("Erro ao enviar arquivo.");
      console.error("File upload error:", err);
    } finally {
      setUploadingFile(false);
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce<Record<string, Message[]>>((acc, m) => {
    const day = format(new Date(m.created_at), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full border border-border rounded-xl bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {otherUserName ? `Chat com ${otherUserName}` : "Chat da Consulta"}
          </h3>
          <AnimatePresence>
            {otherTyping && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[10px] text-primary font-medium"
              >
                digitando...
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 max-h-[400px]">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                Nenhuma mensagem ainda. Envie a primeira! 💬
              </p>
            </div>
          )}
          {Object.entries(groupedMessages).map(([day, msgs]) => (
            <div key={day}>
              <div className="flex justify-center my-3">
                <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {format(new Date(day), "dd 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
              {msgs.map((m, idx) => {
                const isMine = m.sender_id === user?.id;
                const showAvatar = idx === 0 || msgs[idx - 1]?.sender_id !== m.sender_id;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${isMine ? "justify-end" : "justify-start"} ${showAvatar ? "mt-3" : "mt-0.5"}`}
                  >
                    {!isMine && showAvatar && (
                      <Avatar className="w-6 h-6 mr-1.5 mt-auto shrink-0">
                        <AvatarFallback className="text-[8px] bg-muted">
                          {otherUserName?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!isMine && !showAvatar && <div className="w-[30px] shrink-0" />}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {m.file_url && (
                        <div className="mb-1">
                          {m.file_type?.startsWith("image/") ? (
                            <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                              <img src={m.file_url} alt={m.file_name ?? "imagem"} className="max-w-[200px] rounded-xl object-cover" loading="lazy" />
                            </a>
                          ) : (
                            <a href={m.file_url} target="_blank" rel="noopener noreferrer"
                              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium underline-offset-2 hover:underline ${isMine ? "bg-white/15" : "bg-background/50"}`}>
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate max-w-[140px]">{m.file_name ?? "arquivo"}</span>
                            </a>
                          )}
                        </div>
                      )}
                      {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                      <div className={`flex items-center gap-1 justify-end mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        <span className="text-[10px]">
                          {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                        </span>
                        {isMine && (
                          m.is_read
                            ? <CheckCheck className="w-3 h-3" />
                            : <Check className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
          <AnimatePresence>{otherTyping && <TypingIndicator />}</AnimatePresence>
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      {chatExpired ? (
        <div className="p-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">⏰ Prazo de chat pós-consulta encerrado (48h).</p>
        </div>
      ) : (
        <div className="p-3 border-t border-border space-y-2">
          {pendingFile && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
              {pendingFile.type.startsWith("image/") ? <Image className="w-4 h-4 text-primary shrink-0" /> : <FileText className="w-4 h-4 text-primary shrink-0" />}
              <span className="flex-1 truncate font-medium">{pendingFile.name}</span>
              <span className="text-muted-foreground shrink-0">{(pendingFile.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf,text/plain" onChange={handleFileSelect} />
            <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()}
              className="rounded-xl shrink-0 text-muted-foreground hover:text-primary" aria-label="Anexar arquivo">
              <Paperclip className="w-4 h-4" />
            </Button>
            <Input
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? "Adicionar mensagem (opcional)..." : "Digite sua mensagem..."}
              className="flex-1 rounded-xl"
            />
            <Button size="icon"
              onClick={pendingFile ? sendFile : sendMessage}
              disabled={(!input.trim() && !pendingFile) || sending || uploadingFile}
              className="rounded-xl shrink-0" aria-label="Enviar"
            >
              {(sending || uploadingFile) ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentChat;
