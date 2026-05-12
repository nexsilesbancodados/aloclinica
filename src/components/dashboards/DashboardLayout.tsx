import { ReactNode, useState, useMemo, useEffect, useRef, isValidElement, cloneElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
   SignOut, User, GearSix, List, MagnifyingGlass, ShieldCheck as ShieldCheckIcon,
   CaretDown, DownloadSimple, X as XIcon, DeviceMobile, SidebarSimple, ArrowLineLeft,
    House, Bell, ChatCircleText, UserCircle, Timer, VideoCamera,
} from "@phosphor-icons/react";
import NotificationBell from "@/components/notifications/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GlobalCommand from "@/components/GlobalCommand";
import { PINGO_LOGO_URL, IS_DEV } from "@/lib/constants";
import { DevModeToggle } from "@/components/dev/DevModeToggle";
const logoImg = PINGO_LOGO_URL;
const mascotImg = PINGO_LOGO_URL;
import DashboardBreadcrumbs from "@/components/dashboards/DashboardBreadcrumbs";
import useNotificationTitle from "@/hooks/use-notification-title";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSessionSecurity } from "@/hooks/use-session-security";

interface NavItem {
  label: string; href: string; icon: ReactNode;
  active?: boolean; group?: string; badge?: number;
}
interface DashboardLayoutProps {
  children: ReactNode; title: string;
  nav?: NavItem[]; role?: string; loading?: boolean;
}
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Service Identity ──
const SERVICE_MAP: Record<string, { name: string; emoji: string; color: string; description: string }> = {
  patient: { name: "Telemedicina", emoji: "🩺", color: "hsl(210,90%,45%)", description: "Consultoria médica online" },
  doctor: { name: "Telemedicina", emoji: "🩺", color: "hsl(160,55%,42%)", description: "Atendimento a pacientes" },
  ophthalmologist: { name: "Oftalmologia", emoji: "👁️", color: "hsl(270,65%,50%)", description: "Exames e prescrições" },
  laudista: { name: "Telelaudo", emoji: "📋", color: "hsl(175,60%,40%)", description: "Laudos e assinaturas" },
  clinic: { name: "Telelaudo", emoji: "📋", color: "hsl(175,60%,40%)", description: "Gestão de exames" },
  receptionist: { name: "Recepção", emoji: "🏥", color: "hsl(30,88%,48%)", description: "Agendas e check-in" },
  support: { name: "Suporte", emoji: "🎧", color: "hsl(42,90%,48%)", description: "Atendimento ao cliente" },
  admin: { name: "Administração", emoji: "⚙️", color: "hsl(265,60%,52%)", description: "Controle do sistema" },
  partner: { name: "Parceria", emoji: "🤝", color: "hsl(148,60%,40%)", description: "Integrações e validações" },
  ai: { name: "Assistente IA", emoji: "🤖", color: "hsl(210,85%,48%)", description: "Chat inteligente" },
  cartao_beneficios: { name: "Cartão Benefícios", emoji: "💳", color: "hsl(340,75%,50%)", description: "Carteirinha e descontos" },
};

