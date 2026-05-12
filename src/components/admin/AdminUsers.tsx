import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminLoading, AdminEmpty } from "./AdminStateBlocks";
import { Search, Shield, Eye, Users as UsersIcon } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  patient: "Paciente",
  doctor: "Médico",
  clinic: "Clínica",
  admin: "Admin",
  receptionist: "Recepção",
  support: "Suporte",
  partner: "Parceiro",
  
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive",
  doctor: "bg-secondary/10 text-secondary",
  clinic: "bg-accent text-accent-foreground",
  patient: "bg-primary/10 text-primary",
  receptionist: "bg-primary/5 text-primary",
  support: "bg-muted text-muted-foreground",
  partner: "bg-secondary/5 text-secondary",
  
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Acesso total à plataforma",
  doctor: "Pode atender consultas e prescrever",
  clinic: "Pode gerenciar médicos vinculados",
  patient: "Pode agendar e participar de consultas",
  receptionist: "Agenda multimédico, check-in e confirmações",
  support: "Logs de conexão, reset de acessos e helpdesk",
  partner: "Validação de receitas (farmácias/labs)",
  
};

interface UserWithRoles {
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  cpf: string | null;
  created_at: string;
  roles: string[];
}

const AdminUsers = () => {
  
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserWithRoles | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    // Get all profiles
    const { data: profiles } = await db.from("profiles")
      .select("user_id, first_name, last_name, phone, cpf, created_at")
      .order("created_at", { ascending: false });

    // Get all roles
    const { data: roles } = await db.from("user_roles").select("user_id, role");

    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach(r => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });

    setUsers((profiles ?? []).map(p => ({
      ...p,
      roles: roleMap.get(p.user_id) ?? [],
    })));
    setLoading(false);
  };

  const openDetail = (u: UserWithRoles) => {
    setSelected(u);
    setUserRoles([...u.roles]);
  };

  const toggleRole = (role: string) => {
    setUserRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const saveRoles = async () => {
    if (!selected) return;
    setSaving(true);

    const currentRoles = selected.roles as string[];
    const toAdd = userRoles.filter(r => !currentRoles.includes(r));
    const toRemove = currentRoles.filter(r => !userRoles.includes(r));

    for (const role of toAdd) {
      await db.from("user_roles").upsert({ user_id: selected.user_id, role: role as "admin" | "clinic" | "doctor" | "partner" | "patient" | "receptionist" | "support" });
    }
    for (const role of toRemove) {
      await db.from("user_roles").delete().eq("user_id", selected.user_id).eq("role", role as "admin" | "clinic" | "doctor" | "partner" | "patient" | "receptionist" | "support");
    }

    toast.success("Roles atualizadas! ✅");
    setSaving(false);
    setSelected(null);
    fetchUsers();
  };

  const filtered = users.filter(u => {
    const haystack = `${u.first_name} ${u.last_name} ${u.cpf || ""} ${u.phone || ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.roles.includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    u.roles.forEach(r => { acc[r] = (acc[r] ?? 0) + 1; });
    return acc;
  }, {});

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("users")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={Shield}
          eyebrow="Pessoas"
          title="Usuários & Permissões"
          description="Gerencie papéis e acessos de todos os usuários da plataforma."
          accent="from-blue-500 to-indigo-600"
          badge={{ label: `${filtered.length} ${filtered.length === 1 ? "usuário" : "usuários"}`, tone: "info" }}
        />

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {Object.keys(roleCounts).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 mr-1">Filtrar:</span>
              <button
                type="button"
                onClick={() => setRoleFilter(null)}
                className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors ${
                  roleFilter === null ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                Todos ({users.length})
              </button>
              {Object.entries(roleCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors ${
                      roleFilter === role ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {ROLE_LABELS[role] ?? role} ({count})
                  </button>
                ))}
            </div>
          )}
        </div>

        {loading ? (
          <AdminLoading variant="table" count={6} />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            icon={UsersIcon}
            title={search ? "Nenhum resultado" : "Nenhum usuário cadastrado"}
            description={
              search
                ? "Tente ajustar o termo de busca por nome ou CPF."
                : "Os usuários da plataforma aparecerão aqui assim que se cadastrarem."
            }
            accent="from-blue-500/20 to-indigo-500/20"
          />
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden bg-card/50">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(u => (
                    <TableRow key={u.user_id}>
                      <TableCell data-label="Usuário">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {u.first_name?.[0]}{u.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">{u.first_name} {u.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell data-label="Telefone" className="text-muted-foreground">{u.phone || "—"}</TableCell>
                      <TableCell data-label="Roles">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r: string) => (
                            <Badge key={r} variant="outline" className={`text-xs ${ROLE_COLORS[r] ?? ""}`}>
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell data-label="Cadastro" className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell data-label="">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(u)}>
                          <Eye className="w-4 h-4 mr-1" /> Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Permissões</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium text-foreground">{selected.first_name} {selected.last_name}</p>
                <p className="text-muted-foreground">{selected.phone || "Sem telefone"} · {selected.cpf || "Sem CPF"}</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Roles do usuário:</p>
                {(["patient", "doctor", "clinic", "admin", "receptionist", "support", "partner"] as const).map(role => (
                  <label key={role} className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={userRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground">{ROLE_LABELS[role]}</span>
                      <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={saveRoles} disabled={saving} className="bg-gradient-hero text-primary-foreground">
                  {saving ? "Salvando..." : "Salvar Roles"}
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminUsers;
