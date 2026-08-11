/**
 * AdminPlatformSettings — central de configurações da plataforma.
 *
 * Tabs:
 *  - Manutenção: enable/disable + mensagem + ETA
 *  - SEO: título/descrição padrão
 *  - robots.txt: editor texto puro
 *
 * Tudo persiste em app_settings (key/value JSONB).
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Settings, Save, RefreshCw, AlertTriangle, Globe, FileText,
} from "lucide-react";
import { warn } from "@/lib/logger";

const adminNav = getAdminNav("platform-settings");

type Maint = { enabled: boolean; message: string; expected_back_at: string | null; allow_admin: boolean; block_users: boolean };
type Seo = { site_name: string; default_title: string; default_description: string; twitter_handle: string };
type Robots = { content: string };

const defaultMaint: Maint = { enabled: false, message: "", expected_back_at: null, allow_admin: true, block_users: false };
const defaultSeo: Seo = { site_name: "AloClínica", default_title: "", default_description: "", twitter_handle: "" };
const defaultRobots: Robots = { content: "User-agent: *\nAllow: /\nSitemap: https://aloclinica.com.br/sitemap.xml\n" };

const AdminPlatformSettings = () => {
  const [maint, setMaint] = useState<Maint>(defaultMaint);
  const [seo, setSeo] = useState<Seo>(defaultSeo);
  const [robots, setRobots] = useState<Robots>(defaultRobots);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["maintenance_mode", "seo", "robots_txt"]);
    if (error) {
      toast.error("Erro carregando configurações", { description: error.message });
      setLoading(false);
      return;
    }
    const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
    setMaint({ ...defaultMaint, ...(map.maintenance_mode ?? {}) });
    setSeo({ ...defaultSeo, ...(map.seo ?? {}) });
    setRobots({ ...defaultRobots, ...(map.robots_txt ?? {}) });
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const saveKey = async (key: string, value: any) => {
    setSaving(key);
    const { error } = await db
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configuração salva");
    }
    setSaving(null);
  };

  return (
    <DashboardLayout title="Admin" nav={adminNav} role="admin">
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Settings}
          eyebrow="Plataforma"
          title="Configurações da plataforma"
          description="Modo manutenção, SEO global, robots.txt."
          accent="from-slate-500 to-slate-700"
          actions={
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          }
        />

        <Tabs defaultValue="maintenance">
          <TabsList>
            <TabsTrigger value="maintenance" className="gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Manutenção
              {maint.enabled && <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">ON</span>}
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1.5">
              <Globe className="w-3.5 h-3.5" /> SEO
            </TabsTrigger>
            <TabsTrigger value="robots" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" /> robots.txt
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maintenance" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modo manutenção</CardTitle>
                <CardDescription>
                  Quando ativado, todos os usuários veem um aviso. Se o bloqueio estiver ligado,
                  usuários comuns ficam impedidos de usar a plataforma; admins sempre mantêm acesso
                  para encerrar a manutenção com segurança.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label className="text-base">Ativar modo manutenção</Label>
                    <p className="text-xs text-muted-foreground">Mostra banner global pra todos.</p>
                  </div>
                  <Switch
                    checked={maint.enabled}
                    onCheckedChange={(v) => setMaint({ ...maint, enabled: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Mensagem (opcional)</Label>
                  <Textarea
                    value={maint.message}
                    onChange={(e) => setMaint({ ...maint, message: e.target.value })}
                    placeholder="Ex: Estamos atualizando o sistema. Voltamos em breve!"
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Previsão de retorno (opcional)</Label>
                  <Input
                    type="datetime-local"
                    value={maint.expected_back_at?.slice(0, 16) ?? ""}
                    onChange={(e) => setMaint({ ...maint, expected_back_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div>
                    <Label className="font-normal text-sm">Bloquear usuários comuns</Label>
                    <p className="text-xs text-muted-foreground">Impede acesso ao produto enquanto a manutenção estiver ativa.</p>
                  </div>
                  <Switch
                    checked={maint.block_users}
                    onCheckedChange={(v) => setMaint({ ...maint, block_users: v })}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => saveKey("maintenance_mode", maint)} disabled={saving === "maintenance_mode"} className="gap-2">
                    {saving === "maintenance_mode" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar manutenção
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seo" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SEO global</CardTitle>
                <CardDescription>
                  Defaults para páginas que não definem SEO próprio. Alterações refletem no &lt;title&gt; e meta tags.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome do site</Label>
                  <Input value={seo.site_name} onChange={(e) => setSeo({ ...seo, site_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Título padrão (até 60 caracteres ideal)</Label>
                  <Input value={seo.default_title} onChange={(e) => setSeo({ ...seo, default_title: e.target.value })} maxLength={120} />
                  <p className="text-[11px] text-muted-foreground">{seo.default_title.length}/60</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição padrão (até 160 caracteres ideal)</Label>
                  <Textarea value={seo.default_description} onChange={(e) => setSeo({ ...seo, default_description: e.target.value })} rows={3} maxLength={300} />
                  <p className="text-[11px] text-muted-foreground">{seo.default_description.length}/160</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Twitter handle (com @)</Label>
                  <Input value={seo.twitter_handle} onChange={(e) => setSeo({ ...seo, twitter_handle: e.target.value })} placeholder="@aloclinica" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => saveKey("seo", seo)} disabled={saving === "seo"} className="gap-2">
                    {saving === "seo" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar SEO
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="robots" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">robots.txt</CardTitle>
                <CardDescription>
                  Servido em <code className="text-xs">/robots.txt</code>. Edite com cuidado — afeta indexação no Google.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={robots.content}
                  onChange={(e) => setRobots({ content: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                />
                <div className="flex justify-end">
                  <Button onClick={() => saveKey("robots_txt", robots)} disabled={saving === "robots_txt"} className="gap-2">
                    {saving === "robots_txt" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar robots.txt
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminPlatformSettings;
