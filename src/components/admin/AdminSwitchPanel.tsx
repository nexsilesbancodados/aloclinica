import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "@/components/admin/adminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const panelOptions = [
  { label: "Paciente", role: "patient", icon: "👤", description: "Agendamentos, planos e histórico médico" },
  { label: "Médico", role: "doctor", icon: "🩺", description: "Agenda, prontuários e ganhos" },
  { label: "Recepção", role: "receptionist", icon: "🏥", description: "Check-in, agendas e faturamento" },
  { label: "Suporte", role: "support", icon: "🎧", description: "Logs, usuários e chat de atendimento" },
  { label: "Clínica", role: "clinic", icon: "🏢", description: "Gestão de médicos vinculados" },
  { label: "Parceiro", role: "partner", icon: "🤝", description: "Validação de receitas e relatórios" },
  { label: "Assistente IA", role: "ai-assistant", icon: "🤖", description: "Chat inteligente com IA contextual" },
];

const AdminSwitchPanel = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("switch-panel")}>
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel Admin
        </Button>
        <h1 className="text-2xl font-bold text-foreground mb-1">Trocar Painel</h1>
        <p className="text-muted-foreground mb-6">Acesse a visão de qualquer perfil da plataforma</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {panelOptions.map((opt) => (
            <Card
              key={opt.role}
              className="card-interactive border-border hover:border-primary/50 cursor-pointer group"
              onClick={() => navigate(opt.role === "ai-assistant" ? "/dashboard/ai-assistant" : `/dashboard?role=${opt.role}`)}
            >
              <CardContent className="pt-6 pb-5 text-center">
                <span className="text-4xl mb-3 block">{opt.icon}</span>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{opt.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminSwitchPanel;