const ROLE_LABELS: Record<string, string> = {
  patient:"Paciente", doctor:"Médico", admin:"Administrador",
  receptionist:"Recepção", support:"Suporte", clinic:"Clínica",
  partner:"Parceiro", ai:"Assistente IA", ophthalmologist:"Oftalmologista",
  cartao_beneficios:"Titular do Cartão",
};
const ROLE_COLORS: Record<string, string> = {
  patient:"bg-primary/10 text-primary border-primary/20",
  doctor:"bg-secondary/10 text-secondary border-secondary/20",
  admin:"bg-destructive/10 text-destructive border-destructive/20",
  receptionist:"bg-warning/10 text-warning border-warning/20",
  support:"bg-warning/10 text-warning border-warning/20",
  clinic:"bg-primary/10 text-primary border-primary/20",
  partner:"bg-success/10 text-success border-success/20",
  ai:"bg-primary/10 text-primary border-primary/20",
  cartao_beneficios:"bg-rose-500/10 text-rose-600 border-rose-500/20",
};
const ROLE_ICON: Record<string, string> = {
  patient:"👤", doctor:"🩺", admin:"⚙️", receptionist:"🏥",
  support:"🎧", clinic:"🏢", partner:"🤝", ai:"🤖",
  cartao_beneficios:"💳",
};
const ROLE_GRADIENT: Record<string, string> = {
  patient:"from-[hsl(210,90%,45%)] to-[hsl(195,85%,50%)]",
  doctor:"from-[hsl(160,55%,45%)] to-[hsl(175,60%,45%)]",
  admin:"from-[hsl(0,84%,60%)] to-[hsl(350,80%,55%)]",
  receptionist:"from-[hsl(38,92%,50%)] to-[hsl(25,90%,52%)]",
  support:"from-[hsl(45,90%,50%)] to-[hsl(38,92%,50%)]",
  clinic:"from-[hsl(210,90%,45%)] to-[hsl(230,70%,55%)]",
  partner:"from-[hsl(142,71%,45%)] to-[hsl(160,55%,45%)]",
  ai:"from-[hsl(200,80%,50%)] to-[hsl(210,90%,45%)]",
  cartao_beneficios:"from-[hsl(340,75%,45%)] to-[hsl(355,65%,55%)]",
};
// Mobile header gradient per role — each role gets a unique color identity
const ROLE_HEADER_GRADIENT: Record<string, string> = {
  patient:"bg-gradient-to-r from-[hsl(210,90%,45%)] via-[hsl(200,88%,48%)] to-[hsl(195,85%,50%)]",
  doctor:"bg-gradient-to-r from-[hsl(155,60%,38%)] via-[hsl(160,55%,42%)] to-[hsl(170,50%,45%)]",
  admin:"bg-gradient-to-r from-[hsl(260,65%,50%)] via-[hsl(270,60%,48%)] to-[hsl(280,55%,52%)]",
  receptionist:"bg-gradient-to-r from-[hsl(25,85%,48%)] via-[hsl(30,88%,50%)] to-[hsl(38,92%,52%)]",
  support:"bg-gradient-to-r from-[hsl(38,85%,45%)] via-[hsl(42,90%,48%)] to-[hsl(48,85%,52%)]",
  clinic:"bg-gradient-to-r from-[hsl(215,75%,42%)] via-[hsl(225,70%,48%)] to-[hsl(235,65%,52%)]",
  partner:"bg-gradient-to-r from-[hsl(142,65%,38%)] via-[hsl(150,60%,42%)] to-[hsl(160,55%,45%)]",
  ai:"bg-gradient-to-r from-[hsl(200,80%,45%)] via-[hsl(210,85%,48%)] to-[hsl(220,80%,52%)]",
  cartao_beneficios:"bg-gradient-to-r from-[hsl(340,75%,42%)] via-[hsl(345,72%,48%)] to-[hsl(355,65%,55%)]",
};
// Bottom nav active color per role
const ROLE_ACTIVE_COLOR: Record<string, string> = {
  patient:"text-[hsl(210,90%,45%)]",
  doctor:"text-[hsl(160,55%,42%)]",
  admin:"text-[hsl(265,60%,52%)]",
  receptionist:"text-[hsl(30,88%,48%)]",
  support:"text-[hsl(42,90%,48%)]",
  clinic:"text-[hsl(225,70%,48%)]",
  partner:"text-[hsl(148,60%,40%)]",
  ai:"text-[hsl(210,85%,48%)]",
  cartao_beneficios:"text-[hsl(340,75%,50%)]",
};
const ROLE_ACTIVE_BG: Record<string, string> = {
  patient:"bg-[hsl(210,90%,45%,0.12)]",
  doctor:"bg-[hsl(160,55%,42%,0.12)]",
  admin:"bg-[hsl(265,60%,52%,0.12)]",
  receptionist:"bg-[hsl(30,88%,48%,0.12)]",
  support:"bg-[hsl(42,90%,48%,0.12)]",
  clinic:"bg-[hsl(225,70%,48%,0.12)]",
  partner:"bg-[hsl(148,60%,40%,0.12)]",
  ai:"bg-[hsl(210,85%,48%,0.12)]",
  cartao_beneficios:"bg-[hsl(340,75%,50%,0.12)]",
};


