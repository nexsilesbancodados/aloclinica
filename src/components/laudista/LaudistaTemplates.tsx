import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { getLaudistaNav } from "./laudistaNav";
import { FileText, Plus, Pencil, Trash2, Power } from "lucide-react";
import { logError } from "@/lib/logger";

/**
 * LaudistaTemplates — CRUD de templates de laudo.
 *
 * Templates aparecem no select do ExamReportEditor toolbar. Laudista cria
 * para seu próprio uso ou para o time. Admin pode editar qualquer um (via RLS).
 */

type Template = {
  id: string;
  title: string;
  exam_type: string;
  body_text: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

const LaudistaTemplates = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: "", exam_type: "", body_text: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { void fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("report_templates" as never)
      .select("*")
      .order("title", { ascending: true });
    if (error) {
      logError("LaudistaTemplates fetch", error);
      toast.error("Erro ao carregar templates");
    } else {
      setTemplates((data ?? []) as unknown as Template[]);
    }
    setLoading(false);
  };

  const openNew = () => {
    setEditing({ id: "", title: "", exam_type: "", body_text: "", is_active: true, created_by: "", created_at: "" });
    setForm({ title: "", exam_type: "", body_text: "" });
  };
  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ title: t.title, exam_type: t.exam_type, body_text: t.body_text });
  };
  const close = () => { setEditing(null); setForm({ title: "", exam_type: "", body_text: "" }); };

  const handleSave = async () => {
    if (!user || !editing) return;
    if (!form.title.trim() || !form.exam_type.trim()) {
      toast.error("Título e tipo de exame são obrigatórios");
      return;
    }
    setSaving(true);
    const isNew = !editing.id;
    if (isNew) {
      const { error } = await db.from("report_templates" as never).insert({
        title: form.title.trim(),
        exam_type: form.exam_type.trim(),
        body_text: form.body_text,
        created_by: user.id,
        is_active: true,
      } as never);
      if (error) toast.error("Erro ao criar", { description: error.message });
      else toast.success("Template criado");
    } else {
      const { error } = await db
        .from("report_templates" as never)
        .update({
          title: form.title.trim(),
          exam_type: form.exam_type.trim(),
          body_text: form.body_text,
        } as never)
        .eq("id", editing.id);
      if (error) toast.error("Erro ao salvar", { description: error.message });
      else toast.success("Template atualizado");
    }
    setSaving(false);
    close();
    await fetchAll();
  };

  const toggleActive = async (t: Template) => {
    const { error } = await db
      .from("report_templates" as never)
      .update({ is_active: !t.is_active } as never)
      .eq("id", t.id);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success(t.is_active ? "Desativado" : "Ativado"); fetchAll(); }
  };

  const handleDelete = async (t: Template) => {
    const ok = await confirm({
      title: "Excluir template?",
      description: `"${t.title}" será removido permanentemente.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await db.from("report_templates" as never).delete().eq("id", t.id);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Template excluído"); fetchAll(); }
  };

  return (
    <DashboardLayout title="Laudista" nav={getLaudistaNav("templates")} role="laudista">
      <div className="w-full mx-auto max-w-4xl space-y-5 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Templates de Laudo</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
              Modelos reutilizáveis para os laudos no editor
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Template
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-muted/30 animate-pulse" />)}
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Nenhum template criado</p>
              <p className="text-xs text-muted-foreground mt-1">Crie modelos para acelerar a redação dos laudos.</p>
              <Button onClick={openNew} className="mt-4 gap-2"><Plus className="w-4 h-4" /> Criar primeiro</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id} className={t.is_active ? "" : "opacity-60"}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{t.title}</p>
                      <Badge variant="outline" className="text-[10px]">{t.exam_type}</Badge>
                      {!t.is_active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">
                      {t.body_text || "(sem corpo)"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(t)} title={t.is_active ? "Desativar" : "Ativar"}>
                      <Power className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Editar">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t)} title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Raio-X de Tórax PA"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo de exame *</Label>
              <Input
                value={form.exam_type}
                onChange={(e) => setForm({ ...form, exam_type: e.target.value })}
                placeholder="Ex: raio-x-torax (slug curto)"
                className="mt-1 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use slugs curtos (sem espaços) — útil pra filtros futuros.
              </p>
            </div>
            <div>
              <Label className="text-xs">Corpo do laudo</Label>
              <Textarea
                value={form.body_text}
                onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                placeholder="Texto base que será inserido no editor quando o laudista selecionar este template."
                rows={12}
                className="mt-1 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Pode usar placeholders entre [colchetes] para guiar o laudista nos pontos a preencher.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.exam_type.trim()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default LaudistaTemplates;
