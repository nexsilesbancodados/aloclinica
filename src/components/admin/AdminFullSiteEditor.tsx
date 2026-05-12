import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { invalidateSiteSections } from "@/lib/site-sections";
import {
  ArrowUp, ArrowDown, Save, RefreshCw, Monitor, Tablet, Smartphone,
  History, Upload, Plus, Trash2, Layout, Image as ImageIcon,
  Type, Settings, Eye, Search, AlertCircle, Globe, FileEdit, Undo2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "image" | "color" | "url" | "select" | "array";
  options?: string[];
  item_schema?: { fields: Field[] };
};

type Section = {
  id: string;
  key: string;
  display_name: string;
  display_order: number;
  is_enabled: boolean;
  config: Record<string, any>;
  draft_config?: Record<string, any> | null;
  has_draft?: boolean;
  last_published_at?: string | null;
  schema: { fields?: Field[] };
};

const VIEWPORTS = {
  desktop: { w: "100%", label: "Desktop", icon: Monitor },
  tablet:  { w: "768px", label: "Tablet",  icon: Tablet },
  mobile:  { w: "390px", label: "Mobile",  icon: Smartphone },
} as const;

const LANGUAGES = [
  { code: "pt-BR", label: "🇧🇷 Português (Brasil)" },
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Español" },
] as const;

