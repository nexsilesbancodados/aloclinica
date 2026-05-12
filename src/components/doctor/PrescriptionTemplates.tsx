/**
 * PrescriptionTemplates — templates de prescrição salvos pelo médico.
 *
 * Persistência: localStorage `rx_templates_v1` (escopo por médico via key composta com user.id).
 * Não usa Supabase pra evitar nova tabela; quando houver migração para BD, basta trocar
 * o adapter `loadTemplates`/`saveTemplates`.
 *
 * Uso:
 *   <PrescriptionTemplates
 *     userId={user.id}
 *     current={{ diagnosis, medications, observations }}
 *     onApply={(t) => prescription.loadTemplate(t)}
 *   />
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Plus, Trash2, Save, X, Check } from "lucide-react";
import { toast } from "sonner";

export type RxTemplateMed = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export type RxTemplate = {
  id: string;
  name: string;
  diagnosis: string;
  medications: RxTemplateMed[];
  observations: string;
  created_at: string;
  used_count: number;
};

export type RxTemplatePayload = {
  diagnosis: string;
  medications: RxTemplateMed[];
  observations: string;
};

const STORAGE_KEY = (userId: string) => `rx_templates_v1:${userId}`;

function loadTemplates(userId: string): RxTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(userId: string, list: RxTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(list));
  } catch { /* quota or private mode */ }
}

type Props = {
  userId: string | null | undefined;
  current?: RxTemplatePayload;
  onApply: (t: RxTemplatePayload) => void;
  triggerLabel?: string;
};

export default function PrescriptionTemplates({ userId, current, onApply, triggerLabel = "Templates" }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<RxTemplate[]>([]);
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!userId || !open) return;
    setTemplates(loadTemplates(userId));
  }, [userId, open]);

  if (!userId) return null;

  const persist = (list: RxTemplate[]) => {
    setTemplates(list);
    saveTemplates(userId, list);
  };

  const handleSave = () => {
    if (!current) return;
    const name = newName.trim();
    if (!name) {
      toast.error("Dê um nome ao template", { description: "Ex: \"Faringite — Amoxicilina 500mg\"" });
      return;
    }
    if (!current.medications.some(m => m.name?.trim())) {
      toast.error("Adicione ao menos 1 medicamento antes de salvar");
      return;
    }
    const novo: RxTemplate = {
      id: crypto.randomUUID(),
      name,
      diagnosis: current.diagnosis,
      medications: current.medications.filter(m => m.name?.trim()),
      observations: current.observations,
      created_at: new Date().toISOString(),
      used_count: 0,
    };
    persist([novo, ...templates]);
    setSavingNew(false);
    setNewName("");
    toast.success("Template salvo", { description: `"${name}" disponível na próxima prescrição.` });
  };

  const handleApply = (t: RxTemplate) => {
    onApply({ diagnosis: t.diagnosis, medications: t.medications, observations: t.observations });
    persist(templates.map(x => x.id === t.id ? { ...x, used_count: x.used_count + 1 } : x));
    setOpen(false);
    toast.success("Template aplicado", { description: `Revise e ajuste para o paciente atual.` });
  };

  const handleDelete = (id: string) => {
    persist(templates.filter(t => t.id !== id));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookOpen className="w-4 h-4" /> {triggerLabel}
          {templates.length > 0 && (
            <span className="ml-1 text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
              {templates.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Templates de prescrição</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Save current */}
          {current && (
            <Card className="bg-primary/[0.04] border-primary/20">
              <CardContent className="p-4">
                {!savingNew ? (
                  <Button onClick={() => setSavingNew(true)} variant="default" size="sm" className="w-full gap-1.5">
                    <Plus className="w-4 h-4" /> Salvar prescrição atual como template
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">Nome do template</p>
                    <Input
                      autoFocus
                      placeholder="Ex: Faringite estreptocócica"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setSavingNew(false); setNewName(""); } }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave} className="flex-1 gap-1">
                        <Save className="w-3.5 h-3.5" /> Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSavingNew(false); setNewName(""); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Templates list */}
          {templates.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Sem templates ainda.</p>
              <p className="text-xs mt-1">Salve as prescrições mais usadas pra reaproveitar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <Card key={t.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{t.name}</p>
                        {t.diagnosis && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.diagnosis}</p>}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {t.medications.length} med{t.medications.length !== 1 ? "s" : ""}
                          {t.used_count > 0 && ` · usado ${t.used_count}x`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                        aria-label="Excluir template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Button
                      onClick={() => handleApply(t)}
                      size="sm"
                      variant="ghost"
                      className="w-full mt-2 h-8 gap-1 text-primary hover:bg-primary/10"
                    >
                      <Check className="w-3.5 h-3.5" /> Usar template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
