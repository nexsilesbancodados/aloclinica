/**
 * Trilha LGPD — paciente vê quem acessou seus dados.
 *
 * Consulta activity_logs filtrando por eventos cujo entity_id pertence ao
 * paciente (suas consultas, prescrições, prontuários). Mostra:
 *   - quando aconteceu
 *   - quem acessou (médico, admin, sistema)
 *   - o quê (tipo de dado e ação)
 *   - opcional: motivo via consent_reference
 *
 * O paciente pode exportar o histórico (botão de download CSV).
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldCheck, Download, Activity, FileText, Pill, Eye, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logError } from "@/lib/logger";
import { exportCSV } from "@/lib/csvExport";

type LogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
  consent_reference: string | null;
  actor_name?: string;
};

const ENTITY_ICON: Record<string, any> = {
  prescription: Pill,
  consultation_notes: FileText,
  appointment: Calendar,
  medical_record: FileText,
};

const ACTION_LABEL: Record<string, string> = {
  view: "Visualização",
  read: "Visualização",
  download: "Download",
  export: "Exportação",
  print: "Impressão",
  update: "Alteração",
  create: "Criação",
  delete: "Exclusão",
};

const AccessLog = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true); setError(false);
      try {
        // 1) Coleta IDs do paciente (consultas/prescrições) para filtrar acessos
        const [{ data: appts }, { data: rxs }] = await Promise.all([
          db.from("appointments").select("id").eq("patient_id", user.id).limit(500),
          db.from("prescriptions").select("id").eq("patient_id", user.id).limit(500),
        ]);
        const apptIds = new Set((appts ?? []).map((a: any) => a.id));
        const rxIds = new Set((rxs ?? []).map((r: any) => r.id));
        const allIds = [...apptIds, ...rxIds];

        // 2) Busca logs onde entity_id é um dos meus, OU user_id é o meu (minhas próprias ações),
        //    ou ainda quando o entity_id aponta para meu próprio user_id (acesso ao EMR/prontuário do paciente)
        const filters: string[] = [`user_id.eq.${user.id}`, `entity_id.eq.${user.id}`];
        if (allIds.length) filters.push(`entity_id.in.(${allIds.join(",")})`);

        const { data, error: e } = await db.from("activity_logs")
          .select("id, user_id, action, entity_type, entity_id, metadata, created_at, consent_reference")
          .or(filters.join(","))
          .order("created_at", { ascending: false })
          .limit(200);
        if (e) throw e;
        const list = (data ?? []) as LogRow[];

        // 3) Enriquece com nome do ator (médico/admin)
        const actorIds = [...new Set(list.map((l) => l.user_id).filter(Boolean))] as string[];
        if (actorIds.length) {
          const { data: profs } = await db.from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", actorIds);
          const nameMap = new Map<string, string>((profs ?? []).map((p: any) => [p.user_id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
          list.forEach((l) => { if (l.user_id) l.actor_name = nameMap.get(l.user_id) || ""; });
        }

        setLogs(list);
      } catch (e) {
        logError("AccessLog load", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleExport = () => {
    if (!logs.length) return;
    exportCSV<LogRow>("trilha-acesso-aloclinica.csv", logs, [
      { key: "created_at", header: "Data", format: (_v, r) => format(new Date(r.created_at), "yyyy-MM-dd HH:mm") },
      { key: "actor_name", header: "Quem acessou", format: (_v, r) => r.actor_name || (r.user_id === user?.id ? "Você" : r.user_id || "Sistema") },
      { key: "action", header: "Ação", format: (_v, r) => ACTION_LABEL[r.action] || r.action },
      { key: "entity_type", header: "Tipo de dado", format: (_v, r) => r.entity_type || "—" },
      { key: "entity_id", header: "Referência", format: (_v, r) => r.entity_id || "" },
      { key: "consent_reference", header: "Motivo do acesso", format: (_v, r) => r.consent_reference || "" },
    ]);
  };

  const grouped = useMemo(() => {
    const g = new Map<string, LogRow[]>();
    for (const l of logs) {
      const day = format(new Date(l.created_at), "dd 'de' MMMM yyyy", { locale: ptBR });
      g.set(day, [...(g.get(day) ?? []), l]);
    }
    return [...g.entries()];
  }, [logs]);

  return (
    <DashboardLayout title="Trilha de acesso" nav={getPatientNav("access-log")} role="patient">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Quem acessou meus dados</h1>
            <p className="text-sm text-muted-foreground">Cada visualização do seu prontuário, receita ou consulta é registrada — em conformidade com a LGPD (art. 18º).</p>
          </div>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handleExport}>
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : error ? (
          <EmptyState variant="error" icon={Activity} title="Não foi possível carregar o histórico"
            description="Tente novamente em alguns instantes." action={{ label: "Recarregar", onClick: () => window.location.reload() }} />
        ) : logs.length === 0 ? (
          <EmptyState icon={Activity} title="Sem registros ainda"
            description="Quando alguém acessar seus dados clínicos, aparecerá aqui automaticamente." />
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">{day}</p>
                <Card>
                  <CardContent className="p-0 divide-y divide-border/30">
                    {items.map((l) => {
                      const Icon = (l.entity_type && ENTITY_ICON[l.entity_type]) || Eye;
                      const actor = l.actor_name?.trim() || (l.user_id === user?.id ? "Você" : "Sistema");
                      return (
                        <div key={l.id} className="p-3.5 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">
                              <span className="font-semibold">{actor}</span>{" "}
                              <span className="text-muted-foreground">— {ACTION_LABEL[l.action] || l.action}</span>
                              {l.entity_type && <span className="text-muted-foreground"> · {l.entity_type}</span>}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(new Date(l.created_at), "HH:mm")}
                              {l.consent_reference ? ` · motivo: ${l.consent_reference}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Mostrando os 200 acessos mais recentes. Para histórico completo, exporte o CSV.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AccessLog;
