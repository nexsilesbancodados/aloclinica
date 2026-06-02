/**
 * AdminLgpdExports — gestão de pedidos LGPD de exportação de dados.
 *
 * Cumpre LGPD Art. 18 (direito do titular).
 * Admin pode pedir export de qualquer usuário.
 * Mostra histórico de jobs (pending/processing/completed/failed/expired).
 */
import { useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShieldCheck, RefreshCw, Download, Plus, ExternalLink,
} from "lucide-react";

type Job = {
  id: string;
  user_id: string;
  requested_by: string | null;
  status: string;
  download_url: string | null;
  expires_at: string | null;
  size_bytes: number | null;
  tables_exported: string[];
  error: string | null;
  created_at: string;
  completed_at: string | null;
  // joined
  user_email?: string;
  user_name?: string;
};

const adminNav = getAdminNav("lgpd-exports");

const statusBadge = (s: string) => {
  const m: Record<string, string> = {
    pending: "border-amber-200 text-amber-700",
    processing: "border-blue-200 text-blue-700",
    completed: "border-emerald-200 text-emerald-700",
    failed: "border-red-200 text-red-700",
    expired: "border-slate-200 text-slate-500",
  };
  return <Badge variant="outline" className={`text-[10px] ${m[s] ?? ""}`}>{s}</Badge>;
};

const fmtBytes = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const AdminLgpdExports = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDialog, setNewDialog] = useState(false);
  const [emailToExport, setEmailToExport] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data: jobsRaw } = await db
      .from("lgpd_export_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const userIds = [...new Set((jobsRaw ?? []).map((j: Job) => j.user_id))];
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);
    const pMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    setJobs(((jobsRaw ?? []) as Job[]).map(j => ({
      ...j,
      user_name: `${(pMap.get(j.user_id) as any)?.first_name ?? ""} ${(pMap.get(j.user_id) as any)?.last_name ?? ""}`.trim() || j.user_id.slice(0, 8),
    })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const counts = useMemo(() => ({
    pending: jobs.filter(j => j.status === "pending" || j.status === "processing").length,
    completed: jobs.filter(j => j.status === "completed").length,
    failed: jobs.filter(j => j.status === "failed").length,
  }), [jobs]);

  const requestExport = async () => {
    if (!emailToExport.trim()) {
      toast.error("Informe email do usuário");
      return;
    }
    setCreating(true);
    // Busca user_id pelo email
    const { data: { users }, error: listErr } = await (db.auth as any).admin.listUsers({ filter: `email.eq.${emailToExport}` }).catch(() => ({ data: { users: [] }, error: null }));
    const userId = (users ?? []).find((u: any) => u.email === emailToExport)?.id;

    if (!userId) {
      // Fallback: tenta direto via tabela auth não funciona. Pede o user inputar UUID
      toast.error("Usuário não encontrado", { description: "Verifique o email." });
      setCreating(false);
      return;
    }

    const { data, error } = await db.functions.invoke("lgpd-export-user", {
      body: { user_id: userId },
    });
    if (error || !(data as any)?.ok) {
      toast.error("Erro ao gerar export", { description: (data as any)?.error || error?.message });
      setCreating(false);
      return;
    }
    toast.success("Export gerado!", { description: `${(data as any).tables_count} tabelas, ${fmtBytes((data as any).size_bytes)}` });
    setCreating(false);
    setNewDialog(false);
    setEmailToExport("");
    await fetchAll();
  };

  return (
    <DashboardLayout title="Admin" nav={adminNav}>
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={ShieldCheck}
          eyebrow="Compliance LGPD"
          title="Exports de dados de usuário"
          description={`${counts.pending} processando · ${counts.completed} concluídos · ${counts.failed} falhas. Cumpre LGPD Art. 18 (direito do titular).`}
          accent="from-blue-500 to-cyan-600"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button size="sm" onClick={() => setNewDialog(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Novo export
              </Button>
            </>
          }
        />

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tabelas</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
                ) : jobs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum export ainda. Use "Novo export" pra começar.</TableCell></TableRow>
                ) : jobs.map(j => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(j.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell className="text-sm">{j.user_name}</TableCell>
                    <TableCell>{statusBadge(j.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.tables_exported.length}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtBytes(j.size_bytes)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {j.expires_at ? format(new Date(j.expires_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {j.download_url && j.status === "completed" && (
                        <Button asChild size="sm" variant="outline">
                          <a href={j.download_url} target="_blank" rel="noopener noreferrer" className="gap-1">
                            <Download className="w-3.5 h-3.5" /> JSON
                          </a>
                        </Button>
                      )}
                      {j.error && (
                        <span className="text-xs text-destructive truncate max-w-[160px] inline-block" title={j.error}>{j.error}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* New export dialog */}
        <Dialog open={newDialog} onOpenChange={setNewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Solicitar export LGPD</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Gera ZIP com todos os dados pessoais do usuário em todas as tabelas (auth, profile, KYC,
                consultas, prescrições, pagamentos etc). Link expira em 7 dias.
              </p>
              <Input
                value={emailToExport}
                onChange={(e) => setEmailToExport(e.target.value)}
                placeholder="email@usuario.com"
                type="email"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialog(false)}>Cancelar</Button>
              <Button onClick={requestExport} disabled={creating} className="gap-2">
                {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Gerar export
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminLgpdExports;
