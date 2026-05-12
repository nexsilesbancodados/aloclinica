/**
 * AdminThemeEditor — edita CSS variables (cores, fontes) do tema.
 *
 * Persiste em app_settings.theme (JSONB). Frontend lê via get_active_theme()
 * e aplica como :root { --primary: ...; }.
 *
 * Edita em formato HSL (compatível com Tailwind/shadcn).
 */
import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Palette, Save, RefreshCw, RotateCcw } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Theme = {
  primary: string;
  secondary: string;
  accent: string;
  destructive: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
  radius: string;
  font_family: string;
  font_heading: string;
};

const DEFAULT_THEME: Theme = {
  primary: "210 100% 45%",
  secondary: "340 75% 50%",
  accent: "150 60% 45%",
  destructive: "0 84% 60%",
  background: "210 40% 98%",
  foreground: "210 40% 12%",
  muted: "210 30% 92%",
  border: "210 30% 88%",
  radius: "0.75rem",
  font_family: "Inter, system-ui, sans-serif",
  font_heading: "Inter, system-ui, sans-serif",
};

const COLOR_FIELDS: { key: keyof Theme; label: string; description: string }[] = [
  { key: "primary", label: "Primária", description: "Botões, links, destaques principais" },
  { key: "secondary", label: "Secundária", description: "Hovers, badges secundários" },
  { key: "accent", label: "Accent", description: "Detalhes, hover sutis" },
  { key: "destructive", label: "Destrutiva", description: "Erros, deletar, cancelar" },
  { key: "background", label: "Fundo", description: "Cor de fundo principal" },
  { key: "foreground", label: "Texto", description: "Cor de texto principal" },
  { key: "muted", label: "Muted", description: "Cards/skeletons em fundo discreto" },
  { key: "border", label: "Borda", description: "Bordas de cards/inputs" },
];

const adminNav = getAdminNav("theme");

const AdminThemeEditor = () => {
  const confirm = useConfirm();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await db.from("app_settings").select("value").eq("key", "theme").maybeSingle();
    if (data?.value) setTheme({ ...DEFAULT_THEME, ...(data.value as any) });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await db.from("app_settings").upsert({ key: "theme", value: theme }, { onConflict: "key" });
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else toast.success("Tema salvo", { description: "Recarregue a página pra ver mudanças aplicadas no site público." });
    setSaving(false);
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Resetar tema?",
      description: "As cores e fontes voltam pros valores padrão. Você ainda precisa salvar pra publicar.",
      confirmLabel: "Resetar",
    });
    if (!ok) return;
    setTheme(DEFAULT_THEME);
  };

  // Preview ao vivo via style inline
  const previewStyle = {
    "--preview-primary": `hsl(${theme.primary})`,
    "--preview-secondary": `hsl(${theme.secondary})`,
    "--preview-accent": `hsl(${theme.accent})`,
    "--preview-destructive": `hsl(${theme.destructive})`,
    "--preview-bg": `hsl(${theme.background})`,
    "--preview-fg": `hsl(${theme.foreground})`,
  } as React.CSSProperties;

  return (
    <DashboardLayout title="Admin" nav={adminNav}>
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Palette}
          eyebrow="Aparência"
          title="Editor de tema"
          description="CSS variables (formato HSL — Tailwind/shadcn). Valores são aplicados ao site público após save + reload."
          accent="from-purple-500 to-pink-600"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Recarregar
              </Button>
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            </>
          }
        />

        <div className="grid lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cores (HSL)</CardTitle>
              <CardDescription>Formato: "H S% L%" — ex: "210 100% 45%"</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {COLOR_FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center">
                  <div>
                    <Label className="text-sm">{f.label}</Label>
                    <p className="text-[11px] text-muted-foreground">{f.description}</p>
                  </div>
                  <Input
                    value={(theme as any)[f.key]}
                    onChange={(e) => setTheme({ ...theme, [f.key]: e.target.value })}
                    placeholder="210 100% 45%"
                    className="font-mono text-xs"
                  />
                  <div
                    className="h-9 w-full rounded-md border"
                    style={{ background: `hsl(${(theme as any)[f.key]})` }}
                    aria-label={`preview ${f.label}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tipografia & forma</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm">Border radius</Label>
                  <Input
                    value={theme.radius}
                    onChange={(e) => setTheme({ ...theme, radius: e.target.value })}
                    placeholder="0.75rem"
                  />
                </div>
                <div>
                  <Label className="text-sm">Font família (texto)</Label>
                  <Input
                    value={theme.font_family}
                    onChange={(e) => setTheme({ ...theme, font_family: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm">Font família (títulos)</Label>
                  <Input
                    value={theme.font_heading}
                    onChange={(e) => setTheme({ ...theme, font_heading: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>Demonstração das cores escolhidas</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={previewStyle} className="space-y-3 p-4 rounded-lg" >
                  <div style={{ background: "var(--preview-bg)", color: "var(--preview-fg)", padding: "1rem", borderRadius: theme.radius, fontFamily: theme.font_family }}>
                    <h3 style={{ fontFamily: theme.font_heading, fontWeight: 700 }}>Heading exemplo</h3>
                    <p>Texto regular do site.</p>
                    <div className="flex gap-2 mt-3">
                      <button style={{ background: "var(--preview-primary)", color: "white", padding: "6px 14px", borderRadius: theme.radius, fontFamily: theme.font_family, fontWeight: 600 }}>Primário</button>
                      <button style={{ background: "var(--preview-secondary)", color: "white", padding: "6px 14px", borderRadius: theme.radius }}>Secundário</button>
                      <button style={{ background: "var(--preview-destructive)", color: "white", padding: "6px 14px", borderRadius: theme.radius }}>Destrutivo</button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminThemeEditor;
