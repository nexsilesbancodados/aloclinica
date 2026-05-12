import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home, Calendar, FileText, Heart, CreditCard, Upload, Users, DollarSign,
  Clock, Settings, User, LogOut, Video, BarChart3, Keyboard, Bot,
  ShieldCheck, Bell, Headset, Building2, Stethoscope, Eye, ScanFace,
  Sun, Moon, Monitor,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  group: string;
  shortcut?: string;
}

const getNavItems = (role: string): NavItem[] => {
  const base: NavItem[] = [
    { label: "Meu Perfil", href: "/dashboard/profile", icon: <User className="w-4 h-4" />, group: "Conta", shortcut: "G P" },
    { label: "Configurações", href: "/dashboard/settings", icon: <Settings className="w-4 h-4" />, group: "Conta" },
    { label: "Assistente IA", href: "/dashboard/ai-assistant", icon: <Bot className="w-4 h-4" />, group: "Conta" },
  ];

  if (role === "patient") return [
    { label: "Início", href: "/dashboard", icon: <Home className="w-4 h-4" />, group: "Paciente", shortcut: "G D" },
    { label: "Agendar Consulta", href: "/dashboard/schedule", icon: <Calendar className="w-4 h-4" />, group: "Paciente", shortcut: "N" },
    { label: "Meus Agendamentos", href: "/dashboard/appointments", icon: <Clock className="w-4 h-4" />, group: "Paciente" },
    { label: "Urgência — Falar Agora", href: "/dashboard/schedule?urgency=true", icon: <Video className="w-4 h-4" />, group: "Paciente" },
    { label: "Minha Saúde", href: "/dashboard/patient/health", icon: <Heart className="w-4 h-4" />, group: "Paciente" },
    { label: "Enviar Exames", href: "/dashboard/patient/documents", icon: <Upload className="w-4 h-4" />, group: "Paciente" },
    { label: "Histórico de Pagamentos", href: "/dashboard/payment-history", icon: <CreditCard className="w-4 h-4" />, group: "Paciente" },
    ...base,
  ];

  if (role === "doctor") return [
    { label: "Início", href: "/dashboard", icon: <Home className="w-4 h-4" />, group: "Médico", shortcut: "G D" },
    { label: "Consultas", href: "/dashboard/doctor/consultations", icon: <Clock className="w-4 h-4" />, group: "Médico" },
    { label: "Sala de Espera", href: "/dashboard/doctor/waiting-room", icon: <Video className="w-4 h-4" />, group: "Médico" },
    { label: "Receitas / Prescrições", href: "/dashboard/prescriptions", icon: <FileText className="w-4 h-4" />, group: "Médico" },
    { label: "Pacientes", href: "/dashboard/patients", icon: <Users className="w-4 h-4" />, group: "Médico" },
    { label: "Financeiro / Ganhos", href: "/dashboard/earnings", icon: <DollarSign className="w-4 h-4" />, group: "Médico" },
    { label: "Disponibilidade", href: "/dashboard/availability", icon: <Calendar className="w-4 h-4" />, group: "Médico" },
    ...base,
  ];

  if (role === "admin") return [
    { label: "Painel Admin", href: "/dashboard", icon: <BarChart3 className="w-4 h-4" />, group: "Admin", shortcut: "G D" },
    { label: "Aprovações", href: "/dashboard/admin/approvals", icon: <ShieldCheck className="w-4 h-4" />, group: "Admin" },
    { label: "Usuários", href: "/dashboard/admin/users", icon: <Users className="w-4 h-4" />, group: "Admin" },
    { label: "Pacientes", href: "/dashboard/admin/patients", icon: <User className="w-4 h-4" />, group: "Admin" },
    { label: "Médicos", href: "/dashboard/admin/doctors", icon: <Stethoscope className="w-4 h-4" />, group: "Admin" },
    { label: "Clínicas", href: "/dashboard/admin/clinics", icon: <Building2 className="w-4 h-4" />, group: "Admin" },
    { label: "Agendamentos", href: "/dashboard/admin/appointments", icon: <Calendar className="w-4 h-4" />, group: "Admin" },
    { label: "Financeiro", href: "/dashboard/admin/financial", icon: <DollarSign className="w-4 h-4" />, group: "Admin" },
    { label: "KYC Review", href: "/dashboard/admin/kyc", icon: <ScanFace className="w-4 h-4" />, group: "Admin" },
    { label: "Logs", href: "/dashboard/admin/logs", icon: <FileText className="w-4 h-4" />, group: "Admin" },
    { label: "Configurações da Plataforma", href: "/dashboard/admin/platform-settings", icon: <Settings className="w-4 h-4" />, group: "Admin" },
    ...base,
  ];

  if (role === "support") return [
    { label: "Painel Suporte", href: "/dashboard", icon: <Headset className="w-4 h-4" />, group: "Suporte", shortcut: "G D" },
    { label: "Conversas", href: "/dashboard/chat", icon: <Headset className="w-4 h-4" />, group: "Suporte" },
    { label: "Avisos", href: "/dashboard/notifications", icon: <Bell className="w-4 h-4" />, group: "Suporte" },
    ...base,
  ];

  if (role === "clinic") return [
    { label: "Painel Clínica", href: "/dashboard", icon: <Building2 className="w-4 h-4" />, group: "Clínica", shortcut: "G D" },
    { label: "Médicos da Clínica", href: "/dashboard/clinic/doctors", icon: <Stethoscope className="w-4 h-4" />, group: "Clínica" },
    { label: "Agenda", href: "/dashboard/clinic/agenda", icon: <Calendar className="w-4 h-4" />, group: "Clínica" },
    { label: "Financeiro", href: "/dashboard/clinic/financial", icon: <DollarSign className="w-4 h-4" />, group: "Clínica" },
    ...base,
  ];

  if (role === "ophthalmologist") return [
    { label: "Início", href: "/dashboard", icon: <Eye className="w-4 h-4" />, group: "Oftalmologia", shortcut: "G D" },
    { label: "Pacientes", href: "/dashboard/patients", icon: <Users className="w-4 h-4" />, group: "Oftalmologia" },
    { label: "Receitas", href: "/dashboard/prescriptions", icon: <FileText className="w-4 h-4" />, group: "Oftalmologia" },
    { label: "Disponibilidade", href: "/dashboard/availability", icon: <Calendar className="w-4 h-4" />, group: "Oftalmologia" },
    ...base,
  ];

  if (role === "laudista") return [
    { label: "Início", href: "/dashboard", icon: <Home className="w-4 h-4" />, group: "Laudista", shortcut: "G D" },
    { label: "Fila de laudos", href: "/dashboard/laudista/queue", icon: <FileText className="w-4 h-4" />, group: "Laudista" },
    { label: "Meus laudos", href: "/dashboard/laudista/reports", icon: <FileText className="w-4 h-4" />, group: "Laudista" },
    { label: "Financeiro", href: "/dashboard/laudista/financeiro", icon: <DollarSign className="w-4 h-4" />, group: "Laudista" },
    ...base,
  ];

  return base;
};

