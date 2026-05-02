import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Download, Trash2, ShieldCheck, Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Privacidade() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-primary" />
            <h2 className="text-lg font-bold mb-2">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Faça login pra gerenciar seus dados pessoais.
            </p>
            <Link to="/paciente"><Button>Fazer Login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: session } = await (db as any).auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lgpd-export-data`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aloclinica-meus-dados-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar");
    } finally { setExporting(false); }
  };

  const requestDeletion = async () => {
    if (!deleteReason.trim()) { toast.error("Informe um motivo"); return; }
    setDeleting(true);
    try {
      const { data, error } = await (db as any).functions.invoke("lgpd-delete-account", {
        body: { reason: deleteReason.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha");
      toast.success(data.message || "Pedido registrado. Processaremos em até 15 dias.");
      setDeleteReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao solicitar");
    } finally { setDeleting(false); }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-primary hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Meus Dados Pessoais (LGPD)</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas informações conforme Lei 13.709/2018</p>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="w-5 h-5 text-blue-500" /> Exportar meus dados
              </CardTitle>
              <CardDescription>
                Direito de acesso e portabilidade (LGPD Art. 18, II e V). Receba um arquivo JSON com tudo que armazenamos sobre você.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={exportData} disabled={exporting} className="gap-2">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Baixar meus dados (JSON)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="w-5 h-5 text-green-500" /> Falar com o DPO
              </CardTitle>
              <CardDescription>
                Encarregado pela Proteção de Dados (LGPD Art. 41).
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <p>Para correção de dados, esclarecimentos ou denúncias, contate:</p>
              <a href="mailto:dpo@aloclinica.com.br" className="text-primary hover:underline font-mono">
                dpo@aloclinica.com.br
              </a>
              <p className="text-xs text-muted-foreground mt-2">Resposta em até 15 dias (Art. 19 LGPD).</p>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-700">
                <Trash2 className="w-5 h-5" /> Excluir minha conta
              </CardTitle>
              <CardDescription>
                Direito ao esquecimento (LGPD Art. 18, VI). Cuidado: irreversível após processamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                ⚠️ <strong>Importante:</strong> dados clínicos (prontuário, receitas, exames) ficam retidos pelo prazo legal de
                <strong> 20 anos (Resolução CFM 1.821/2007)</strong>. Serão anonimizados — seu nome, CPF, email e telefone removidos,
                mas o conteúdo médico permanece pra fins de auditoria. Demais dados (preferências, sorteio, parceiros) são apagados.
              </div>
              <Textarea
                placeholder="Motivo da solicitação (obrigatório, mínimo 10 caracteres)"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteReason.trim().length < 10} className="gap-2">
                    <Trash2 className="w-4 h-4" /> Solicitar Exclusão
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Após confirmar, processaremos em até <strong>15 dias úteis</strong>. Você receberá email de confirmação.
                      Esta ação <strong>não pode ser desfeita</strong> após processada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={requestDeletion} disabled={deleting} className="bg-destructive">
                      {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Sim, solicitar exclusão
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Documentação</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Link to="/privacy" className="block text-primary hover:underline">Política de Privacidade</Link>
              <Link to="/lgpd" className="block text-primary hover:underline">LGPD</Link>
              <Link to="/termo-telemedicina" className="block text-primary hover:underline">Termo de Telemedicina</Link>
              <Link to="/cookies" className="block text-primary hover:underline">Política de Cookies</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
