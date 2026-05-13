import {
  House, MagnifyingGlass, Lightning, CalendarCheck, ChatCircleDots,
  Headset, CreditCard, Sliders, UserCircle, Heart, FileText,
  ClipboardText, Upload, BookOpen, Users, Bell, Shield,
  IdentificationCard, Syringe, FirstAid, Eye, Receipt
} from "@phosphor-icons/react";
import { NavIcon } from "@/components/ui/nav-icon";

 export const getPatientNav = (active: string) => [
   // ── Principal ──
   { label: "Início", href: "/dashboard?role=patient", icon: <NavIcon icon={<House size={16} weight="fill" />} color="blue" />, active: active === "home", group: "Principal" },
   { label: "Consultas", href: "/dashboard/appointments?role=patient", icon: <NavIcon icon={<CalendarCheck size={16} weight="fill" />} color="blue" />, active: active === "appointments", group: "Principal" },
   { label: "Urgência", href: "/dashboard/urgent-care?role=patient", icon: <NavIcon icon={<Lightning size={16} weight="fill" />} color="amber" />, active: active === "urgent-care", group: "Principal" },
   { label: "Agendar", href: "/dashboard/schedule?role=patient", icon: <NavIcon icon={<MagnifyingGlass size={16} weight="fill" />} color="cyan" />, active: active === "schedule" || active === "doctors", group: "Principal" },
 
   // ── Saúde Digital ──
   { label: "Minha Saúde", href: "/dashboard/patient/health?role=patient", icon: <NavIcon icon={<Heart size={16} weight="fill" />} color="rose" />, active: active === "health", group: "Saúde Digital" },
   { label: "Receitas", href: "/dashboard/history?role=patient", icon: <NavIcon icon={<FileText size={16} weight="fill" />} color="emerald" />, active: active === "history", group: "Saúde Digital" },
   { label: "Exames", href: "/dashboard/patient/exam-results?role=patient", icon: <NavIcon icon={<ClipboardText size={16} weight="fill" />} color="purple" />, active: active === "exam-results", group: "Saúde Digital" },
   { label: "Enviar Exames", href: "/dashboard/patient/documents?role=patient", icon: <NavIcon icon={<Upload size={16} weight="fill" />} color="cyan" />, active: active === "documents", group: "Saúde Digital" },
   { label: "Renovar Receita", href: "/dashboard/prescription-renewal?role=patient", icon: <NavIcon icon={<BookOpen size={16} weight="fill" />} color="emerald" />, active: active === "renewal", group: "Saúde Digital" },
 
   // ── Financeiro & Notificações ──
   { label: "Pagamentos", href: "/dashboard/payment-history?role=patient", icon: <NavIcon icon={<CreditCard size={16} weight="fill" />} color="green" />, active: active === "payments", group: "Financeiro & Alertas" },
   { label: "Recibos IRPF", href: "/dashboard/recibos?role=patient", icon: <NavIcon icon={<Receipt size={16} weight="fill" />} color="emerald" />, active: active === "recibos", group: "Financeiro & Alertas" },
   { label: "Avisos", href: "/dashboard/notifications?role=patient", icon: <NavIcon icon={<Bell size={16} weight="fill" />} color="blue" />, active: active === "notifications", group: "Financeiro & Alertas" },
   { label: "Suporte", href: "/dashboard/patient/support?role=patient", icon: <NavIcon icon={<Headset size={16} weight="fill" />} color="emerald" />, active: active === "support", group: "Financeiro & Alertas" },
   { label: "Chat", href: "/dashboard/chat?role=patient", icon: <NavIcon icon={<ChatCircleDots size={16} weight="fill" />} color="blue" />, active: active === "chat", group: "Financeiro & Alertas" },
 
   // ── Conta ──
   { label: "Meu Perfil", href: "/dashboard/profile?role=patient", icon: <NavIcon icon={<UserCircle size={16} weight="fill" />} color="blue" />, active: active === "profile", group: "Conta" },
   { label: "Configurações", href: "/dashboard/settings?role=patient", icon: <NavIcon icon={<Sliders size={16} weight="fill" />} color="slate" />, active: active === "settings", group: "Conta" },
   { label: "Privacidade", href: "/dashboard/patient/lgpd?role=patient", icon: <NavIcon icon={<Shield size={16} weight="fill" />} color="amber" />, active: active === "lgpd", group: "Conta" },
 ];