export default function AdminFullSiteEditor() {
  const confirm = useConfirm();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; saved_at: string; config: any }>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [language, setLanguage] = useState<string>("pt-BR");

  const selected = useMemo(() => sections.find((s) => s.key === selectedKey), [sections, selectedKey]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (db as any)
      .from("site_sections")
      .select("*")
      .eq("language", language)
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar seções");
    } else {
      setSections(data as Section[]);
      if (!selectedKey && data && data[0]) setSelectedKey(data[0].key);
    }
    setLoading(false);
  }, [selectedKey, language]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected) {
      // Carrega o rascunho se existir, senão a versão publicada
      setEditing(selected.draft_config ?? selected.config ?? {});
      setIsDirty(false);
    }
  }, [selectedKey]); // eslint-disable-line

  const handleConfigChange = (newConfig: Record<string, any>) => {
    setEditing(newConfig);
    setIsDirty(true);
  };

  const saveDraft = async () => {
    if (!selected) return;
    const { error } = await (db as any)
      .from("site_sections")
      .update({
        draft_config: editing,
        has_draft: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    if (error) {
      toast.error("Erro ao salvar rascunho: " + error.message);
      return;
    }
    toast.success("Rascunho salvo (não publicado)");
    setIsDirty(false);
    await load();
  };

  const publishSection = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Publicar alterações?",
      description: `Você está publicando "${selected.display_name}". O site público será atualizado imediatamente.`,
      confirmLabel: "Publicar",
    });
    if (!ok) return;
    // Snapshot da versão atual no histórico antes de sobrescrever
    if (selected.config && Object.keys(selected.config).length > 0) {
      await (db as any).from("site_sections_history").insert({
        section_key: selected.key,
        config: selected.config,
      });
    }
    const { error } = await (db as any)
      .from("site_sections")
      .update({
        config: editing,
        draft_config: null,
        has_draft: false,
        last_published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    if (error) {
      toast.error("Erro ao publicar: " + error.message);
      return;
    }
    toast.success("Seção publicada no site!");
    setIsDirty(false);
    invalidateSiteSections();
    setPreviewKey((k) => k + 1);
    await load();
  };

  const discardDraft = async () => {
    if (!selected || !selected.has_draft) return;
    const ok = await confirm({
      title: "Descartar rascunho?",
      description: "As alterações não publicadas serão perdidas.",
      confirmLabel: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await (db as any)
      .from("site_sections")
      .update({ draft_config: null, has_draft: false })
      .eq("id", selected.id);
    if (error) {
      toast.error("Erro ao descartar: " + error.message);
      return;
    }
    toast.success("Rascunho descartado");
    setEditing(selected.config ?? {});
    setIsDirty(false);
    await load();
  };

  const toggleEnabled = async (s: Section) => {
    const { error } = await (db as any)
      .from("site_sections")
      .update({ is_enabled: !s.is_enabled })
      .eq("id", s.id);
    if (error) { toast.error("Erro ao alternar status"); return; }
    invalidateSiteSections();
    setPreviewKey((k) => k + 1);
    await load();
  };

  const move = async (s: Section, dir: -1 | 1) => {
    const idx = sections.findIndex((x) => x.id === s.id);
    const target = sections[idx + dir];
    if (!target) return;
    await (db as any).from("site_sections").update({ display_order: target.display_order }).eq("id", s.id);
    await (db as any).from("site_sections").update({ display_order: s.display_order }).eq("id", target.id);
    invalidateSiteSections();
    setPreviewKey((k) => k + 1);
    await load();
  };

  const loadHistory = async () => {
    if (!selected) return;
    const { data } = await (db as any)
      .from("site_sections_history")
      .select("id, saved_at, config")
      .eq("section_key", selected.key)
      .order("saved_at", { ascending: false })
      .limit(20);
    setHistory(data ?? []);
  };

  const filteredSections = sections.filter(s => 
    s.display_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const VpIcon = VIEWPORTS[viewport].icon;

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-4">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between bg-card p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Editor Visual</h1>
          </div>
          {isDirty && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 animate-pulse">
              <AlertCircle className="w-3 h-3 mr-1" /> Alterações não salvas
            </Badge>
          )}
          {!isDirty && selected?.has_draft && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              <FileEdit className="w-3 h-3 mr-1" /> Rascunho aguardando publicação
            </Badge>
          )}
          {!isDirty && selected && !selected.has_draft && selected.last_published_at && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-200">
              <Globe className="w-3 h-3 mr-1" /> Publicado em {new Date(selected.last_published_at).toLocaleDateString("pt-BR")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de idioma */}
          <Select
            value={language}
            onValueChange={async (v) => {
              if (isDirty) {
                const ok = await confirm({
                  title: "Trocar idioma?",
                  description: "Você tem alterações não salvas — elas serão descartadas.",
                  confirmLabel: "Trocar",
                  destructive: true,
                });
                if (!ok) return;
              }
              setLanguage(v);
              setSelectedKey(null);
              setEditing({});
              setIsDirty(false);
            }}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center bg-muted rounded-lg p-1 mr-2">
            {(Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>).map((k) => {
              const Icon = VIEWPORTS[k].icon;
              return (
                <Button
                  key={k}
                  size="sm"
                  variant="ghost"
                  className={`h-8 w-10 p-0 ${viewport === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setViewport(k)}
                  title={VIEWPORTS[k].label}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              );
            })}
          </div>

          <DropdownMenu onOpenChange={(o) => { if (o) loadHistory(); }}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9">
                <History className="w-4 h-4 mr-2" /> Histórico
                {history.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{history.length}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-h-[60vh] overflow-y-auto">
              {history.length === 0 && <DropdownMenuItem disabled>Nenhuma versão anterior</DropdownMenuItem>}
              {history.map((h, i) => (
                <DropdownMenuItem
                  key={h.id}
                  onSelect={(e) => { e.preventDefault(); }}
                  className="flex items-center justify-between gap-2 cursor-default focus:bg-accent"
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs font-medium">
                      {i === 0 ? "Última versão publicada" : `Versão #${history.length - i}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(h.saved_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => { setEditing(h.config); setIsDirty(true); toast.info("Versão carregada no editor — revise e salve/publique"); }}
                    >
                      Carregar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={async () => {
                        if (!selected) return;
                        const ok = await confirm({
                          title: "Restaurar esta versão?",
                          description: "Vai virar a versão publicada. A atual será arquivada no histórico.",
                          confirmLabel: "Restaurar",
                        });
                        if (!ok) return;
                        // Snapshot atual
                        if (selected.config && Object.keys(selected.config).length > 0) {
                          await (db as any).from("site_sections_history").insert({
                            section_key: selected.key,
                            config: selected.config,
                          });
                        }
                        const { error } = await (db as any)
                          .from("site_sections")
                          .update({
                            config: h.config,
                            draft_config: null,
                            has_draft: false,
                            last_published_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                          })
                          .eq("id", selected.id);
                        if (error) {
                          toast.error("Erro ao restaurar", { description: error.message });
                          return;
                        }
                        toast.success("Versão restaurada e publicada!");
                        invalidateSiteSections();
                        setPreviewKey(k => k + 1);
                        await load();
                        await loadHistory();
                      }}
                    >
                      Restaurar
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" className="h-9" onClick={() => setPreviewKey(k => k + 1)}>
            <RefreshCw className="w-4 h-4 mr-2" /> Recarregar
          </Button>

          {selected?.has_draft && !isDirty && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-muted-foreground hover:text-destructive"
              onClick={discardDraft}
              title="Descartar rascunho e voltar para versão publicada"
            >
              <Undo2 className="w-4 h-4 mr-1" /> Descartar
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={saveDraft}
            disabled={!selected || !isDirty}
          >
            <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
          </Button>

          <Button
            size="sm"
            className="h-9 px-6 font-bold"
            onClick={publishSection}
            disabled={!selected || (isDirty === false && !selected.has_draft)}
            title={isDirty ? "Salve o rascunho antes de publicar" : "Publica o rascunho atual no site"}
          >
            <Globe className="w-4 h-4 mr-2" /> Publicar
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left: Sections List */}
        <Card className="col-span-3 flex flex-col shadow-sm">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar seções..." 
                className="pl-9 h-9" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading && [1,2,3,4].map(i => <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />)}
            {filteredSections.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedKey === s.key ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"}`}
                onClick={() => setSelectedKey(s.key)}
              >
                <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                  <button className="p-0.5 hover:bg-white/20 rounded" onClick={(e) => { e.stopPropagation(); move(s, -1); }}>
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button className="p-0.5 hover:bg-white/20 rounded" onClick={(e) => { e.stopPropagation(); move(s, 1); }}>
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold truncate flex items-center gap-1.5 ${selectedKey === s.key ? "text-white" : "text-foreground"}`}>
                    {s.display_name}
                    {s.has_draft && (
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${selectedKey === s.key ? "bg-amber-300" : "bg-amber-500"}`}
                        title="Rascunho não publicado"
                      />
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${selectedKey === s.key ? "text-white/70" : "text-muted-foreground"}`}>{s.key}</div>
                </div>
                <Switch 
                  checked={s.is_enabled} 
                  onClick={(e) => e.stopPropagation()} 
                  onCheckedChange={() => toggleEnabled(s)} 
                  className={selectedKey === s.key ? "data-[state=checked]:bg-white data-[state=unchecked]:bg-white/30" : ""}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Middle: Editor Form */}
        <Card className="col-span-4 flex flex-col shadow-sm overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <Settings className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">Selecione uma seção no painel esquerdo para começar a editar.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between pb-2 border-b">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Type className="w-4 h-4" /> {selected.display_name}
                </h2>
                <Badge variant="outline">{selected.key}</Badge>
              </div>
              
              {selected.schema?.fields?.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Esta seção não possui campos editáveis.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {selected.schema?.fields?.map((f) => (
                    <FieldEditor
                      key={f.key}
                      field={f}
                      value={editing[f.key]}
                      onChange={(v) => handleConfigChange({ ...editing, [f.key]: v })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Right: Preview */}
        <Card className="col-span-5 flex flex-col shadow-sm overflow-hidden bg-muted/20 border-none">
          <div className="p-2 px-4 bg-background border-b flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <VpIcon className="w-3.5 h-3.5" /> 
              {VIEWPORTS[viewport].label} — Visualização em tempo real
            </div>
            <Eye className="w-4 h-4 text-primary/60" />
          </div>
          <div className="flex-1 p-4 flex justify-center">
            <div 
              className="bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300 ease-in-out border"
              style={{ width: VIEWPORTS[viewport].w, maxWidth: "100%", height: "100%" }}
            >
              <iframe
                key={previewKey}
                src="/?preview=1"
                className="w-full h-full border-0"
                title="Preview"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------- Field editors -------- */

function FieldEditor({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const labelEl = <Label className="text-[13px] font-bold mb-1.5 block">{field.label}</Label>;

  if (field.type === "text" || field.type === "url") {
    return (
      <div className="space-y-1">
        {labelEl}
        <Input 
          value={value ?? ""} 
          onChange={(e) => onChange(e.target.value)} 
          className="bg-background focus:ring-1 focus:ring-primary/20"
        />
      </div>
    );
  }
  
  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        {labelEl}
        <Textarea 
          rows={4} 
          value={value ?? ""} 
          onChange={(e) => onChange(e.target.value)} 
          className="bg-background resize-none focus:ring-1 focus:ring-primary/20"
        />
      </div>
    );
  }

  if (field.type === "color") {
    return (
      <div className="space-y-1">
        {labelEl}
        <div className="flex gap-2">
          <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-md border">
            <input 
              type="color" 
              value={value || "#000000"} 
              onChange={(e) => onChange(e.target.value)} 
              className="absolute inset-[-5px] cursor-pointer" 
            />
          </div>
          <Input 
            value={value ?? ""} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder="#HEX ou HSL" 
            className="font-mono text-sm"
          />
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1">
        {labelEl}
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "image") {
    return <ImageField label={field.label} value={value ?? ""} onChange={onChange} />;
  }

  if (field.type === "array") {
    return <ArrayField field={field} value={value ?? []} onChange={onChange} />;
  }

  return null;
}

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  
  const onFile = async (file: File) => {
    setUploading(true);
    const path = `site-assets/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error: upErr } = await db.storage.from("files").upload(path, file, { upsert: false });
    
    if (upErr) { 
      toast.error("Erro no upload: " + upErr.message); 
      setUploading(false); 
      return; 
    }
    
    const { data: pub } = db.storage.from("files").getPublicUrl(path);
    onChange(pub.publicUrl);
    setUploading(false);
    toast.success("Imagem enviada!");
  };

  return (
    <div className="space-y-2">
      <Label className="text-[13px] font-bold block">{label}</Label>
      
      {value ? (
        <div className="relative aspect-video w-full rounded-lg overflow-hidden border group bg-muted/50">
          <img src={value} alt="" className="w-full h-full object-contain" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onChange("")} className="h-8">Remover</Button>
          </div>
        </div>
      ) : (
        <div className="aspect-video w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
          <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs">Nenhuma imagem selecionada</p>
        </div>
      )}

      <div className="flex gap-2">
        <Input 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          placeholder="URL da imagem..." 
          className="text-xs h-9"
        />
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 relative overflow-hidden" 
          disabled={uploading}
        >
          {uploading ? "..." : <><Upload className="w-4 h-4 mr-1" /> Upload</>}
          <input 
            type="file" 
            accept="image/*" 
            className="absolute inset-0 opacity-0 cursor-pointer" 
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} 
          />
        </Button>
        <MediaPickerButton onPick={onChange} />
      </div>
    </div>
  );
}

function MediaPickerButton({ onPick }: { onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMedia = async () => {
    setLoading(true);
    const { data } = await (db as any).from("site_media").select("*").order("created_at", { ascending: false }).limit(60);
    setMedia(data ?? []);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) loadMedia(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9"><Settings className="w-4 h-4 mr-1" /> Biblioteca</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Biblioteca de Mídia</DialogTitle></DialogHeader>
        {loading ? (
          <div className="h-64 flex items-center justify-center">Carregando...</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-[60vh] overflow-y-auto p-1">
            {media.map((m) => (
              <button 
                key={m.id} 
                onClick={() => { onPick(m.url); setOpen(false); }} 
                className="aspect-square border rounded-lg overflow-hidden hover:ring-2 ring-primary transition-all group relative bg-muted"
              >
                <img src={m.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">Selecionar</span>
                </div>
              </button>
            ))}
            {media.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-10" />
                <p>Nenhuma mídia encontrada na biblioteca.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArrayField({ field, value, onChange }: { field: Field; value: any[]; onChange: (v: any[]) => void }) {
  const items = Array.isArray(value) ? value : [];
  const itemFields = field.item_schema?.fields ?? [];
  
  const addItem = () => {
    const blank: Record<string, any> = {};
    for (const f of itemFields) blank[f.key] = "";
    onChange([...items, blank]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-1.5">
        <Label className="text-[13px] font-bold">{field.label}</Label>
        <Button size="sm" variant="ghost" onClick={addItem} className="h-7 text-xs text-primary font-bold hover:text-primary hover:bg-primary/10">
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="border rounded-xl p-4 bg-muted/30 space-y-4 relative group/item">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item #{i + 1}</span>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => removeItem(i)} 
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            
            <div className="grid gap-4">
              {itemFields.map((f) => (
                <FieldEditor
                  key={f.key}
                  field={f}
                  value={item?.[f.key]}
                  onChange={(v) => {
                    const next = [...items];
                    next[i] = { ...next[i], [f.key]: v };
                    onChange(next);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        
        {items.length === 0 && (
          <div className="py-8 text-center border-2 border-dashed rounded-xl text-muted-foreground bg-muted/10">
            <p className="text-xs">Clique em "Adicionar Item" para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
