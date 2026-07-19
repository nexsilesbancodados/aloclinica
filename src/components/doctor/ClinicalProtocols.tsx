/**
 * Editor de protocolos clínicos do médico.
 *
 * O médico declara: "SE queixa contém X E severidade ≥ Y ENTÃO sugerir
 * especialidade Z com urgência W". A IA Clínica consulta esses protocolos
 * para enriquecer a triagem e o painel da sala.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getDoctorNav } from "./doctorNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Plus, Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";

type Protocol = {
  id: string;
  name: string;
  description: string | null;
  conditions: any;
  actions: any;
  is_active: boolean;
};

const SPECIALTIES = ["clinico_geral","cardiologia","pediatria","psiquiatria","ginecologia","dermatologia","ortopedia","otorrino","endocrinologia","gastro","neurologia","psicologia","urologia"];
const URGENCIES = ["baixa","media","alta","emergencia"];

const ClinicalProtocols = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Protocol[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [complaintContains, setComplaintContains] = useState("");
  const [symptomsAny, setSymptomsAny] = useState("");
  const [minSeverity, setMinSeverity] = useState<number | "">("");
  const [suggestedSpecialty, setSuggestedSpecialty] = useState("");
  const [urgency, setUrgency] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await db.from("clinical_protocols")
        .select("id, name, description, conditions, actions, is_active")
        .order("created_at", { ascending: false });
      setItems((data ?? []) as Protocol[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditing(null); setName(""); setDescription("");
    setComplaintContains(""); setSymptomsAny(""); setMinSeverity("");
    setSuggestedSpecialty(""); setUrgency(""); setNote("");
  };

  const openEdit = (p: Protocol) => {
    setEditing(p);
    setName(p.name); setDescription(p.description || "");
    setComplaintContains((p.conditions?.complaint_contains ?? []).join(", "));
    setSymptomsAny((p.conditions?.symptoms_any ?? []).join(", "));
    setMinSeverity(typeof p.conditions?.min_severity === "number" ? p.conditions.min_severity : "");
    setSuggestedSpecialty(p.actions?.suggested_specialty ?? "");
    setUrgency(p.actions?.urgency ?? "");
    setNote(p.actions?.note ?? "");
    setOpen(true);
  };

  const submit = async () => {
    if (!name.trim() || !suggestedSpecialty || !urgency) {
      toast.info("Preencha nome, especialidade sugerida e urgência."); return;
    }
    setSaving(true);
    const conditions: any = {};
    if (complaintContains.trim()) conditions.complaint_contains = complaintContains.split(",").map((s) => s.trim()).filter(Boolean);
    if (symptomsAny.trim()) conditions.symptoms_any = symptomsAny.split(",").map((s) => s.trim()).filter(Boolean);
    if (typeof minSeverity === "number") conditions.min_severity = minSeverity;
    const actions: any = { suggested_specialty: suggestedSpecialty, urgency };
    if (note.trim()) actions.note = note.trim();

    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        conditions, actions, is_active: true,
        ...(editing ? {} : { created_by: user?.id }),
      };
      const { error } = editing
        ? await db.from("clinical_protocols").update(payload).eq("id", editing.id)
        : await db.from("clinical_protocols").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Protocolo atualizado" : "Protocolo criado");
      reset(); setOpen(false); load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e?.message });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este protocolo?")) return;
    const { error } = await db.from("clinical_protocols").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover", { description: error.message }); return; }
    setItems((it) => it.filter((p) => p.id !== id));
  };

  const toggleActive = async (p: Protocol) => {
    const newVal = !p.is_active;
    const { error } = await db.from("clinical_protocols").update({ is_active: newVal } as any).eq("id", p.id);
    if (error) { toast.error("Erro", { description: error.message }); return; }
    setItems((it) => it.map((x) => x.id === p.id ? { ...x, is_active: newVal } : x));
  };

  return (
    <DashboardLayout title="Protocolos clínicos" nav={getDoctorNav("protocols")} role="doctor">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" /> Protocolos clínicos</h1>
            <p className="text-sm text-muted-foreground">Cadastre regras que a IA aplica automaticamente em triagens e sugestões.</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Novo protocolo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} protocolo</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cefaleia com sinais de alarme" />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Quando este protocolo deve ser aplicado…" className="resize-none" />
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">SE</p>
                  <div>
                    <Label className="text-xs">Queixa contém (separar por vírgula)</Label>
                    <Input value={complaintContains} onChange={(e) => setComplaintContains(e.target.value)} placeholder="dor de cabeça, cefaleia" />
                  </div>
                  <div>
                    <Label className="text-xs">Sintomas presentes (qualquer um, separar por vírgula)</Label>
                    <Input value={symptomsAny} onChange={(e) => setSymptomsAny(e.target.value)} placeholder="febre, rigidez de nuca" />
                  </div>
                  <div>
                    <Label className="text-xs">Severidade mínima (0–10)</Label>
                    <Input type="number" min={0} max={10} value={minSeverity}
                      onChange={(e) => setMinSeverity(e.target.value === "" ? "" : Number(e.target.value))} placeholder="7" />
                  </div>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">ENTÃO</p>
                  <div>
                    <Label className="text-xs">Especialidade sugerida *</Label>
                    <Select value={suggestedSpecialty} onValueChange={setSuggestedSpecialty}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Urgência *</Label>
                    <Select value={urgency} onValueChange={setUrgency}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{URGENCIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Observação adicional</Label>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      placeholder="Ex.: Verificar sinais de meningite. Encaminhar PS se houver rigidez de nuca." className="resize-none" />
                  </div>
                </div>
                <Button onClick={submit} disabled={saving} className="w-full rounded-xl">
                  {saving ? "Salvando…" : editing ? "Atualizar protocolo" : "Criar protocolo"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhum protocolo cadastrado"
            description="Crie sua primeira regra para que a IA aplique automaticamente em triagens."
            action={{ label: "Novo protocolo", icon: Plus, onClick: () => setOpen(true) }} />
        ) : (
          <div className="space-y-2">
            {items.map((p) => (
              <Card key={p.id} className={p.is_active ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                        {(p.conditions?.complaint_contains ?? []).map((c: string) => (
                          <span key={c} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">queixa: {c}</span>
                        ))}
                        {(p.conditions?.symptoms_any ?? []).map((c: string) => (
                          <span key={c} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">sintoma: {c}</span>
                        ))}
                        {typeof p.conditions?.min_severity === "number" && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">sev ≥ {p.conditions.min_severity}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">→ {p.actions?.suggested_specialty} · {p.actions?.urgency}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} aria-label="Ativo" />
                      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => openEdit(p)}>
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remove(p.id)}>
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ClinicalProtocols;
