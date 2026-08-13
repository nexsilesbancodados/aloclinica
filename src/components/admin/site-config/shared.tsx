/**
 * Tipos e componentes compartilhados pelos sub-painéis de AdminSiteConfig.
 * Extraído de AdminSiteConfig.tsx (originalmente monolítico de 1372 linhas).
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save, RefreshCw, Star, ExternalLink, AlertTriangle, CheckCircle2,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ConfigMap = Record<string, string>;

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  interval: string;
  max_appointments: number | null;
  is_active: boolean;
  features: string[];
  stripe_price_id: string | null;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  avatar_url: string | null;
  text: string;
  rating: number;
  is_active: boolean;
  order_index: number;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  is_active: boolean;
  order_index: number;
};

export type ConfigRow = {
  id: string;
  key: string;
  value: string | null;
  category: string;
  label: string;
  input_type: string;
};

export type DeleteTarget = {
  type: "plan" | "testimonial" | "faq";
  id: string;
  label: string;
};

// ── Animation helpers ─────────────────────────────────────────────────────────

export const MotionCard = motion.create(Card);

// ── Component: SaveBtn ────────────────────────────────────────────────────────

export const SaveBtn = ({
  onSave,
  saving,
  hasChanges,
}: {
  onSave: () => void;
  saving: boolean;
  hasChanges?: boolean;
}) => (
  <Button onClick={onSave} disabled={saving} className="gap-2" size="sm">
    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
    {saving ? "Salvando…" : "Salvar alterações"}
    {hasChanges && !saving && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
  </Button>
);

// ── Component: EmptyState ─────────────────────────────────────────────────────

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-muted-foreground" />
    </div>
    <p className="text-sm font-medium text-foreground mb-1">{title}</p>
    <p className="text-xs text-muted-foreground max-w-[280px] mb-4">{description}</p>
    {action}
  </div>
);

// ── Component: SectionSkeleton ────────────────────────────────────────────────

export const SectionSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    ))}
  </div>
);

// ── Component: ConfigField ────────────────────────────────────────────────────

export const ConfigField = ({
  row,
  value,
  onChange,
}: {
  row: ConfigRow;
  value: string;
  onChange: (key: string, val: string) => void;
}) => {
  const v = value ?? "";

  if (row.input_type === "boolean") {
    return (
      <div className="flex items-center justify-between py-3 px-3 rounded-lg border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors">
        <div className="flex-1 min-w-0">
          <Label className="font-normal text-sm cursor-pointer">{row.label}</Label>
        </div>
        <Switch checked={v === "true"} onCheckedChange={(c) => onChange(row.key, String(c))} />
      </div>
    );
  }
  if (row.input_type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{row.label}</Label>
        <Textarea value={v} onChange={(e) => onChange(row.key, e.target.value)} className="resize-none min-h-[80px] bg-card/50" placeholder={row.label} />
      </div>
    );
  }
  if (row.input_type === "color") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{row.label}</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={v || "#000000"} onChange={(e) => onChange(row.key, e.target.value)} className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer p-1 bg-transparent" />
          </div>
          <Input value={v} onChange={(e) => onChange(row.key, e.target.value)} className="font-mono uppercase w-32 bg-card/50" placeholder="#000000" maxLength={7} />
          {v && <span className="w-10 h-10 rounded-xl border-2 border-border shadow-sm ring-2 ring-offset-2 ring-offset-background ring-transparent" style={{ backgroundColor: v }} />}
        </div>
      </div>
    );
  }
  if (row.input_type === "url") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{row.label}</Label>
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => onChange(row.key, e.target.value)} placeholder="https://" className="flex-1 bg-card/50" />
          {v && (
            <Button variant="outline" size="icon" type="button" tabIndex={-1} asChild>
              <a href={v} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
          )}
        </div>
        {v && /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(v) && (
          <div className="mt-2 p-2 rounded-lg border border-border bg-muted/30">
            <img src={v} alt="preview" className="h-16 w-auto rounded-lg object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}
      </div>
    );
  }
  if (row.input_type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{row.label}</Label>
        <Input type="number" value={v} onChange={(e) => onChange(row.key, e.target.value)} className="w-32 bg-card/50" />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{row.label}</Label>
      <Input value={v} onChange={(e) => onChange(row.key, e.target.value)} placeholder={row.label} className="bg-card/50" />
    </div>
  );
};

// ── Component: StarRating ─────────────────────────────────────────────────────

export const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((s) => (
      <button key={s} type="button" onClick={() => onChange(s)} className="transition-transform hover:scale-110">
        <Star className={`w-5 h-5 transition-colors ${s <= value ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
      </button>
    ))}
  </div>
);

// ── Component: JsonField ──────────────────────────────────────────────────────

export const JsonField = ({
  value,
  onChange,
  placeholder,
  minH = "180px",
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minH?: string;
  hint?: string;
}) => {
  const isValid = useMemo(() => {
    if (!value?.trim()) return null;
    try { JSON.parse(value); return true; } catch { return false; }
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          className={`font-mono text-xs bg-card/50 ${isValid === false ? "border-destructive/50 focus-visible:ring-destructive/30" : isValid === true ? "border-emerald-500/50" : ""}`}
          style={{ minHeight: minH }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {isValid !== null && (
          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${isValid ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
            {isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {isValid ? "JSON válido" : "JSON inválido"}
          </div>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

// re-export used types for sibling files
export type { CardProps } from "@/components/ui/card";
export { Card, CardContent, CardHeader, CardTitle, CardDescription };
