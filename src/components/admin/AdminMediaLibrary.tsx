/**
 * AdminMediaLibrary — biblioteca de mídia: upload, busca, filtro por tipo, preview.
 */
import { useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Copy, Trash2, Search, FileText, Film, ImageIcon, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Media = {
  id: string;
  url: string;
  path: string;
  name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
};

type FilterType = "all" | "image" | "video" | "document";

type UploadStatus = {
  name: string;
  progress: number; // 0–100
  status: "uploading" | "success" | "error";
  error?: string;
};

const ACCEPT = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv";

function classifyMime(mime?: string | null): FilterType {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMediaLibrary() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [uploads, setUploads] = useState<UploadStatus[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await (db as any)
      .from("site_media")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Media[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (filter !== "all" && classifyMime(m.mime_type) !== filter) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filter]);

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const initial: UploadStatus[] = arr.map((f) => ({
      name: f.name, progress: 0, status: "uploading",
    }));
    setUploads((prev) => [...initial, ...prev]);

    const updateOne = (name: string, patch: Partial<UploadStatus>) => {
      setUploads((prev) => prev.map((u) => (u.name === name ? { ...u, ...patch } : u)));
    };

    for (const file of arr) {
      const path = `${Date.now()}-${file.name}`;
      // Supabase storage não emite progresso real; simulamos avanço para feedback visual
      let pct = 10;
      updateOne(file.name, { progress: pct });
      const tick = setInterval(() => {
        pct = Math.min(90, pct + 15);
        updateOne(file.name, { progress: pct });
      }, 200);

      const { error } = await db.storage.from("site-media").upload(path, file);
      clearInterval(tick);

      if (error) {
        updateOne(file.name, { status: "error", progress: 100, error: error.message });
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }

      const { data: pub } = db.storage.from("site-media").getPublicUrl(path);
      const { error: insErr } = await (db as any).from("site_media").insert({
        url: pub.publicUrl,
        path,
        name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      if (insErr) {
        updateOne(file.name, { status: "error", progress: 100, error: insErr.message });
        toast.error(`${file.name}: ${insErr.message}`);
        continue;
      }

      updateOne(file.name, { status: "success", progress: 100 });
    }

    toast.success("Upload concluído");
    load();
    // Limpa a lista de upload após 4s
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status === "uploading"));
    }, 4000);
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  };

  const remove = async (m: Media) => {
    const ok = await confirm({
      title: "Remover arquivo?",
      description: `"${m.name}" será excluído da biblioteca e do storage.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    const { error: stErr } = await db.storage.from("site-media").remove([m.path]);
    if (stErr) toast.error(stErr.message);
    const { error: delErr } = await (db as any).from("site_media").delete().eq("id", m.id);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    toast.success("Mídia removida");
    load();
  };

  const renderPreview = (m: Media) => {
    const kind = classifyMime(m.mime_type);
    if (kind === "image") {
      return <img src={m.url} alt={m.name} className="w-full h-32 object-cover rounded" loading="lazy" />;
    }
    if (kind === "video") {
      return (
        <div className="w-full h-32 bg-muted rounded flex items-center justify-center">
          <Film className="w-8 h-8 text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="w-full h-32 bg-muted rounded flex items-center justify-center">
        <FileText className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  };

  const counts = useMemo(() => ({
    all: items.length,
    image: items.filter((m) => classifyMime(m.mime_type) === "image").length,
    video: items.filter((m) => classifyMime(m.mime_type) === "video").length,
    document: items.filter((m) => classifyMime(m.mime_type) === "document").length,
  }), [items]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Biblioteca de mídia</h1>
          <p className="text-sm text-muted-foreground">
            {counts.all} arquivo{counts.all === 1 ? "" : "s"} • {counts.image} imagens • {counts.video} vídeos • {counts.document} documentos
          </p>
        </div>
        <label className="inline-flex items-center gap-2 border rounded px-4 py-2 cursor-pointer hover:bg-muted">
          <Upload className="w-4 h-4" />
          {uploads.some((u) => u.status === "uploading") ? "Enviando..." : "Upload"}
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do arquivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              aria-label="Limpar busca"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="image">Imagens</SelectItem>
            <SelectItem value="video">Vídeos</SelectItem>
            <SelectItem value="document">Documentos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {uploads.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-medium">Uploads</div>
          {uploads.map((u) => (
            <div key={u.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate flex-1">{u.name}</span>
                <span className={
                  u.status === "error" ? "text-destructive" :
                  u.status === "success" ? "text-green-600" :
                  "text-muted-foreground"
                }>
                  {u.status === "error" ? "Erro" : u.status === "success" ? "Concluído" : `${u.progress}%`}
                </span>
              </div>
              <Progress value={u.progress} className={u.status === "error" ? "[&>div]:bg-destructive" : ""} />
              {u.error && <div className="text-xs text-destructive">{u.error}</div>}
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filtered.map((m) => (
          <Card key={m.id} className="p-2 space-y-2">
            {renderPreview(m)}
            <div className="text-xs truncate" title={m.name}>{m.name}</div>
            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>{formatSize(m.size_bytes)}</span>
              {classifyMime(m.mime_type) === "image" && <ImageIcon className="w-3 h-3" />}
              {classifyMime(m.mime_type) === "video" && <Film className="w-3 h-3" />}
              {classifyMime(m.mime_type) === "document" && <FileText className="w-3 h-3" />}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => copyUrl(m.url)} title="Copiar URL">
                <Copy className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove(m)} title="Remover">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            {items.length === 0
              ? "Nenhuma mídia enviada"
              : "Nenhum arquivo corresponde aos filtros aplicados"}
          </div>
        )}
        {loading && (
          <div className="col-span-full text-center text-muted-foreground py-12">Carregando...</div>
        )}
      </div>
    </div>
  );
}
