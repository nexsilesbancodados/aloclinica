import {
  SquaresFour, VideoCamera, Wallet, ChartLineUp, Star,
  UserCircleCheck, ClipboardText, UserGear, Users, Stethoscope,
  Buildings, CalendarCheck, ShieldStar,
   Key, Tag, ClockCounterClockwise, WhatsappLogo, Sliders, Pulse,
   PaintBrush, Image as ImageIcon, Heart, CreditCard
   , TestTube
 } from "@phosphor-icons/react";
import { NavIcon } from "@/components/ui/nav-icon";
import { IS_DEV } from "@/lib/constants";

/**
 * Admin sidebar navigation
 * 5 grupos coesos · ordem por frequência de uso · sem itens órfãos
 */
export const getAdminNav = (active: string) => [
  // ── Visão Geral ──
   { label: "Centro Admin", href: "/dashboard/admin/panel-center?role=admin", icon: <NavIcon icon={<SquaresFour size={16} weight="fill" />}    color="blue"   />, active: active === "overview" || active === "panel-center", group: "Visão Geral" },
   { label: "Ao Vivo",      href: "/dashboard/admin/live?role=admin",         icon: <NavIcon icon={<VideoCamera size={16} weight="fill" />}    color="rose"   />, active: active === "live",     group: "Visão Geral" },
   { label: "Saúde Sistema", href: "/dashboard/admin/health?role=admin",      icon: <NavIcon icon={<Pulse size={16} weight="fill" />}       color="emerald" />, active: active === "health", group: "Visão Geral" },
  { label: "Relatórios",  href: "/dashboard/admin/reports?role=admin",      icon: <NavIcon icon={<ChartLineUp size={16} weight="fill" />}    color="cyan"   />, active: active === "reports",  group: "Visão Geral" },
  { label: "NPS",         href: "/dashboard/admin/nps?role=admin",          icon: <NavIcon icon={<Star size={16} weight="fill" />}           color="amber"  />, active: active === "nps",      group: "Visão Geral" },

  // ── Operação ──
  { label: "Aprovações",          href: "/dashboard/admin/approvals?role=admin",           icon: <NavIcon icon={<UserCircleCheck size={16} weight="fill" />} color="emerald" />, active: active === "approvals",           group: "Operação" },
  { label: "Revisão KYC",         href: "/dashboard/admin/kyc-review?role=admin",          icon: <NavIcon icon={<ShieldStar size={16} weight="fill" />}      color="blue"    />, active: active === "kyc-review",          group: "Operação" },
  { label: "SLA Médicos",         href: "/dashboard/admin/sla-medicos?role=admin",         icon: <NavIcon icon={<Stethoscope size={16} weight="fill" />}    color="orange"  />, active: active === "sla-medicos",         group: "Operação" },
  { label: "Solicitações Médicos", href: "/dashboard/admin/doctor-applications?role=admin", icon: <NavIcon icon={<ClipboardText size={16} weight="fill" />}  color="purple"  />, active: active === "doctor-applications", group: "Operação" },
  { label: "Consultas",           href: "/dashboard/admin/appointments?role=admin",        icon: <NavIcon icon={<CalendarCheck size={16} weight="fill" />}  color="blue"    />, active: active === "appointments",        group: "Operação" },
   { label: "Faturamento",         href: "/dashboard/admin/financial?role=admin",           icon: <NavIcon icon={<Wallet size={16} weight="fill" />}         color="green"   />, active: active === "financial",           group: "Operação" },
   { label: "Billing PagBank",     href: "/dashboard/admin/billing?role=admin",             icon: <NavIcon icon={<CreditCard size={16} weight="fill" />}     color="emerald" />, active: active === "billing",             group: "Operação" },

  // ── Pessoas ──
  { label: "Usuários",  href: "/dashboard/admin/users?role=admin",    icon: <NavIcon icon={<UserGear size={16} weight="fill" />}    color="blue"    />, active: active === "users",    group: "Pessoas" },
  { label: "Pacientes", href: "/dashboard/admin/patients?role=admin", icon: <NavIcon icon={<Users size={16} weight="fill" />}       color="cyan"    />, active: active === "patients", group: "Pessoas" },
  { label: "Médicos",   href: "/dashboard/admin/doctors?role=admin",  icon: <NavIcon icon={<Stethoscope size={16} weight="fill" />} color="emerald" />, active: active === "doctors",  group: "Pessoas" },
  { label: "Clínicas",  href: "/dashboard/admin/clinics?role=admin",  icon: <NavIcon icon={<Buildings size={16} weight="fill" />}   color="orange"  />, active: active === "clinics",  group: "Pessoas" },

  // ── Conteúdo ──
  { label: "Especialidades", href: "/dashboard/admin/specialties?role=admin",  icon: <NavIcon icon={<ShieldStar size={16} weight="fill" />} color="cyan"   />, active: active === "specialties",  group: "Conteúdo" },
  { label: "Cupons",         href: "/dashboard/admin/coupons?role=admin",      icon: <NavIcon icon={<Tag size={16} weight="fill" />}         color="orange" />, active: active === "coupons",      group: "Conteúdo" },
   { label: "Cartão Pingo",   href: "/dashboard/admin/pingo-card?role=admin",   icon: <NavIcon icon={<Heart size={16} weight="fill" />}       color="rose"   />, active: active === "pingo-card",   group: "Conteúdo" },
  { label: "Convites",       href: "/dashboard/admin/invite-codes?role=admin", icon: <NavIcon icon={<Key size={16} weight="fill" />}         color="amber"  />, active: active === "invite-codes", group: "Conteúdo" },
  { label: "Site",           href: "/dashboard/admin/site-editor?role=admin",  icon: <NavIcon icon={<PaintBrush size={16} weight="fill" />}  color="purple" />, active: active === "site-editor" || active === "site-config", group: "Conteúdo" },
  { label: "Tema",           href: "/dashboard/admin/theme?role=admin",        icon: <NavIcon icon={<PaintBrush size={16} weight="fill" />}  color="rose"   />, active: active === "theme",        group: "Conteúdo" },
  { label: "Mídia",          href: "/dashboard/admin/media?role=admin",        icon: <NavIcon icon={<ImageIcon size={16} weight="fill" />}   color="purple" />, active: active === "media",        group: "Conteúdo" },

  // ── Sistema ──
   { label: "WhatsApp",      href: "/dashboard/admin/whatsapp?role=admin", icon: <NavIcon icon={<WhatsappLogo size={16} weight="fill" />}          color="green" />, active: active === "whatsapp", group: "Sistema" },
   { label: "PagBank",        href: "/dashboard/admin/financial?role=admin",    icon: <NavIcon icon={<CreditCard size={16} weight="fill" />}  color="blue" />, active: active === "financial", group: "Sistema" },
  // Teste Pagamento cria cobranças reais — só aparece no menu em dev.
  // Em prod, admin acessa diretamente via URL com ?test=1.
  ...(IS_DEV ? [{ label: "Teste Pagamento", href: "/dashboard/admin/payment-test?role=admin&test=1", icon: <NavIcon icon={<TestTube size={16} weight="fill" />} color="amber" />, active: active === "payment-test", group: "Sistema" }] : []),
  { label: "Histórico",     href: "/dashboard/admin/logs?role=admin",     icon: <NavIcon icon={<ClockCounterClockwise size={16} weight="fill" />} color="slate" />, active: active === "logs",     group: "Sistema" },
  { label: "Plataforma",    href: "/dashboard/admin/platform-settings?role=admin", icon: <NavIcon icon={<Sliders size={16} weight="fill" />}        color="slate" />, active: active === "platform-settings", group: "Sistema" },
  { label: "Templates Notif.", href: "/dashboard/admin/notification-templates?role=admin", icon: <NavIcon icon={<WhatsappLogo size={16} weight="fill" />} color="blue" />, active: active === "notification-templates", group: "Sistema" },
  { label: "Segurança",  href: "/dashboard/admin/security?role=admin",          icon: <NavIcon icon={<ShieldStar size={16} weight="fill" />}    color="rose"  />, active: active === "security",          group: "Sistema" },
  { label: "LGPD Exports",  href: "/dashboard/admin/lgpd-exports?role=admin",   icon: <NavIcon icon={<ShieldStar size={16} weight="fill" />}    color="cyan"  />, active: active === "lgpd-exports",      group: "Sistema" },
  { label: "Configurações", href: "/dashboard/settings?role=admin",       icon: <NavIcon icon={<Sliders size={16} weight="fill" />}               color="slate" />, active: active === "settings", group: "Sistema" },
];