interface GlobalCommandProps {
  role?: string;
}

const GlobalCommand = ({ role = "patient" }: GlobalCommandProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const items = getNavItems(role);
  const groups = [...new Set(items.map(i => i.group))];

  const handleSelect = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate("/");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar seção, funcionalidade..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {groups.map(group => (
          <CommandGroup key={group} heading={group}>
            {items.filter(i => i.group === group).map(item => (
              <CommandItem
                key={item.href}
                onSelect={() => handleSelect(item.href)}
                className="cursor-pointer"
              >
                <span className="mr-2 text-muted-foreground">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="ml-auto text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                    {item.shortcut}
                  </kbd>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Aparência">
          <CommandItem onSelect={() => { setTheme("light"); setOpen(false); }} className="cursor-pointer">
            <Sun className="w-4 h-4 mr-2" />
            Tema claro
            {theme === "light" && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
          </CommandItem>
          <CommandItem onSelect={() => { setTheme("dark"); setOpen(false); }} className="cursor-pointer">
            <Moon className="w-4 h-4 mr-2" />
            Tema escuro
            {theme === "dark" && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
          </CommandItem>
          <CommandItem onSelect={() => { setTheme("system"); setOpen(false); }} className="cursor-pointer">
            <Monitor className="w-4 h-4 mr-2" />
            Tema do sistema
            {theme === "system" && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Atalhos">
          <CommandItem className="text-muted-foreground text-xs" disabled>
            <Keyboard className="w-4 h-4 mr-2" />
            Pressione ? para ver todos os atalhos
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Sessão">
          <CommandItem onSelect={handleSignOut} className="cursor-pointer text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Sair da conta
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default GlobalCommand;
