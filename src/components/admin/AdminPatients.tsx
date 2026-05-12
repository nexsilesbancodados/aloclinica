import { useState, useEffect, useMemo } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Search, Eye, Edit, Download, ChevronLeft, ChevronRight, Users, Calendar, Filter } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { exportToCSV } from "@/lib/csv";
import { maskCPF, maskPhone } from "@/lib/maskPII";

const PAGE_SIZE = 20;

interface PatientProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  cpf: string | null;
  date_of_birth: string | null;
  created_at: string;
}

interface PatientAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  doctor_id: string;
}

const AdminPatients = () => {
  
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<PatientProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", phone: "", cpf: "" });
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    const { data: roles } = await db.from("user_roles").select("user_id").eq("role", "patient");
    if (!roles || roles.length === 0) { setLoading(false); return; }
    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await db.from("profiles")
      .select("user_id, first_name, last_name, phone, cpf, date_of_birth, created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false });
    setPatients(profiles ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = patients.filter(p =>
      `${p.first_name} ${p.last_name} ${p.cpf || ""} ${p.phone || ""}`.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === "7d") cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === "30d") cutoff.setDate(now.getDate() - 30);
      else if (dateFilter === "90d") cutoff.setDate(now.getDate() - 90);
      result = result.filter(p => new Date(p.created_at) >= cutoff);
    }

    // Sort
    if (sortBy === "name") {
      result.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    // "newest" is default from API

    return result;
  }, [patients, search, dateFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, dateFilter, sortBy]);

  const openDetail = async (p: PatientProfile) => {
    setSelected(p);
    setEditForm({ first_name: p.first_name, last_name: p.last_name, phone: p.phone || "", cpf: p.cpf || "" });
    const { data } = await db.from("appointments")
      .select("id, scheduled_at, status, doctor_id")
      .eq("patient_id", p.user_id)
      .order("scheduled_at", { ascending: false })
      .limit(10);
    setAppointments(data ?? []);
  };

  const saveEdit = async () => {
    if (!selected) return;
    const { error } = await db.from("profiles").update({
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      phone: editForm.phone || null,
      cpf: editForm.cpf || null,
    }).eq("user_id", selected.user_id);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Paciente atualizado!");
      setEditing(false);
      setSelected(null);
      fetchPatients();
    }
  };

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nenhum paciente para exportar");
      return;
    }
    exportToCSV(
      `pacientes_${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map(p => ({
        nome: p.first_name ?? "",
        sobrenome: p.last_name ?? "",
        telefone: p.phone ?? "",
        cpf: p.cpf ?? "",
        nascimento: p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString("pt-BR") : "",
        cadastro: new Date(p.created_at).toLocaleDateString("pt-BR"),
      })),
      [
        { key: "nome", label: "Nome" },
        { key: "sobrenome", label: "Sobrenome" },
        { key: "telefone", label: "Telefone" },
        { key: "cpf", label: "CPF" },
        { key: "nascimento", label: "Nascimento" },
        { key: "cadastro", label: "Cadastro" },
      ],
    );
    toast.success(`${filtered.length} paciente${filtered.length === 1 ? "" : "s"} exportado${filtered.length === 1 ? "" : "s"}`);
  };

  const statusLabel: Record<string, string> = {
    scheduled: "Agendada", completed: "Concluída", cancelled: "Cancelada",
  };

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("patients")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={Users}
          eyebrow="Pessoas"
          title="Pacientes"
          description="Base completa de pacientes cadastrados na plataforma."
          accent="from-cyan-500 to-blue-600"
          badge={{ label: `${filtered.length} ${filtered.length === 1 ? "paciente" : "pacientes"}`, tone: "info" }}
          actions={
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="w-4 h-4 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-4 h-4 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
              <SelectItem value="name">Nome (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? <div className="shimmer-v2 h-5 rounded w-32 inline-block" aria-label="Carregando" /> : (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto -mx-0.5 rounded-xl">

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead className="hidden md:table-cell">Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (

                    Array.from({ length: 5 }).map((_, i) => (

                      <tr key={i} className="border-b border-border/30">
                              <td className="px-4 py-3"><div className="shimmer-v2 h-4 rounded" /></td>
      <td className="px-4 py-3"><div className="shimmer-v2 h-4 rounded" /></td>
      <td className="px-4 py-3"><div className="shimmer-v2 h-4 rounded" /></td>
      <td className="px-4 py-3"><div className="shimmer-v2 h-4 rounded" /></td>
      <td className="px-4 py-3"><div className="shimmer-v2 h-4 rounded" /></td>

                      </tr>
                    ))

                  ) : paged.map(p => (
                    <TableRow key={p.user_id}>
                      <TableCell data-label="Paciente">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {p.first_name?.[0]}{p.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">{p.first_name} {p.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell data-label="Telefone" className="hidden sm:table-cell text-muted-foreground" title="CPF/telefone completos no detalhe (LGPD)">{maskPhone(p.phone)}</TableCell>
                      <TableCell data-label="CPF" className="hidden md:table-cell text-muted-foreground" title="CPF/telefone completos no detalhe (LGPD)">{maskCPF(p.cpf)}</TableCell>
                      <TableCell data-label="Cadastro" className="hidden md:table-cell text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell data-label="">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(p)}>
                          <Eye className="w-4 h-4 mr-1" /> Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paged.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum paciente encontrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setEditing(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Paciente" : "Detalhes do Paciente"}</DialogTitle>
          </DialogHeader>
          {selected && !editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nome:</span><p className="font-medium text-foreground">{selected.first_name} {selected.last_name}</p></div>
                <div><span className="text-muted-foreground">Telefone:</span><p className="font-medium text-foreground">{selected.phone || "—"}</p></div>
                <div><span className="text-muted-foreground">CPF:</span><p className="font-medium text-foreground">{selected.cpf || "—"}</p></div>
                <div><span className="text-muted-foreground">Nascimento:</span><p className="font-medium text-foreground">{selected.date_of_birth ? new Date(selected.date_of_birth).toLocaleDateString("pt-BR") : "—"}</p></div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit className="w-4 h-4 mr-1" /> Editar</Button>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Últimas Consultas</h4>
                {appointments.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma consulta.</p> : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {appointments.map(a => (
                      <div key={a.id} className="flex justify-between text-xs border border-border rounded p-2">
                        <span className="text-foreground">{new Date(a.scheduled_at).toLocaleDateString("pt-BR")}</span>
                        <Badge variant="outline" className="text-xs">{statusLabel[a.status] ?? a.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {selected && editing && (
            <div className="space-y-3">
              <Input placeholder="Nome" value={editForm.first_name} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} />
              <Input placeholder="Sobrenome" value={editForm.last_name} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} />
              <Input placeholder="Telefone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
              <Input placeholder="CPF" value={editForm.cpf} onChange={e => setEditForm({ ...editForm, cpf: e.target.value })} />
              <div className="flex gap-2">
                <Button onClick={saveEdit} className="bg-gradient-hero text-primary-foreground">Salvar</Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminPatients;
