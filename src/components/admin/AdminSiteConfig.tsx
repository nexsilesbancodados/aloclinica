/**
 * AdminSiteConfig — orquestra a configuração geral do site.
 *
 * As 3 abas mais densas (Planos, Depoimentos, FAQ) foram extraídas para
 * src/components/admin/site-config/{PlansManager, TestimonialsManager, FaqManager}.tsx.
 * Tipos e helpers visuais ficam em ./site-config/shared.tsx.
 *
 * Esta orquestradora cuida de:
 *   - carregar/salvar `site_config` (key/value) por categoria
 *   - oferecer abas para cada categoria (geral, landing, cards JSON, seções, aparência, SEO, integrações)
 *   - delegar Planos/Depoimentos/FAQ para os managers
 *   - confirmar exclusões via AlertDialog único
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Globe, Palette, Search, Plug, LayoutTemplate, SlidersHorizontal,
  MessageSquareQuote, CircleDollarSign, HelpCircle, AlertTriangle, Undo2, ExternalLink,
} from "lucide-react";
import { warn } from "@/lib/logger";
import { invalidateSiteConfig } from "@/lib/site-config";

import {
  ConfigField, JsonField, MotionCard, SaveBtn, SectionSkeleton, cardAnim,
  type ConfigMap, type ConfigRow, type Plan, type Testimonial, type FaqItem, type DeleteTarget,
} from "./site-config/shared";
import { PlansManager } from "./site-config/PlansManager";
import { TestimonialsManager } from "./site-config/TestimonialsManager";
import { FaqManager } from "./site-config/FaqManager";

const AdminSiteConfig = () => {
  const nav = getAdminNav("site-config");

  // Config key-value (todas as abas exceto Planos/Depoimentos/FAQ)
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<ConfigMap>({});
  const [savedValues, setSavedValues] = useState<ConfigMap>({});
  const [savingCat, setSavingCat] = useState<string | null>(null);

  // Coleções gerenciadas pelos managers
  const [plans, setPlans] = useState<Plan[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("geral");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // ── Detecção de mudanças não-salvas ────────────────────────────────────────

  const hasUnsavedChanges = useCallback((cat: string) => {
    const catRows = configRows.filter((r) => r.category === cat);
    return catRows.some((r) => (values[r.key] ?? "") !== (savedValues[r.key] ?? ""));
  }, [configRows, values, savedValues]);

  // ── Carregamento de dados ─────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    const { data, error } = await db.from("site_config").select("*").order("category").order("key");
    if (error) { warn("[SiteConfig] config error", error); return; }
    setConfigRows(data ?? []);
    const map: ConfigMap = {};
    for (const r of data ?? []) map[r.key] = r.value ?? "";
    setValues(map);
    setSavedValues(map);
  }, []);

  const loadPlans = useCallback(async () => {
    const { data, error } = await db.from("plans").select("*").order("price");
    if (error) { warn("[SiteConfig] plans error", error); return; }
    setPlans((data ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
    })) as Plan[]);
  }, []);

  const loadTestimonials = useCallback(async () => {
    const { data, error } = await db.from("testimonials").select("*").order("order_index");
    if (error) { warn("[SiteConfig] testimonials error", error); return; }
    setTestimonials(data ?? []);
  }, []);

  const loadFaq = useCallback(async () => {
    const { data, error } = await db.from("faq_items").select("*").order("order_index");
    if (error) { warn("[SiteConfig] faq error", error); return; }
    setFaqItems(data ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadConfig(), loadPlans(), loadTestimonials(), loadFaq()]);
    setLoading(false);
  }, [loadConfig, loadPlans, loadTestimonials, loadFaq]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Salvar configurações por categoria ─────────────────────────────────────

  const saveCategory = async (cat: string) => {
    setSavingCat(cat);
    const catRows = configRows.filter((r) => r.category === cat);
    const changedRows = catRows.filter((r) => (values[r.key] ?? "") !== (savedValues[r.key] ?? ""));
    if (changedRows.length === 0) {
      toast.info("Nenhuma alteração para salvar");
      setSavingCat(null);
      return;
    }
    await Promise.all(changedRows.map((r) =>
      db.from("site_config").update({ value: values[r.key] ?? "" }).eq("key", r.key)
    ));
    toast.success(`${changedRows.length} configuração${changedRows.length > 1 ? "ões" : ""} salva${changedRows.length > 1 ? "s" : ""}!`);
    invalidateSiteConfig();
    setSavedValues((prev) => {
      const next = { ...prev };
      for (const r of changedRows) next[r.key] = values[r.key] ?? "";
      return next;
    });
    setSavingCat(null);
  };

  const resetCategory = (cat: string) => {
    const catRows = configRows.filter((r) => r.category === cat);
    setValues((prev) => {
      const next = { ...prev };
      for (const r of catRows) next[r.key] = savedValues[r.key] ?? "";
      return next;
    });
    toast.info("Alterações descartadas");
  };

  const handleChange = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

  const rows = useCallback((cat: string) => configRows.filter((r) => r.category === cat), [configRows]);

  // ── Confirmação de exclusão (planos/depoimentos/FAQ) ──────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    if (type === "plan") {
      const { error } = await db.from("plans").delete().eq("id", id);
      if (error) toast.error("Erro ao excluir plano");
      else { toast.success("Plano excluído"); loadPlans(); }
    } else if (type === "testimonial") {
      await db.from("testimonials").delete().eq("id", id);
      toast.success("Depoimento excluído");
      loadTestimonials();
    } else if (type === "faq") {
      await db.from("faq_items").delete().eq("id", id);
      toast.success("Item excluído");
      loadFaq();
    }
    setDeleteTarget(null);
  };

  // ── Configuração das abas ─────────────────────────────────────────────────

  const tabItems = useMemo(() => [
    { id: "geral", label: "Geral", icon: Globe, count: rows("geral").length },
    { id: "landing", label: "Landing", icon: LayoutTemplate },
    { id: "cards", label: "Cards / JSON", icon: LayoutTemplate },
    { id: "secoes", label: "Seções", icon: SlidersHorizontal, count: rows("secoes").length },
    { id: "planos", label: "Planos", icon: CircleDollarSign, count: plans.length },
    { id: "depoimentos", label: "Depoimentos", icon: MessageSquareQuote, count: testimonials.length },
    { id: "faq", label: "FAQ", icon: HelpCircle, count: faqItems.length },
    { id: "aparencia", label: "Aparência", icon: Palette },
    { id: "seo", label: "SEO", icon: Search },
    { id: "integracoes", label: "Integrações", icon: Plug },
  ], [faqItems.length, plans.length, rows, testimonials.length]);

  // ── Barra inline de salvar/descartar para cada categoria ──────────────────

  const CategorySaveBar = ({ cat }: { cat: string }) => {
    const changed = hasUnsavedChanges(cat);
    return (
      <AnimatePresence>
        {changed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5"
          >
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Alterações não salvas</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => resetCategory(cat)} className="gap-1.5 text-xs h-8">
                <Undo2 className="w-3.5 h-3.5" />Descartar
              </Button>
              <SaveBtn onSave={() => saveCategory(cat)} saving={savingCat === cat} hasChanges />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout title="Configuração do Site" nav={nav} role="admin">
      <div className="space-y-6 pb-24 md:pb-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              Configuração da Plataforma
              {values["maintenance_mode"] === "true" && (
                <Badge variant="destructive" className="text-[10px] animate-pulse">MANUTENÇÃO</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie textos, imagens, planos, depoimentos, FAQ, cores e integrações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && (
              <div className="hidden md:flex items-center gap-2 mr-2">
                <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                  <span className="font-bold text-foreground">{configRows.length}</span> configs
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                  <span className="font-bold text-foreground">{plans.length}</span> planos
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                  <span className="font-bold text-foreground">{testimonials.length}</span> depoimentos
                </Badge>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="shrink-0 gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Recarregar
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-lg shrink-0" />)}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {[1, 2].map((i) => (
                <MotionCard key={i} {...cardAnim}>
                  <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
                  <CardContent><SectionSkeleton /></CardContent>
                </MotionCard>
              ))}
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap gap-1 h-auto p-1.5 mb-6 bg-muted/50">
              {tabItems.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5 text-xs px-3 py-2 data-[state=active]:shadow-sm">
                  <t.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {t.count !== undefined && t.count > 0 && (
                    <span className="ml-0.5 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{t.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── GERAL ─────────────────────────────────────────────────── */}
            <TabsContent value="geral">
              <div className="grid gap-6 md:grid-cols-2">
                <MotionCard {...cardAnim}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />Identidade
                    </CardTitle>
                    <CardDescription>Nome, logo, favicon e descrição.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rows("geral").filter(r => ["site_name", "site_description", "logo_url", "favicon_url"].includes(r.key)).map(r => (
                      <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                    ))}
                  </CardContent>
                </MotionCard>

                <MotionCard {...cardAnim} transition={{ ...cardAnim.transition, delay: 0.05 }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquareQuote className="w-4 h-4 text-primary" />Contato & Rodapé
                    </CardTitle>
                    <CardDescription>E-mail, telefone, WhatsApp e textos do rodapé.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rows("geral").filter(r => ["contact_email", "contact_phone", "whatsapp_number", "footer_text", "footer_tagline"].includes(r.key)).map(r => (
                      <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                    ))}
                  </CardContent>
                </MotionCard>

                <MotionCard {...cardAnim} transition={{ ...cardAnim.transition, delay: 0.1 }} className="md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-primary" />Redes Sociais
                    </CardTitle>
                    <CardDescription>Links das redes sociais exibidos no rodapé.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rows("geral").filter(r => r.key.startsWith("social_")).map(r => (
                      <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                    ))}
                  </CardContent>
                </MotionCard>
              </div>
              <CategorySaveBar cat="geral" />
            </TabsContent>

            {/* ── LANDING ───────────────────────────────────────────────── */}
            <TabsContent value="landing">
              <div className="grid gap-6 md:grid-cols-2">
                <MotionCard {...cardAnim}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-primary" />Hero
                    </CardTitle>
                    <CardDescription>Bloco principal da página inicial.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rows("landing").filter(r => [
                      "landing_badge_text", "hero_title", "hero_subtitle", "hero_cta_text",
                      "hero_cta_primary_text", "hero_cta_primary_url", "hero_cta_secondary_text",
                      "hero_cta_secondary_url", "landing_second_cta", "hero_image_url", "hero_video_url",
                    ].includes(r.key)).map(r => (
                      <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                    ))}
                  </CardContent>
                </MotionCard>

                <MotionCard {...cardAnim} transition={{ ...cardAnim.transition, delay: 0.05 }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-primary" />Estatísticas em destaque
                    </CardTitle>
                    <CardDescription>4 números exibidos abaixo do hero.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="grid grid-cols-2 gap-2 pb-3 border-b border-border/30 last:border-0">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Stat {n} — Valor</Label>
                          <Input
                            value={values[`stat_${n}_value`] ?? ""}
                            onChange={(e) => handleChange(`stat_${n}_value`, e.target.value)}
                            placeholder="10k+"
                            className="bg-card/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Stat {n} — Rótulo</Label>
                          <Input
                            value={values[`stat_${n}_label`] ?? ""}
                            onChange={(e) => handleChange(`stat_${n}_label`, e.target.value)}
                            placeholder="Pacientes"
                            className="bg-card/50"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </MotionCard>
              </div>
              <CategorySaveBar cat="landing" />
            </TabsContent>

            {/* ── CARDS DE ENTRADA / LISTAS JSON ────────────────────────── */}
            <TabsContent value="cards">
              <div className="grid gap-6">
                <MotionCard {...cardAnim}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-primary" />Cards de entrada da landing
                    </CardTitle>
                    <CardDescription>
                      JSON com os 3 cards abaixo do Hero. Cada item: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{`{title, description, icon, cta, href}`}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <JsonField
                      value={values["entry_cards"] ?? ""}
                      onChange={(v) => handleChange("entry_cards", v)}
                      placeholder='[{"title":"...","description":"...","icon":"Stethoscope","cta":"Agendar","href":"/..."}]'
                      minH="220px"
                      hint="Ícones suportados: Stethoscope, Eye, Building2. Se inválido, a landing usa valores padrão."
                    />
                  </CardContent>
                </MotionCard>

                <MotionCard {...cardAnim} transition={{ ...cardAnim.transition, delay: 0.05 }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Como funciona — Passos</CardTitle>
                    <CardDescription>
                      JSON array de passos: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{`{step, title, desc, time?}`}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <JsonField
                      value={values["how_it_works_steps"] ?? ""}
                      onChange={(v) => handleChange("how_it_works_steps", v)}
                      minH="180px"
                    />
                  </CardContent>
                </MotionCard>

                <MotionCard {...cardAnim} transition={{ ...cardAnim.transition, delay: 0.1 }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Especialidades em destaque</CardTitle>
                    <CardDescription>JSON array de nomes de especialidades.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <JsonField
                      value={values["featured_specialties"] ?? ""}
                      onChange={(v) => handleChange("featured_specialties", v)}
                      placeholder='["Cardiologia","Dermatologia",...]'
                      minH="120px"
                    />
                  </CardContent>
                </MotionCard>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <SaveBtn onSave={() => saveCategory("cards")} saving={savingCat === "cards"} hasChanges={hasUnsavedChanges("cards")} />
              </div>
            </TabsContent>

            {/* ── SEÇÕES ────────────────────────────────────────────────── */}
            <TabsContent value="secoes">
              <MotionCard {...cardAnim}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />Visibilidade das Seções
                  </CardTitle>
                  <CardDescription>Ative ou desative blocos de conteúdo na página inicial.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {rows("secoes").map(r => (
                    <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                  ))}
                </CardContent>
              </MotionCard>
              <CategorySaveBar cat="secoes" />
            </TabsContent>

            {/* ── PLANOS ─── (extraído) ─────────────────────────────────── */}
            <TabsContent value="planos">
              <PlansManager plans={plans} reload={loadPlans} onDelete={setDeleteTarget} />
            </TabsContent>

            {/* ── DEPOIMENTOS ─── (extraído) ────────────────────────────── */}
            <TabsContent value="depoimentos">
              <TestimonialsManager testimonials={testimonials} reload={loadTestimonials} onDelete={setDeleteTarget} />
            </TabsContent>

            {/* ── FAQ ─── (extraído) ────────────────────────────────────── */}
            <TabsContent value="faq">
              <FaqManager faqItems={faqItems} reload={loadFaq} onDelete={setDeleteTarget} />
            </TabsContent>

            {/* ── APARÊNCIA ─────────────────────────────────────────────── */}
            <TabsContent value="aparencia">
              <MotionCard {...cardAnim}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />Cores e Estilo
                  </CardTitle>
                  <CardDescription>Paleta principal da plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rows("aparencia").map(r => (
                    <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                  ))}

                  {/* Color Preview */}
                  <div className="p-4 rounded-xl border border-border bg-gradient-to-br from-muted/50 to-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Pré-visualização da Paleta</p>
                    <div className="flex gap-4 flex-wrap">
                      {([
                        { key: "color_primary", label: "Primária" },
                        { key: "color_secondary", label: "Secundária" },
                        { key: "color_accent", label: "Destaque" },
                      ]).map(({ key, label }) => (
                        <div key={key} className="flex flex-col items-center gap-1.5">
                          <div
                            className="w-16 h-16 rounded-2xl border-2 border-border shadow-lg transition-all hover:scale-105"
                            style={{ backgroundColor: values[key] || "#cccccc" }}
                          />
                          <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono">{values[key] || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </MotionCard>
              <CategorySaveBar cat="aparencia" />
            </TabsContent>

            {/* ── SEO ───────────────────────────────────────────────────── */}
            <TabsContent value="seo">
              <MotionCard {...cardAnim}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="w-4 h-4 text-primary" />SEO e Metadados
                  </CardTitle>
                  <CardDescription>Título, descrição e imagem para buscadores e redes sociais.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rows("seo").map(r => (
                    <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                  ))}

                  {/* Google Preview */}
                  <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Prévia no Google</p>
                    <div className="space-y-0.5">
                      <p className="text-blue-600 dark:text-blue-400 text-base font-medium leading-tight hover:underline cursor-default">
                        {values["seo_title"] || "AlôMédico — Telemedicina"}
                      </p>
                      <p className="text-emerald-700 dark:text-emerald-500 text-xs flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        alomedico.com.br
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {values["seo_description"] || "Consultas online com especialistas e muito mais."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </MotionCard>
              <CategorySaveBar cat="seo" />
            </TabsContent>

            {/* ── INTEGRAÇÕES ───────────────────────────────────────────── */}
            <TabsContent value="integracoes">
              <MotionCard {...cardAnim}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plug className="w-4 h-4 text-primary" />
                    Integrações e Flags
                    {values["maintenance_mode"] === "true" && (
                      <Badge variant="destructive" className="text-[10px] animate-pulse ml-2">🔧 MANUTENÇÃO ATIVA</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Ative/desative funcionalidades e modo manutenção.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {rows("integracoes").filter(r => r.input_type === "boolean").map(r => (
                    <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                  ))}
                  {rows("integracoes").filter(r => r.input_type !== "boolean").length > 0 && (
                    <div className="space-y-4 pt-4 mt-2 border-t border-border/30">
                      {rows("integracoes").filter(r => r.input_type !== "boolean").map(r => (
                        <ConfigField key={r.key} row={r} value={values[r.key] ?? ""} onChange={handleChange} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </MotionCard>
              <CategorySaveBar cat="integracoes" />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Diálogo único de confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.label}"</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminSiteConfig;
