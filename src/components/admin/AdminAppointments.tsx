import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Search, Video, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";
import type { AdminAppointmentRow } from "@/types/domain";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

const statusLabel: Record<string, string> = {
  scheduled: "Agendada", waiting: "Esperando", in_progress: "Em andamento",
  completed: "Concluída", cancelled: "Cancelada", no_show: "Ausente",
};
const statusVariant: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  scheduled: "outline", waiting: "secondary", in_progress: "default",
  completed: "default", cancelled: "destructive", no_show: "destructive",
};

const AdminAppointments = () => {
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState("all");
  const [liveCount, setLiveCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const pg = usePagination({ pageSize: 25 });

  useEffect(() => { fetchAppointments(); }, [pg.page, pg.pageSize, filterStatus, debouncedSearch]);

  // Realtime updates
  useEffect(() => {
    const channel = db
      .channel("admin-appts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        fetchAppointments();
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    let query = db.from("appointments")
      .select("id, scheduled_at, status, patient_id, doctor_id, duration_minutes, notes, appointment_type", { count: "exact" })
      .order("scheduled_at", { ascending: false });
    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    const { data, count } = await query.range(pg.from, pg.to);
    if (!data) { setLoading(false); return; }
    pg.setTotal(count ?? 0);

    // Realtime counts (rápidos, separados da paginação)
    const { count: liveC } = await db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "in_progress");
    const { count: waitingC } = await db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "waiting");
    setLiveCount(liveC ?? 0);
    setWaitingCount(waitingC ?? 0);

    const patientIds = [...new Set(data.map(a => a.patient_id).filter((id): id is string => Boolean(id)))];
    const doctorIds = [...new Set(data.map(a => a.doctor_id))];
    const [pRes, dRes] = await Promise.all([
      patientIds.length > 0 ? db.from("profiles").select("user_id, first_name, last_name").in("user_id", patientIds.filter((id): id is string => id !== null)) : { data: [] as any[] },
      db.from("doctor_profiles").select("id, user_id").in("id", doctorIds),
    ]);
    const pMap = new Map((pRes.data ?? []).map(p => [p.user_id, `${p.first_name} ${p.last_name}`]));
    const docUserIds = (dRes.data ?? []).map(d => d.user_id);
    const { data: docProfiles } = docUserIds.length > 0
      ? await db.from("profiles").select("user_id, first_name, last_name").in("user_id", docUserIds)
      : { data: [] };
    const docMap = new Map<string, string>();
    (dRes.data ?? []).forEach(d => {
      const p = docProfiles?.find(pr => pr.user_id === d.user_id);
      if (p) docMap.set(d.id, `${p.first_name} ${p.last_name}`);
    });

    setAppointments(data.map(a => ({ ...a, patient_name: pMap.get(a.patient_id!) ?? "—", doctor_name: docMap.get(a.doctor_id) ?? "—" })));
    setLoading(false);
  };

  const typeLabel: Record<string, string> = {
    first_visit: "1ª Consulta", return: "Retorno", urgency: "Urgência",
  };

  const filtered = appointments.filter(a => {
    const matchSearch = `${a.patient_name} ${a.doctor_name}`.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("appointments")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={Video}
          eyebrow="Operação"
          title="Consultas"
          description="Acompanhe consultas agendadas, em andamento e finalizadas."
          accent="from-blue-500 to-indigo-600"
          badge={{ label: `${filtered.length} ${filtered.length === 1 ? "consulta" : "consultas"}`, tone: "info" }}
        />

        {/* Live indicators */}
        <div className="flex gap-3">
          <Card className="border-border flex-1">
            <CardContent className="p-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <Video className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{liveCount} ao vivo</span>
            </CardContent>
          </Card>
          <Card className="border-border flex-1">
            <CardContent className="p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-foreground">{waitingCount} na fila</span>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar paciente ou médico..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="scheduled">Agendada</SelectItem>
              <SelectItem value="waiting">Esperando</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
              <SelectItem value="no_show">Ausente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? <div className="shimmer-v2 h-5 rounded w-32 inline-block" aria-label="Carregando" /> : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto -mx-0.5 rounded-xl">

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden sm:table-cell">Médico</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="hidden lg:table-cell">Duração</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(a => (
                  <TableRow key={a.id} className={a.status === "in_progress" ? "bg-primary/5" : a.status === "waiting" ? "bg-secondary/5" : ""}>
                    <TableCell data-label="Paciente" className="font-medium text-foreground">{a.patient_name}</TableCell>
                    <TableCell data-label="Médico" className="hidden sm:table-cell text-muted-foreground">Dr(a). {a.doctor_name}</TableCell>
                    <TableCell data-label="Data" className="text-muted-foreground">{format(new Date(a.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell data-label="Tipo" className="hidden md:table-cell">
                      {a.appointment_type && (
                        <Badge variant="outline" className="text-xs">
                          {typeLabel[a.appointment_type] ?? a.appointment_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="Duração" className="hidden lg:table-cell text-muted-foreground">{a.duration_minutes || 30} min</TableCell>
                    <TableCell data-label="Status">
                      <Badge variant={statusVariant[a.status] ?? "outline"}>
                        {a.status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-white mr-1 shimmer-v2 inline-block" />}
                        {statusLabel[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma consulta.</TableCell></TableRow>}
              </TableBody>
            </Table>
            </div>
            <PaginationBar pg={pg} noun="consultas" className="px-3 py-2 border-t border-border/40" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminAppointments;
