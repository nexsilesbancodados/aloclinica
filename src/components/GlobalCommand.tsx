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
  const accountItems: NavItem[] = [
    { label: "Meu Perfil", href: `/dashboard/profile?role=${role}`, icon: <User className="w-4 h-4" />, group: "Conta", shortcut: "G P" },
    { label: "Configurações", href: `/dashboard/settings?role=${role}`, icon: <Settings className="w-4 h-4" />, group: "Conta" },
  ];
  const base: NavItem[] = [
    ...accountItems,
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
    { label: "Painel Admin", href: "/dashboard/admin/panel-center?role=admin", icon: <BarChart3 className="w-4 h-4" />, group: "Admin", shortcut: "G D" },
    { label: "Centro de Manutenção", href: "/dashboard/admin/maintenance?role=admin", icon: <Settings className="w-4 h-4" />, group: "Admin" },
    { label: "Aprovações", href: "/dashboard/admin/approvals?role=admin", icon: <ShieldCheck className="w-4 h-4" />, group: "Admin" },
    { label: "Usuários", href: "/dashboard/admin/users?role=admin", icon: <Users className="w-4 h-4" />, group: "Admin" },
    { label: "Pacientes", href: "/dashboard/admin/patients?role=admin", icon: <User className="w-4 h-4" />, group: "Admin" },
    { label: "Médicos", href: "/dashboard/admin/doctors?role=admin", icon: <Stethoscope className="w-4 h-4" />, group: "Admin" },
    { label: "Clínicas", href: "/dashboard/admin/clinics?role=admin", icon: <Building2 className="w-4 h-4" />, group: "Admin" },
    { label: "Agendamentos", href: "/dashboard/admin/appointments?role=admin", icon: <Calendar className="w-4 h-4" />, group: "Admin" },
    { label: "Financeiro", href: "/dashboard/admin/financial?role=admin", icon: <DollarSign className="w-4 h-4" />, group: "Admin" },
    { label: "KYC Review", href: "/dashboard/admin/kyc-review?role=admin", icon: <ScanFace className="w-4 h-4" />, group: "Admin" },
    { label: "Logs", href: "/dashboard/admin/logs?role=admin", icon: <FileText className="w-4 h-4" />, group: "Admin" },
    { label: "Configurações da Plataforma", href: "/dashboard/admin/platform-settings?role=admin", icon: <Settings className="w-4 h-4" />, group: "Admin" },
    ...accountItems,
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

  return base;
};

interface GlobalCommandProps {
  role?: string;
}

type DynamicResult = { type: "appt" | "rx" | "patient"; id: string; title: string; subtitle?: string; href: string };

const GlobalCommand = ({ role = "patient" }: GlobalCommandProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DynamicResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const { signOut, user, roles } = useAuth();
  const { setTheme, theme } = useTheme();

  // Busca dinâmica: appointments/receitas/pacientes (debounce 250ms)
  useEffect(() => {
    if (role === "admin" || !open || query.trim().length < 2 || !user) { setResults([]); setSearching(false); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const { db } = await import("@/integrations/supabase/untyped");
        const q = query.trim();
        const isDoctor = roles?.includes("doctor") || roles?.includes("admin");
        const out: DynamicResult[] = [];

        // 1) Consultas — médico vê suas; paciente vê as próprias
        const apptFilter = isDoctor ? { col: "doctor_id", val: user.id } : { col: "patient_id", val: user.id };
        const { data: appts } = await db.from("appointments")
          .select("id, scheduled_at, status, patient_id, doctor_id")
          .eq(apptFilter.col, apptFilter.val)
          .order("scheduled_at", { ascending: false })
          .limit(20);
        const apptIds = (appts ?? []).slice(0, 8);
        const partyIds = [...new Set(apptIds.map((a: any) => isDoctor ? a.patient_id : a.doctor_id).filter(Boolean))] as string[];
        if (partyIds.length) {
          const { data: profs } = await db.from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", partyIds);
          const nameMap = new Map<string, string>((profs ?? []).map((p: any) => [p.user_id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
          for (const a of apptIds as any[]) {
            const other = isDoctor ? a.patient_id : a.doctor_id;
            const name = (other && nameMap.get(other)) || "—";
            if (name.toLowerCase().includes(q.toLowerCase())) {
              out.push({
                type: "appt", id: a.id,
                title: `${isDoctor ? "Consulta com" : "Consulta com Dr(a)."} ${name}`,
                subtitle: new Date(a.scheduled_at).toLocaleString("pt-BR"),
                href: `/dashboard/consultation/${a.id}`,
              });
            }
          }
        }

        // 2) Receitas — pelo diagnóstico
        const { data: rxs } = await db.from("prescriptions")
          .select("id, diagnosis, created_at, patient_id, doctor_id")
          .eq(isDoctor ? "doctor_id" : "patient_id", user.id)
          .ilike("diagnosis", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(5);
        for (const r of (rxs ?? []) as any[]) {
          out.push({
            type: "rx", id: r.id,
            title: `Receita: ${r.diagnosis?.slice(0, 60) || "(sem diagnóstico)"}`,
            subtitle: new Date(r.created_at).toLocaleDateString("pt-BR"),
            href: isDoctor ? `/dashboard/prescriptions/${r.id}` : `/dashboard/patient/prescriptions?appt=${r.id}`,
          });
        }

        // 3) Pacientes (apenas para médico) — busca nominal
        if (isDoctor) {
          const { data: matches } = await db.from("profiles")
            .select("user_id, first_name, last_name")
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
            .limit(8);
          for (const p of (matches ?? []) as any[]) {
            const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
            if (!name) continue;
            out.push({
              type: "patient", id: p.user_id,
              title: name,
              subtitle: "Paciente",
              href: `/dashboard/patients/${p.user_id}/emr`,
            });
          }
        }

        setResults(out.slice(0, 12));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [open, query, role, user?.id, roles?.join(",")]);

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
    <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <CommandInput
        placeholder={role === "admin" ? "Buscar função administrativa..." : (user ? "Buscar paciente, receita, consulta, seção…" : "Buscar seção, funcionalidade...")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{searching ? "Buscando…" : "Nenhum resultado encontrado."}</CommandEmpty>
        {results.length > 0 && (
          <>
            <CommandGroup heading="Resultados">
              {results.map((r) => (
                <CommandItem key={`${r.type}-${r.id}`} onSelect={() => handleSelect(r.href)} className="cursor-pointer">
                  <span className="mr-2 text-muted-foreground text-[10px] uppercase tracking-wider w-12 shrink-0">
                    {r.type === "appt" ? "Consulta" : r.type === "rx" ? "Receita" : "Paciente"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm">{r.title}</p>
                    {r.subtitle && <p className="truncate text-[11px] text-muted-foreground">{r.subtitle}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
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
