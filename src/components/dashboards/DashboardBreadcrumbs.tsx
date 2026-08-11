import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Painel",
  profile: "Perfil",
  settings: "Configurações",
  schedule: "Agendar",
  appointments: "Agendamentos",
  prescriptions: "Receitas",
  patients: "Pacientes",
  earnings: "Financeiro",
  availability: "Disponibilidade",
  consultations: "Consultas",
  health: "Saúde",
  documents: "Documentos",
  "payment-history": "Pagamentos",
  "waiting-room": "Sala de Espera",
  calendar: "Calendário",
  admin: "Admin",
  doctor: "Médico",
  patient: "Paciente",
  users: "Usuários",
  doctors: "Médicos",
  clinics: "Clínicas",
  plans: "Planos",
  subscriptions: "Assinaturas",
  approvals: "Aprovações",
  reports: "Relatórios",
  logs: "Logs",
  specialties: "Especialidades",
  nps: "NPS",
  whatsapp: "WhatsApp",
  "invite-codes": "Convites",
  support: "Suporte",
  billing: "Faturamento",
  checkin: "Check-in",
  schedules: "Agendas",
  reception: "Recepção",
  clinic: "Clínica",
  
  "simple-prescription": "Receituário",
  certificates: "Atestados",
  "on-duty": "Plantão 24h",
  "renewal-queue": "Renovações",
  wallet: "Carteira",
  chat: "Chat",
  "ai-assistant": "IA Assistente",
  "panel-center": "Centro de Painéis",
  financial: "Financeiro",
  coupons: "Cupons",
  live: "Ao Vivo",
  queue: "Fila",
  financeiro: "Financeiro",
  "exam-request": "Solicitar Exame",
  "my-exams": "Meus Exames",
  "doctor-applications": "Candidaturas",
  inbox: "Caixa de Entrada",
  online: "Online",
  audit: "Auditoria",
  validate: "Validar",
  history: "Histórico",
  conversion: "Conversão",
  calls: "Chamadas",
  records: "Prontuários",
  messages: "Mensagens",
  book: "Agendar",
  "urgent-care": "Pronto Atendimento",
  "prescription-renewal": "Renovação",
  "exam-results": "Resultados",
  
  dependents: "Dependentes",
  diary: "Diário",
  timeline: "Linha do Tempo",
};

const ROLE_LABELS: Record<string, string> = {
  doctor: "Médico",
  patient: "Paciente",
  admin: "Admin",
  clinic: "Clínica",
  receptionist: "Recepção",
  support: "Suporte",
  partner: "Parceiro",
};

const DashboardBreadcrumbs = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role");
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  // Skip UUID segments from breadcrumbs
  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}/.test(s);

  const crumbs = segments
    .filter(seg => !isUUID(seg))
    .map((seg, i, arr) => ({
      label: ROUTE_LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
      path: "/" + segments.slice(0, segments.indexOf(seg) + 1).join("/"),
      isLast: i === arr.length - 1,
    }));

  return (
    <nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-xs mb-5 flex-wrap">
      <Link
        to={`/dashboard${role ? `?role=${role}` : ""}`}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="p-1 rounded-md bg-primary/10">
          <Home className="w-3 h-3 text-primary" />
        </div>
      </Link>

      {role && (
        <span className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-muted-foreground font-medium">
            {ROLE_LABELS[role] || role}
          </span>
        </span>
      )}

      {crumbs.slice(1).map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          {crumb.isLast ? (
            <span className="font-semibold text-foreground bg-foreground/5 px-2 py-0.5 rounded-md">
              {crumb.label}
            </span>
          ) : (
            <Link
              to={`${crumb.path}${role ? `?role=${role}` : ""}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
};

export default DashboardBreadcrumbs;
