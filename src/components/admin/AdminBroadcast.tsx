import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Megaphone, Send, Users as UsersIcon, Bell } from "lucide-react";
import { notifyMany } from "@/lib/notifications";
import { logError } from "@/lib/logger";

type Audience = "all" | "patient" | "doctor" | "clinic" | "subscribers";

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "Todos os usuários",
  patient: "Apenas pacientes",
  doctor: "Apenas médicos",
  clinic: "Apenas clínicas",
  subscribers: "Quem tem push ativado",
};

const AdminBroadcast = () => {
  const [audience, setAudience] = useState<Audience>("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [counts, setCounts] = useState<Record<Audience, number>>({ all: 0, patient: 0, doctor: 0, clinic: 0, subscribers: 0 });
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => { void loadCounts(); }, []);

  const loadCounts = async () => {
    const [profilesRes, rolesRes, subsRes] = await Promise.all([
      db.from("profiles").select("user_id", { count: "exact", head: true }),
      db.from("user_roles").select("user_id, role"),
      db.from("push_subscriptions").select("user_id", { count: "exact", head: true }),
    ]);
    const roleCount = (role: string) =>
      new Set((rolesRes.data ?? []).filter(r => r.role === role).map(r => r.user_id)).size;
    setCounts({
      all: profilesRes.count ?? 0,
      patient: roleCount("patient"),
      doctor: roleCount("doctor"),
      clinic: roleCount("clinic"),
      subscribers: subsRes.count ?? 0,
    });
  };

  const resolveAudience = async (): Promise<string[]> => {
    if (audience === "subscribers") {
      const { data } = await db.from("push_subscriptions").select("user_id");
      return Array.from(new Set((data ?? []).map(s => s.user_id)));
    }
    if (audience === "all") {
      const { data } = await db.from("profiles").select("user_id");
      return (data ?? []).map(p => p.user_id);
    }
    const { data } = await db.from("user_roles").select("user_id").eq("role", audience as any);
    return Array.from(new Set((data ?? []).map(r => r.user_id)));
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    const userIds = await resolveAudience();
    if (userIds.length === 0) {
      toast.error("Audiência vazia", { description: "Nenhum usuário se encaixa no filtro." });
      return;
    }
    if (!confirm(`Enviar para ${userIds.length} usuário(s)?`)) return;

    setSending(true);
    setLastResult(null);
    try {
      const result = await notifyMany(userIds, title.trim(), message.trim(), "announcement", {
        link: link.trim() || undefined,
        push: true,
      });
      // Antes gravávamos `failed: 0` fixo, então o painel mostrava "0 falhas"
      // mesmo quando o push falhava para parte da audiência.
      setLastResult({ sent: result.sent, failed: result.failed });
      toast.success(`Broadcast processado para ${result.sent} usuário(s)`, {
        description: result.failed > 0 ? `${result.failed} push(es) falharam; o registro in-app foi preservado.` : undefined,
      });
      setTitle("");
      setMessage("");
      setLink("");
    } catch (err) {
      logError("AdminBroadcast send failed", err);
      toast.error("Erro ao enviar broadcast", { description: err instanceof Error ? err.message : "Tente novamente" });
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("broadcast")}>
      <div className="w-full mx-auto max-w-3xl space-y-5 pb-24 md:pb-6">
        <AdminPageHeader
          icon={Megaphone}
          eyebrow="Comunicação"
          title="Broadcast"
          description="Envie notificação push + in-app pra grupos de usuários."
          accent="from-amber-500 to-orange-600"
        />

        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audiência</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map(a => (
                    <SelectItem key={a} value={a}>
                      {AUDIENCE_LABELS[a]} <span className="text-muted-foreground ml-1">({counts[a]})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <UsersIcon className="w-3 h-3" /> {counts[audience]} usuário{counts[audience] === 1 ? "" : "s"} no escopo
                {audience !== "subscribers" && (
                  <span className="text-muted-foreground/70">— push chegará apenas para os que ativaram</span>
                )}
              </p>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Manutenção programada"
                maxLength={120}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem *</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Texto que aparecerá pro usuário"
                maxLength={500}
                rows={4}
                className="mt-1.5"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{message.length}/500</p>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Link (opcional)</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/dashboard/appointments"
                className="mt-1.5 font-mono text-sm"
              />
            </div>

            {/* Preview */}
            {(title || message) && (
              <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
                <div className="flex items-start gap-3 bg-card border border-border/40 rounded-lg p-3 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{title || "Título"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message || "Sua mensagem aparecerá aqui."}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              {lastResult ? (
                <Badge variant="outline" className="text-xs">
                  Último envio: {lastResult.sent} entregue{lastResult.sent === 1 ? "" : "s"}
                </Badge>
              ) : <span />}
              <Button onClick={handleSend} disabled={sending || !title.trim() || !message.trim()} className="gap-2">
                <Send className="w-4 h-4" />
                {sending ? "Enviando..." : `Enviar para ${counts[audience]}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminBroadcast;
