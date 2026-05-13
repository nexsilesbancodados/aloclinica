import { SquaresFour, ClipboardText, FileText, Wallet, UserCircle, Notepad } from "@phosphor-icons/react";
import { NavIcon } from "@/components/ui/nav-icon";

export const getLaudistaNav = (active: string) => [
  { label: "Início", href: "/dashboard/laudista?role=laudista", icon: <NavIcon icon={<SquaresFour size={16} weight="fill" />} color="blue" />, active: active === "home", group: "Principal" },
  // { label: "Fila de Exames", href: "/dashboard/laudista/queue?role=laudista", icon: <NavIcon icon={<ClipboardText size={16} weight="fill" />} color="cyan" />, active: active === "queue", group: "Principal" },
  // { label: "Meus Laudos", href: "/dashboard/laudista/my-reports?role=laudista", icon: <NavIcon icon={<FileText size={16} weight="fill" />} color="emerald" />, active: active === "my-reports", group: "Principal" },
  // { label: "Financeiro", href: "/dashboard/laudista/financeiro?role=laudista", icon: <NavIcon icon={<Wallet size={16} weight="fill" />} color="green" />, active: active === "financeiro", group: "Financeiro" },
  { label: "Templates", href: "/dashboard/laudista/templates?role=laudista", icon: <NavIcon icon={<Notepad size={16} weight="fill" />} color="emerald" />, active: active === "templates", group: "Conteúdo" },
  { label: "Meu Perfil", href: "/dashboard/profile?role=laudista", icon: <NavIcon icon={<UserCircle size={16} weight="fill" />} color="blue" />, active: active === "profile", group: "Conta" },
];
