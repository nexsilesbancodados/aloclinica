import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCircle, Trash } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import PushNotificationToggle from "./PushNotificationToggle";
import { isNotifAllowed } from "@/lib/notificationPrefs";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczDjFjqufk0YhQMi5Xp+Xm0IROMy1Vp+bl0IJPMy5XqObl0YFPMy5Yqefl0YFPNC9ZquijAAA=";

const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {}
};

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [hasNewPulse, setHasNewPulse] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const pulseTimeout = useRef<NodeJS.Timeout>();

  const unreadCount = notifications.filter(n => !n.is_read).length + unreadMessages;

  const showRealtimeToast = useCallback((notif: Notification) => {
    const typeIcons: Record<string, string> = {
      appointment: "📅", reminder: "⏰", message: "💬", system: "🔔", info: "ℹ️",
    };
    const icon = typeIcons[notif.type] ?? "🔔";

    playNotificationSound();

    // Pulse animation on badge
    setHasNewPulse(true);
    if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    pulseTimeout.current = setTimeout(() => setHasNewPulse(false), 3000);

    toast(notif.title, {
      description: notif.message,
      icon,
      action: notif.link
        ? { label: "Ver", onClick: () => navigate(notif.link!) }
        : undefined,
      duration: 6000,
    });
  }, [navigate]);

  // Stable ref to the toast handler so we don't re-subscribe on every render
  const showRealtimeToastRef = useRef(showRealtimeToast);
  useEffect(() => {
    showRealtimeToastRef.current = showRealtimeToast;
  }, [showRealtimeToast]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchUnreadMessages();

    // Defensive cleanup: remove any leftover channel instances with the same
    // names (HMR or unmount races can leave orphan channels in the client,
    // which causes "cannot add postgres_changes after subscribe()" on remount).
    const notifChannelName = `notifications-realtime-${user.id}`;
    const msgChannelName = `unread-messages-count-${user.id}`;
    try {
      const existing = db.getChannels?.() ?? [];
      existing.forEach((ch: { topic?: string }) => {
        const topic = ch?.topic ?? "";
        if (
          topic === `realtime:${notifChannelName}` ||
          topic === `realtime:${msgChannelName}` ||
          topic === "realtime:notifications-realtime" || // legacy
          topic === "realtime:unread-messages-count"     // legacy
        ) {
          db.removeChannel(ch);
        }
      });
    } catch {
      /* noop */
    }

    // Realtime subscription for notifications — chain .on() BEFORE .subscribe()
    const channel = db.channel(notifChannelName);
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      (payload: { new: Notification }) => {
        const newNotif = payload.new;
        // Sempre adiciona à lista (pra estar visível se o usuário religar a categoria depois)
        setNotifications((prev) => [newNotif, ...prev]);
        // Mas só toca som/exibe toast se a categoria estiver ativada
        if (isNotifAllowed(newNotif.type)) {
          showRealtimeToastRef.current(newNotif);
        }
      }
    );
    channel.subscribe();

    // Realtime subscription for unread messages
    const msgChannel = db.channel(msgChannelName);
    msgChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => fetchUnreadMessages()
    );
    msgChannel.subscribe();

    return () => {
      db.removeChannel(channel);
      db.removeChannel(msgChannel);
      if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    };
  }, [user]);

  const fetchUnreadMessages = async () => {
    if (!user) return;
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false)
      .neq("sender_id", user.id);
    setUnreadMessages(count ?? 0);
  };

  const fetchNotifications = async () => {
    const { data } = await db
      .from("notifications")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as Notification[]) ?? []);
  };

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    const { error } = await db.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) {
      // Rollback
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const { error } = await db.from("notifications").update({ is_read: true }).in("id", unreadIds);
    if (error) {
      // Rollback
      fetchNotifications();
    }
  };

  const deleteNotification = async (id: string) => {
    // Optimistic update
    const prev = notifications;
    setNotifications(p => p.filter(n => n.id !== id));
    const { error } = await db.from("notifications").delete().eq("id", id);
    if (error) {
      setNotifications(prev);
      toast.error("Erro ao excluir notificação");
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  const typeIcons: Record<string, string> = {
    appointment: "📅", reminder: "⏰", message: "💬", system: "🔔", info: "ℹ️",
    waitlist: "🔔", approval: "✅", consultation: "🩺", document: "📄", certificate: "📋",
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative h-9 w-9 rounded-xl overflow-visible hover:bg-primary/[0.06] transition-colors">
          <Bell size={18} weight={unreadCount > 0 ? "fill" : "regular"} className={unreadCount > 0 ? "text-primary" : ""} />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: hasNewPulse ? [1, 1.3, 1] : 1,
                  opacity: 1,
                }}
                exit={{ scale: 0, opacity: 0 }}
                transition={hasNewPulse
                  ? { scale: { duration: 0.5, repeat: 2, ease: "easeInOut" } }
                  : { duration: 0.2 }
                }
                className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold shadow-lg shadow-destructive/30 ring-2 ring-background tabular-nums"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-1rem))] p-0 rounded-2xl border-border/40 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-card to-muted/20 border-b border-border/20">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-sm text-foreground">Notificações</h3>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary animate-count-up">
                {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7 rounded-lg text-primary hover:text-primary hover:bg-primary/10 font-semibold">
              <CheckCircle size={12} weight="fill" className="mr-1" /> Ler todas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[50vh] md:max-h-[380px]">
          {notifications.length === 0 ? (
            <div className="py-16 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Bell size={28} weight="light" className="text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Tudo tranquilo por aqui!</p>
              <p className="text-[12px] text-muted-foreground/60 leading-relaxed max-w-[200px] mx-auto">Você será notificado sobre consultas, mensagens e atualizações.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {notifications.map((n, idx) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02, duration: 0.25 }}
                  className={`flex items-start gap-3.5 px-5 py-3.5 cursor-pointer transition-all duration-200 group ${
                    !n.is_read ? "bg-primary/[0.03] hover:bg-primary/[0.07]" : "hover:bg-muted/40"
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5 ${
                    !n.is_read ? "bg-primary/8 shadow-sm" : "bg-muted/50"
                  }`}>
                    {typeIcons[n.type] ?? "🔔"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5">
                      <p className={`text-[13px] leading-tight ${!n.is_read ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5 animate-breathe" />
                      )}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1.5 font-medium">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Excluir notificação"
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                  >
                    <Trash size={12} />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/20 bg-gradient-to-r from-card/80 to-muted/10 flex items-center justify-between gap-2">
          <PushNotificationToggle />
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] h-7 rounded-lg font-semibold gap-1"
            onClick={() => { setOpen(false); navigate("/dashboard/notifications"); }}
          >
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
