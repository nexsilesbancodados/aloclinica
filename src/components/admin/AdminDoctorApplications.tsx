import { logError } from "@/lib/logger";
import pingoAdmin from "@/assets/pingo-admin.png";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getAdminNav } from "./adminNav";
import { cn } from "@/lib/utils";
import {
  Stethoscope, Check, X, Mail, Clock, Eye, Send, Copy,
  CheckCircle2, XCircle, Loader2, RefreshCw, Search
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface DoctorApplication {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  crm: string;
  crm_state: string;
  specialty: string | null;
  bio: string | null;
  status: string;
  admin_notes: string | null;
  invite_code_id: string | null;
  created_at: string;
}

const AdminDoctorApplications = () => {
  const [applications, setApplications] = useState<DoctorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<DoctorApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    let query = db.from("doctor_applications" as never).select("*").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    if (search.trim()) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,crm.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) logError("AdminDoctorApplications fetch error", error);
    setApplications((data as unknown as DoctorApplication[]) ?? []);
    setLoading(false);
  }, [filter, search]);

  useEffect(() => { void fetchApplications(); }, [fetchApplications]);

  const handleApprove = async () => {
    if (!selectedApp) return;
    setProcessing(true);

    try {
      // Generate invite code
      const code = `MED-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: session } = await db.auth.getSession();
      const adminId = session?.session?.user?.id;

      const { data: codeData, error: codeError } = await db.from("doctor_invite_codes").insert({
        code,
        created_by: adminId!,
        expires_at: expiresAt,
      }).select().single();

      if (codeError) throw codeError;

      // Update application
      await (db.from("doctor_applications" as any)).update({
        status: "approved",
        admin_notes: adminNotes || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        invite_code_id: codeData.id,
      } as any).eq("id", selectedApp.id);

      // Send email with the code
      await db.functions.invoke("send-email", {
        body: {
          type: "doctor_invite_code",
          to: selectedApp.email,
          data: {
            name: selectedApp.full_name,
            invite_code: code,
          },
        },
      });

      setGeneratedCode(code);
      toast.success("Aprovado!", { description: `Código ${code} enviado para ${selectedApp.email}` });
      fetchApplications();
    } catch (err: unknown) {
      toast.error("Erro", { description: err instanceof Error ? err.message : "Falha ao aprovar." });
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!selectedApp) return;
    setProcessing(true);
    try {
      const { data: session } = await db.auth.getSession();
      await (db.from("doctor_applications" as any)).update({
        status: "rejected",
        admin_notes: adminNotes || null,
        reviewed_by: session?.session?.user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", selectedApp.id);

      // Notify by email
      await db.functions.invoke("send-email", {
        body: {
          type: "doctor_rejected",
          to: selectedApp.email,
          data: {
            name: selectedApp.full_name,
            reason: adminNotes || "Não atende aos requisitos mínimos da plataforma no momento.",
          },
        },
      });

      toast.success("Rejeitado", { description: "O médico foi notificado por email." });
      setSelectedApp(null);
      setAdminNotes("");
      fetchApplications();
    } catch (err: unknown) {
      toast.error("Erro", { description: err instanceof Error ? err.message : "Falha ao rejeitar." });
    }
    setProcessing(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case "approved": return <Badge variant="outline" className="bg-success/10 text-success border-success/20"><CheckCircle2 className="w-3 h-3 mr-1" />Aprovado</Badge>;
      case "rejected": return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="w-3 h-3 mr-1" />Rejeitado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("doctor-applications")}>
      <div className="w-full mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Stethoscope className="w-6 h-6 text-primary" /> Solicitações de Médicos</h2>
            <p className="text-sm text-muted-foreground mt-1">Analise e aprove cadastros de novos médicos</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchApplications}><RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Atualizar</Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
            {(["pending", "all", "approved", "rejected"] as const).map(f => (
              <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(f)} className="text-xs h-8 px-3 rounded-md shadow-none">
                {f === "pending" ? "Pendentes" : f === "all" ? "Todos" : f === "approved" ? "Aprovados" : "Rejeitados"}
              </Button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, email ou CRM..." className="pl-9 h-10" onKeyDown={e => e.key === "Enter" && fetchApplications()} />
          </div>
        </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : applications.length === 0 ? (
        <div className="text-center py-10"><img src={pingoAdmin} alt="Pingo" className="w-24 h-24 object-contain mx-auto drop-shadow-md mb-3 select-none" loading="lazy" decoding="async" width={96} height={96} /><p className="text-[13px] font-semibold text-foreground mb-1">Nenhuma solicitação encontrada</p><p className="text-[11px] text-muted-foreground">Novas solicitações de médicos aparecerão aqui</p></div>
      ) : (
        <div className="grid gap-3">
          {applications.map(app => (
            <Card key={app.id} className="card-interactive cursor-pointer" onClick={() => { setSelectedApp(app); setAdminNotes(app.admin_notes || ""); setGeneratedCode(null); }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center shrink-0">
                      <Stethoscope className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{app.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">CRM {app.crm}/{app.crm_state} • {app.email}</p>
                      {app.specialty && <p className="text-xs text-muted-foreground">{app.specialty}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {statusBadge(app.status)}
                    <span className="text-xs text-muted-foreground hidden sm:block">{new Date(app.created_at).toLocaleDateString("pt-BR")}</span>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={open => { if (!open) { setSelectedApp(null); setGeneratedCode(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> {selectedApp?.full_name}</DialogTitle>
            <DialogDescription>Detalhes da solicitação de cadastro</DialogDescription>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground block text-xs mb-0.5">Email</span><span className="font-medium">{selectedApp.email}</span></div>
                <div><span className="text-muted-foreground block text-xs mb-0.5">Telefone</span><span className="font-medium">{selectedApp.phone || "—"}</span></div>
                <div><span className="text-muted-foreground block text-xs mb-0.5">CRM</span><span className="font-medium">{selectedApp.crm}/{selectedApp.crm_state}</span></div>
                <div><span className="text-muted-foreground block text-xs mb-0.5">Especialidade</span><span className="font-medium">{selectedApp.specialty || "—"}</span></div>
                <div><span className="text-muted-foreground block text-xs mb-0.5">Status</span>{statusBadge(selectedApp.status)}</div>
                <div><span className="text-muted-foreground block text-xs mb-0.5">Data</span><span className="font-medium">{new Date(selectedApp.created_at).toLocaleString("pt-BR")}</span></div>
              </div>
              {selectedApp.bio && (
                <div><span className="text-xs text-muted-foreground block mb-1">Sobre</span><p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedApp.bio}</p></div>
              )}

              {/* Verify CRM link */}
              <Button variant="outline" size="sm" className="w-full text-primary border-primary/30" onClick={() => window.open(`https://portal.cfm.org.br/busca-medicos/?crm=${encodeURIComponent(selectedApp.crm)}&uf=${encodeURIComponent(selectedApp.crm_state)}`, "_blank")}>
                🔍 Verificar CRM no Portal CFM
              </Button>

              {generatedCode && (
                <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-center">
                  <p className="text-sm text-success font-medium mb-2">✅ Código gerado e enviado por email:</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-lg font-mono font-bold text-success">{generatedCode}</code>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(generatedCode); toast.success("Copiado!"); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {selectedApp.status === "pending" && !generatedCode && (
                <>
                  <div>
                    <Label className="text-xs">Observações do Admin (opcional)</Label>
                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Notas internas ou motivo de rejeição..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </div>
                  <DialogFooter className="flex gap-2 sm:gap-2">
                    <Button variant="destructive" onClick={handleReject} disabled={processing}>
                      {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />} Rejeitar
                    </Button>
                    <Button onClick={handleApprove} disabled={processing} className="bg-gradient-to-r from-success to-success/80">
                      {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Aprovar e Enviar Código
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
};

export default AdminDoctorApplications;
