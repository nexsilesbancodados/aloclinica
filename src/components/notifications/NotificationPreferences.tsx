import { useState, useEffect } from "react";
import { Bell, BellOff, Calendar, CreditCard, FileText, MessageSquare, Heart, Stethoscope, Sparkles, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import PushNotificationToggle from "./PushNotificationToggle";
import { toast } from "sonner";

import { NOTIF_PREFS_KEY as STORAGE_KEY } from "@/lib/notificationPrefs";

type Category = {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  defaultOn: boolean;
};

const CATEGORIES: Category[] = [
  { id: "appointment", label: "Consultas",       description: "Lembretes, confirmações e mudanças de horário", icon: Calendar,   color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-500/10",   defaultOn: true  },
  { id: "consultation", label: "Atendimentos",   description: "Médico chamando, sala de espera e urgência",    icon: Stethoscope, color: "text-primary",                       bg: "bg-primary/10",    defaultOn: true  },
  { id: "payment",      label: "Pagamentos",     description: "Cobranças, recibos e PIX confirmado",            icon: CreditCard, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", defaultOn: true },
  { id: "document",     label: "Documentos",     description: "Receitas, atestados e laudos disponíveis",       icon: FileText,   color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10",  defaultOn: true  },
  { id: "message",      label: "Mensagens",      description: "Chat com médicos e equipe de suporte",           icon: MessageSquare, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", defaultOn: true },
  { id: "health",       label: "Saúde & Dicas",  description: "Lembretes de medicação e dicas do Pingo",        icon: Heart,      color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-500/10",   defaultOn: false },
  { id: "system",       label: "Sistema",        description: "Atualizações, segurança e manutenção",            icon: ShieldCheck, color: "text-muted-foreground",             bg: "bg-muted",         defaultOn: true  },
];

type Prefs = Record<string, boolean>;

const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* noop */
  }
  return Object.fromEntries(CATEGORIES.map(c => [c.id, c.defaultOn]));
};

const NotificationPreferences = () => {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [allOn, setAllOn] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* noop */
    }
    setAllOn(Object.values(prefs).every(Boolean));
  }, [prefs]);

  const toggle = (id: string) => {
    setPrefs(p => ({ ...p, [id]: !p[id] }));
  };

  const toggleAll = () => {
    const next = !allOn;
    setPrefs(Object.fromEntries(CATEGORIES.map(c => [c.id, next])));
    toast.success(next ? "Todas as notificações ativadas" : "Todas as notificações silenciadas");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/60 bg-card overflow-hidden"
      aria-label="Preferências de notificação"
    >
      {/* Header */}
      <div className="p-5 border-b border-border/60 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-[15px] leading-tight">Preferências</h3>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">Escolha o que aparece e como te avisar</p>
            </div>
          </div>
          <PushNotificationToggle />
        </div>
      </div>

      {/* Master toggle */}
      <button
        type="button"
        onClick={toggleAll}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {allOn ? (
            <Bell className="w-4 h-4 text-primary" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-bold text-foreground">
            {allOn ? "Tudo ativado" : "Algumas categorias silenciadas"}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-primary">
          {allOn ? "Silenciar todas" : "Ativar todas"}
        </span>
      </button>

      {/* Categories */}
      <ul className="divide-y divide-border/50">
        {CATEGORIES.map((c, i) => {
          const Icon = c.icon;
          const on = prefs[c.id] ?? c.defaultOn;
          return (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{c.label}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{c.description}</p>
              </div>
              <Switch
                checked={on}
                onCheckedChange={() => toggle(c.id)}
                aria-label={`${on ? "Desativar" : "Ativar"} notificações de ${c.label}`}
              />
            </motion.li>
          );
        })}
      </ul>

      <p className="text-[10.5px] text-muted-foreground/80 px-5 py-3 bg-muted/20 leading-relaxed">
        Suas preferências ficam salvas neste dispositivo. Algumas notificações críticas (segurança da conta) sempre serão entregues.
      </p>
    </motion.section>
  );
};

export default NotificationPreferences;