// ── PWA Banner ────────────────────────────────────────────────────────────────
const PWABanner = ({ role }: { role: string }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useLocalStorage<boolean>("pwa-dismissed", false);
  const [dismissedUntil, setDismissedUntil] = useLocalStorage<number>("pwa-dismissed-until", 0);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (dismissed && Date.now() < dismissedUntil) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    setIsIOS(ios);
    if (ios) { const t = setTimeout(() => setShow(true), 4000); return () => clearTimeout(t); }
    const h = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); setTimeout(() => setShow(true), 3000); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, [dismissed, dismissedUntil]);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setDismissed(true); setDismissedUntil(Date.now() + 365 * 86400000); }
    setShow(false); setDeferredPrompt(null);
  };
  const dismiss = () => { setShow(false); setDismissed(true); setDismissedUntil(Date.now() + 7 * 86400000); };
  const grad = ROLE_GRADIENT[role] ?? "from-blue-500 to-cyan-500";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 360, damping: 26 }}
          className="fixed z-[60] bottom-[80px] left-3 right-3 md:hidden"
          role="dialog" aria-label="Instalar AloClínica"
        >
          <div className="relative rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 24px 48px -8px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.06)" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-secondary/15 pointer-events-none" />
            <div className="relative bg-card/96 backdrop-blur-2xl m-[1px] rounded-[15px] p-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center shrink-0 shadow-lg`}>
                  <DeviceMobile className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Instalar AloClínica</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isIOS ? "Toque ⎙ → Adicionar à Tela Inicial" : "App nativo · Offline · Notificações"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isIOS && (
                    <Button size="sm" onClick={install}
                      className="h-8 px-3 rounded-xl text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-secondary text-white border-0 shadow-md">
                      <DownloadSimple className="w-3.5 h-3.5" aria-hidden="true" />
                      Instalar
                    </Button>
                  )}
                  <button onClick={dismiss}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Dispensar">
                    <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const DashboardLayout = ({ children, title, nav, role: propsRole }: DashboardLayoutProps) => {
  const { profile, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage("sidebar-collapsed", false);
  const { signOut } = useAuth();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useNotificationTitle();
  useSessionSecurity();

  const isAdmin = roles.includes("admin");
  const forceRole = searchParams.get("role");
  const isAdminViewingOtherPanel = isAdmin && forceRole && forceRole !== "admin";

  // Detectar role: se passado via props, use; se admin, use "admin"; senão detecte pela query string ou padrão
  const role = propsRole || (isAdmin ? "admin" : forceRole || "patient");
  const grad = ROLE_GRADIENT[role] ?? ROLE_GRADIENT.patient;
  const ROLE_RING: Record<string, string> = {
    patient: "ring-blue-400", doctor: "ring-emerald-400", laudista: "ring-blue-600",
    admin: "ring-purple-400", clinic: "ring-orange-400", receptionist: "ring-amber-400",
    support: "ring-yellow-400", partner: "ring-green-400", ai: "ring-blue-400",
  };
  const avatarRing = ROLE_RING[role] ?? "ring-blue-400";

  const initials = profile ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() : "?";
  const fullName = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Usuário";
  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const navGroups = useMemo(() => {
    if (!nav) return [];
    const groups: { label: string; items: NavItem[] }[] = [];
    let cur: { label: string; items: NavItem[] } = { label: "", items: [] };
    nav.forEach(item => {
      if (item.group && item.group !== cur.label) {
        if (cur.items.length) groups.push(cur);
        cur = { label: item.group, items: [item] };
      } else { cur.items.push(item); }
    });
    if (cur.items.length) groups.push(cur);
    return groups;
  }, [nav]);

   // Mobile-Specific Bottom Nav Resolution
   const bottomNav = useMemo(() => {
     const items: NavItem[] = [];
     const currentPath = location.pathname;
 
     // 1. Home (Dynamic based on role if needed, but /dashboard is standard)
     items.push({
       label: "Início",
       href: `/dashboard?role=${role}`,
       icon: <House size={22} weight={currentPath === "/dashboard" ? "fill" : "regular"} />,
       active: currentPath === "/dashboard" && (!forceRole || forceRole === role)
     });
 
     // 2. Core Operational Item (Role-based)
     if (role === "patient") {
       items.push({
         label: "Agendar",
         href: "/dashboard/schedule?role=patient",
         icon: <MagnifyingGlass size={22} weight={currentPath.includes("schedule") ? "fill" : "regular"} />,
         active: currentPath.includes("schedule")
       });
     } else if (role === "doctor") {
       items.push({
         label: "Espera",
         href: "/dashboard/doctor/waiting-room?role=doctor",
         icon: <Timer size={22} weight={currentPath.includes("waiting-room") ? "fill" : "regular"} />,
         active: currentPath.includes("waiting-room")
       });
     } else if (role === "admin") {
       items.push({
         label: "Ao Vivo",
         href: "/dashboard/admin/live?role=admin",
         icon: <VideoCamera size={22} weight={currentPath.includes("live") ? "fill" : "regular"} />,
         active: currentPath.includes("live")
       });
     }
 
     // 3. Messages / Chat
     items.push({
       label: "Chat",
       href: `/dashboard/chat?role=${role}`,
       icon: <ChatCircleText size={22} weight={currentPath.includes("chat") ? "fill" : "regular"} />,
       active: currentPath.includes("chat")
     });
 
     // 4. Notifications / Alerts
     items.push({
       label: "Avisos",
       href: `/dashboard/notifications?role=${role}`,
       icon: <Bell size={22} weight={currentPath.includes("notifications") ? "fill" : "regular"} />,
       active: currentPath.includes("notifications")
     });
 
     // 5. Profile
     items.push({
       label: "Perfil",
       href: `/dashboard/profile?role=${role}`,
       icon: <UserCircle size={22} weight={currentPath.includes("profile") ? "fill" : "regular"} />,
       active: currentPath.includes("profile")
     });
 
     return items;
   }, [role, location.pathname, forceRole]);

  // CSS-only entrance — no GSAP import needed, saves ~30KB dynamic load
  useEffect(() => {
    if (!sidebarRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = sidebarRef.current.querySelectorAll(".nav-item");
    items.forEach((el, i) => {
      (el as HTMLElement).style.opacity = "0";
      (el as HTMLElement).style.transform = "translateX(-8px)";
      requestAnimationFrame(() => {
        setTimeout(() => {
          (el as HTMLElement).style.transition = "opacity 0.25s ease-out, transform 0.25s ease-out";
          (el as HTMLElement).style.opacity = "1";
          (el as HTMLElement).style.transform = "translateX(0)";
        }, i * 30);
      });
    });
   
  }, []);

  const NavItemRow = ({ item, onClick }: { item: NavItem; onClick?: () => void }) => {
    // Clone NavIcon to inject active state
    const icon = isValidElement(item.icon) && (item.icon.props as any)?.color
      ? cloneElement(item.icon as React.ReactElement<any>, { active: item.active })
      : item.icon;

    return (
      <Link to={item.href} onClick={onClick}
        className={`nav-item group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all duration-200 relative ${
          item.active
            ? "bg-primary text-primary-foreground font-semibold shadow-[0_2px_8px_rgba(0,0,0,.15),inset_0_0_0_1px_rgba(255,255,255,.06)]"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <span className={`shrink-0 transition-transform duration-200 ${item.active ? "" : "group-hover:scale-110"}`}>{icon}</span>
        <span className="flex-1 truncate">{item.label}</span>
        {(item.badge ?? 0) > 0 && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center tabular-nums ${
            item.active ? "bg-white/25 text-white" : "bg-destructive text-white"
          }`}>
            {(item.badge ?? 0) > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );
  };

  const SidebarContent = ({ onItemClick, collapsed = false }: { onItemClick?: () => void; collapsed?: boolean }) => {
    const service = SERVICE_MAP[role] || SERVICE_MAP.patient;
    return (
    <div ref={sidebarRef} className="flex flex-col flex-1 min-h-0 w-full">
      {/* Spacer top */}
      <div className="h-4 shrink-0" />

      {/* Service Banner */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-muted/60 to-muted/30 border border-border/40 p-3">
            <div className="flex items-start gap-2">
              <span className="text-2xl mt-0.5">{service.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground">{service.name}</p>
                <p className="text-[10px] text-muted-foreground/80 leading-snug">{service.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <span className="text-2xl">{service.emoji}</span>
        </div>
      )}

      {/* Role badge */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${ROLE_COLORS[role] ?? ROLE_COLORS.patient}`}>
            <span className="text-xs">{ROLE_ICON[role] ?? "👤"}</span>
            {ROLE_LABELS[role] ?? title}
          </div>
        </div>
      )}

      {isAdminViewingOtherPanel && !collapsed && (
        <div className="px-3 pb-1 shrink-0">
          <button onClick={() => { navigate("/dashboard"); onItemClick?.(); }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-destructive bg-destructive/8 hover:bg-destructive/15 transition-all duration-200">
            <ShieldCheckIcon className="w-3 h-3" /> Voltar ao Admin
          </button>
        </div>
      )}

      {nav && nav.length > 0 && (
        <nav className={`flex-1 min-h-0 overflow-y-auto py-2 scrollbar-hide ${collapsed ? "px-1.5" : "px-3"}`}>
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && !collapsed && (
                <div className="flex items-center gap-2 px-2.5 pt-4 pb-2">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em] flex-1">
                    {group.label}
                  </p>
                  <div className="flex-1 h-px bg-gradient-to-r from-muted-foreground/20 to-transparent" />
                </div>
              )}
              {group.label && collapsed && gi > 0 && (
                <div className="mx-2 my-2 border-t border-border/10" />
              )}
              <div className="space-y-0.5">
                {group.items.map(item => (
                  collapsed ? (
                    <Link key={item.href} to={item.href} onClick={onItemClick}
                      title={item.label}
                      className={`nav-item group flex items-center justify-center p-2 rounded-xl transition-all duration-200 relative ${
                        item.active
                          ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(0,0,0,.15)]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}>
                      <span className="shrink-0">{
                        isValidElement(item.icon) && (item.icon.props as any)?.color
                          ? cloneElement(item.icon as React.ReactElement<any>, { active: item.active })
                          : item.icon
                      }</span>
                      {(item.badge ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold min-w-[14px] h-3.5 px-1 rounded-full bg-destructive text-white flex items-center justify-center">
                          {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <NavItemRow key={item.href} item={item} onClick={onItemClick} />
                  )
                ))}
              </div>
            </div>
          ))}
        </nav>
      )}

      {/* User area */}
      <div className={`mt-auto shrink-0 border-t border-border/10 ${collapsed ? "p-1.5" : "p-2.5"}`}>
        {collapsed ? (
          <button onClick={() => { navigate("/dashboard/profile"); onItemClick?.(); }}
            title="Meu Perfil"
            className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-muted/50 transition-all duration-200 relative">
            <Avatar className="h-7 w-7 ring-2 ring-border/15">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className={`bg-gradient-to-br ${grad} text-white text-[9px] font-bold`}>{initials}</AvatarFallback>
            </Avatar>
            {/* Online indicator for doctor role */}
            {role === "doctor" && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
            )}
          </button>
        ) : (
          <button onClick={() => { navigate("/dashboard/profile"); onItemClick?.(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-muted/50 transition-all duration-200 text-left group relative">
            <div className="relative">
              <Avatar className={`h-8 w-8 ring-2 ${avatarRing} group-hover:ring-primary/25 transition-all`}>
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className={`bg-gradient-to-br ${grad} text-white text-[10px] font-bold`}>{initials}</AvatarFallback>
              </Avatar>
              {/* Online indicator for doctor role */}
              {role === "doctor" && (
                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{fullName}</p>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground truncate flex-1">{ROLE_LABELS[role] ?? title}</span>
                {role === "doctor" && (
                  <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                )}
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">

      {/* ═══ Mobile Header — app-like blue gradient ═══ */}
      <header ref={headerRef}
        className="sticky top-0 z-50 md:h-14 md:bg-background/90 md:backdrop-blur-md md:border-b md:border-border/40 supports-[backdrop-filter]:md:bg-background/80 flex items-center gap-3"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
       {/* Mobile: iOS-style glass header */}
       <div className="md:hidden w-full px-4 py-3 flex items-center justify-between bg-background/80 backdrop-blur-xl border-b border-border/10 sticky top-0"
         style={{ paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))" }}>
         <div className="flex items-center gap-3">
           {nav && nav.length > 0 && (
             <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
               <SheetTrigger asChild>
                 <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-muted/40 border border-border/10 shadow-sm active:scale-90 transition-transform" aria-label="Abrir menu">
                   <List size={20} weight="bold" className="text-foreground/90" />
                 </Button>
               </SheetTrigger>
               <SheetContent side="left" className="p-0 w-[85vw] max-w-[320px] border-r border-border/10 bg-background flex flex-col h-full shadow-2xl">
                 <SidebarContent onItemClick={() => setSidebarOpen(false)} />
               </SheetContent>
             </Sheet>
           )}
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary leading-none mb-1 opacity-80">AloClínica</span>
             <h1 className="text-[17px] font-bold text-foreground leading-none tracking-tight">{title}</h1>
           </div>
         </div>
 
         <div className="flex items-center gap-2">
           <LanguageSwitcher />
           <NotificationBell />
           <button
             onClick={() => navigate("/dashboard/profile")}
             aria-label="Abrir meu perfil"
             className="relative p-0.5 rounded-full ring-2 ring-primary/20 transition-transform active:scale-95"
           >
             <Avatar className="h-8 w-8">
               {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
               <AvatarFallback className={`bg-gradient-to-br ${grad} text-white text-[10px] font-bold`}>{initials}</AvatarFallback>
             </Avatar>
           </button>
         </div>
       </div>

        {/* Desktop: standard header */}
        <div className="hidden md:flex w-full items-center px-4 h-14 gap-3">
          {nav && nav.length > 0 && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 rounded-xl" aria-label="Abrir menu">
                  <List className="w-4.5 h-4.5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px] border-border/20 bg-background flex flex-col h-full">
                <SidebarContent onItemClick={() => setSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
          )}

          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={mascotImg} alt="AloClínica" className="w-8 h-8 object-contain select-none shrink-0"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.15))" }} />
            <span className="font-bold text-foreground text-sm tracking-tight">AloClínica</span>
          </Link>

          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
            className="flex flex-1 max-w-xs items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50 hover:bg-muted/80 text-xs text-muted-foreground transition-all group"
            aria-label="Buscar">
            <MagnifyingGlass className="w-3.5 h-3.5 group-hover:text-foreground transition-colors shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="font-mono text-[10px] bg-background border border-border/40 rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
          </button>

          <div className="flex-1" />

          {isAdminViewingOtherPanel && (
            <Button variant="outline" size="sm"
              className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/8 rounded-xl"
              onClick={() => navigate("/dashboard")}>
              <ShieldCheckIcon className="w-3.5 h-3.5" aria-hidden="true" /> Admin
            </Button>
          )}

          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="group flex items-center gap-2 h-9 pl-0.5 pr-2.5 rounded-xl hover:bg-muted/60 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <div className="relative">
                    <Avatar className={`h-7 w-7 ring-2 ${avatarRing}`}>
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                      <AvatarFallback className={`bg-gradient-to-br ${grad} text-white text-[10px] font-bold`}>{initials}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[hsl(var(--success))] border-[1.5px] border-background" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-medium text-foreground max-w-[90px] truncate">{profile?.first_name ?? "Usuário"}</span>
                  <CaretDown className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-2xl border-border/20 shadow-elevated p-2 backdrop-blur-xl bg-popover/95">
                <div className="flex items-center gap-3 px-2 py-3 mb-1">
                  <Avatar className="h-11 w-11 ring-2 ring-primary/15 shadow-sm">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                    <AvatarFallback className={`bg-gradient-to-br ${grad} text-white text-sm font-bold`}>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-foreground truncate leading-tight">{fullName}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">{ROLE_LABELS[role] ?? title}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="bg-border/10 -mx-2" />
                <div className="py-1 space-y-0.5">
                  <DropdownMenuItem onClick={() => navigate("/dashboard/profile")} className="rounded-xl gap-3 cursor-pointer text-[13px] py-2.5 px-2.5 focus:bg-primary/8">
                    <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10"><User className="h-3.5 w-3.5 text-primary" /></span>
                    <span className="font-medium">Meu Perfil</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/dashboard/settings")} className="rounded-xl gap-3 cursor-pointer text-[13px] py-2.5 px-2.5 focus:bg-muted">
                    <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted"><GearSix className="h-3.5 w-3.5 text-muted-foreground" /></span>
                    <span className="font-medium">Configurações</span>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="bg-border/10 -mx-2" />
                <div className="pt-1">
                  <DropdownMenuItem onClick={handleSignOut} className="rounded-xl gap-3 cursor-pointer text-[13px] py-2.5 px-2.5 text-destructive focus:text-destructive focus:bg-destructive/8">
                    <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-destructive/10"><SignOut className="h-3.5 w-3.5" /></span>
                    <span className="font-medium">Sair</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 relative h-[calc(100vh-3.5rem)]">
        {nav && nav.length > 0 && (
          <aside className={`hidden md:flex shrink-0 flex-col bg-background border-r border-sidebar-border shadow-[2px_0_12px_rgba(0,0,0,.06)] h-full overflow-hidden transition-all duration-200 ${
            sidebarCollapsed ? "w-[52px]" : "w-56 lg:w-64 xl:w-72"
          }`}>
            <SidebarContent collapsed={sidebarCollapsed} />
            {/* Collapse toggle */}
            <div className={`shrink-0 border-t border-border/10 ${sidebarCollapsed ? "p-1.5" : "px-2.5 py-1.5"}`}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? "Expandir menu" : "Encolher menu"}
                className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 text-[11px]"
              >
                {sidebarCollapsed
                  ? <SidebarSimple className="w-4 h-4 shrink-0" />
                  : <><ArrowLineLeft className="w-4 h-4 shrink-0" /><span>Encolher</span></>
                }
              </button>
            </div>
          </aside>
        )}
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto pb-[88px] md:pb-10 scroll-smooth">
          <div className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-6 min-h-0 max-w-[1400px] mx-auto w-full"
            style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))", paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))" }}>
            <div className="hidden md:block"><DashboardBreadcrumbs /></div>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>

      <GlobalCommand role={role} />
      <PWABanner role={role} />

       {/* ═══ Mobile bottom nav — Premium Floating TabBar ═══ */}
       {nav && nav.length > 0 && (
         <nav
           className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-[400px]"
           aria-label="Navegação principal"
         >
           <div
             className="relative rounded-[32px] border border-white/20 dark:border-white/10 bg-background/70 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
             style={{ WebkitBackdropFilter: "blur(24px) saturate(180%)" }}
           >
             {/* Glossy overlay effect */}
             <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent pointer-events-none" />
             
             <div className="flex items-center justify-around h-[72px] px-2">
               {bottomNav.map(item => {
                 const activeColor = ROLE_ACTIVE_COLOR[role] ?? ROLE_ACTIVE_COLOR.patient;
                 return (
                   <Link key={item.href} to={item.href}
                     aria-label={item.label}
                     aria-current={item.active ? "page" : undefined}
                     className={`relative flex flex-col items-center justify-center flex-1 h-full select-none transition-all duration-300 ${
                       item.active ? activeColor : "text-muted-foreground/40 hover:text-muted-foreground/60"
                     }`}
                   >
                     {/* Active Glow Effect */}
                     {item.active && (
                       <motion.div
                         layoutId="navGlow"
                         className="absolute inset-0 bg-primary/10 blur-xl rounded-full"
                         transition={{ type: "spring", stiffness: 300, damping: 30 }}
                       />
                     )}
 
                     <div className="relative flex flex-col items-center">
                       {/* Icon Container with animation */}
                       <motion.div
                         animate={item.active ? { scale: 1.1, y: -2 } : { scale: 1, y: 0 }}
                         whileTap={{ scale: 0.9 }}
                         className="relative z-10"
                       >
                         {item.icon}
                         
                         {(item.badge ?? 0) > 0 && (
                           <span className="absolute -top-1 -right-1 text-[8px] font-black min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg ring-2 ring-background">
                             {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                           </span>
                         )}
                       </motion.div>
 
                       {/* Label */}
                       <span className={`text-[10px] mt-1.5 transition-all duration-300 ${
                         item.active ? "font-black opacity-100 tracking-tight" : "font-medium opacity-0 -translate-y-1"
                       }`}>
                         {item.label}
                       </span>
                     </div>
 
                     {/* Active Indicator Line */}
                     {item.active && (
                       <motion.div
                         layoutId="navIndicator"
                         className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-current"
                         transition={{ type: "spring", stiffness: 500, damping: 30 }}
                       />
                     )}
                   </Link>
                 );
               })}
             </div>
           </div>
         </nav>
       )}
    </div>
  );
};

export default DashboardLayout;
