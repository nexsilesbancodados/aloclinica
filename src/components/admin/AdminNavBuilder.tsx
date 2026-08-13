import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ListTree, RefreshCw, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { AdminPageHeader } from "./AdminPageHeader";
import { getAdminNav } from "./adminNav";
import { AdminLoading } from "./AdminStateBlocks";
import { getDoctorNav } from "@/components/doctor/doctorNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";
import { normalizeNavHref, type NavOverride } from "@/hooks/use-nav-overrides";

/**
 * §5 — Construtor de Navegação.
 *
 * Edita AJUSTES sobre os menus definidos em código: ocultar, renomear, reagrupar
 * e reordenar. Não permite criar itens do nada de propósito — cada item aponta
 * para uma rota que precisa existir; um item inventado viraria link quebrado.
 */

interface EditableItem {
  href: string;          // href original (com querystring)
  itemHref: string;      // normalizado — é a chave do override
  defaultLabel: string;
  defaultGroup: string;
  label: string;
  group: string;
  hidden: boolean;
  order: number;
}

// Menus disponíveis para edição. Só os que têm uma função de navegação
// exportada e estável — os demais entram quando forem extraídos para módulo.
const MENUS = [
  { key: "admin", label: "Administrador", build: () => getAdminNav("") },
  { key: "doctor", label: "Médico", build: () => getDoctorNav("") },
] as const;

const AdminNavBuilder = () => {
  const [menu, setMenu] = useState<string>("admin");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const source = MENUS.find((m) => m.key === menu);
      const base = (source?.build() ?? []) as Array<{ label: string; href: string; group?: string }>;

      let overrides: NavOverride[] = [];
      try {
        const { data, error } = await db
          .from("nav_overrides")
          .select("item_href, hidden, label_override, group_override, sort_order")
          .eq("menu", menu);
        if (error) throw error;
        overrides = (data ?? []) as NavOverride[];
      } catch (e) {
        // Migration ainda não aplicada: mostra o menu do código, sem ajustes.
        logError("AdminNavBuilder: overrides indisponíveis", e);
        toast.warning("Ajustes de menu indisponíveis", {
          description: "A migration de navegação ainda não foi aplicada. Exibindo o menu padrão.",
        });
      }

      const byHref = new Map(overrides.map((o) => [o.item_href, o]));
      setItems(base.map((item, index) => {
        const itemHref = normalizeNavHref(item.href);
        const o = byHref.get(itemHref);
        return {
          href: item.href,
          itemHref,
          defaultLabel: item.label,
          defaultGroup: item.group ?? "",
          label: o?.label_override ?? item.label,
          group: o?.group_override ?? item.group ?? "",
          hidden: o?.hidden ?? false,
          order: o?.sort_order ?? index,
        };
      }).sort((a, b) => a.order - b.order));
    } finally {
      setLoading(false);
    }
  }, [menu]);

  useEffect(() => { void load(); }, [load]);

  const update = (itemHref: string, patch: Partial<EditableItem>) => {
    setItems((cur) => cur.map((i) => (i.itemHref === itemHref ? { ...i, ...patch } : i)));
    setDirty(true);
  };

  const move = (index: number, delta: number) => {
    setItems((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, order: i }));
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = items.map((item, index) => ({
        item_href: item.itemHref,
        hidden: item.hidden,
        // Só grava o que DIVERGE do código — assim reverter é apagar a linha.
        label_override: item.label !== item.defaultLabel ? item.label : null,
        group_override: item.group !== item.defaultGroup ? item.group : null,
        sort_order: index,
      }));
      const { error } = await db.rpc("save_nav_overrides", { p_menu: menu, p_items: payload });
      if (error) throw error;
      toast.success("Navegação salva", { description: "Recarregue para ver o menu atualizado." });
      setDirty(false);
      await load();
    } catch (err) {
      logError("AdminNavBuilder save", err);
      toast.error("Falha ao salvar", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setItems((cur) => cur.map((item, index) => ({
      ...item,
      label: item.defaultLabel,
      group: item.defaultGroup,
      hidden: false,
      order: index,
    })));
    setDirty(true);
    toast.info("Ajustes revertidos na tela", { description: "Salve para aplicar o padrão do código." });
  };

  const hiddenCount = useMemo(() => items.filter((i) => i.hidden).length, [items]);

  return (
    <DashboardLayout title="Administração" nav={getAdminNav("nav-builder")} role="admin">
      <div className="space-y-6 pb-24 md:pb-8">
        <AdminPageHeader
          icon={ListTree}
          eyebrow="Plataforma"
          title="Construtor de Navegação"
          description="Oculte, renomeie, reagrupe e reordene itens de menu sem precisar de deploy."
          accent="from-sky-500 to-blue-600"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={resetAll} disabled={loading}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurar padrão
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" /> Recarregar
              </Button>
              <Button size="sm" className="gap-2" onClick={save} disabled={saving || !dirty}>
                <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Menu</CardTitle>
              <CardDescription>
                Os menus vivem em código; aqui você só ajusta. Sem ajustes, o menu volta ao padrão.
              </CardDescription>
            </div>
            <Select value={menu} onValueChange={setMenu}>
              <SelectTrigger className="w-[190px]" aria-label="Menu a editar"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MENUS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <AdminLoading variant="list" count={6} /> : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  {items.length} item(ns) · {hiddenCount} oculto(s)
                  {dirty && <span className="ml-2 font-semibold text-amber-600">alterações não salvas</span>}
                </p>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      key={item.itemHref}
                      className={`rounded-xl border p-3 ${item.hidden ? "opacity-60" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex shrink-0 flex-col">
                          <Button
                            variant="ghost" size="icon" className="h-5 w-6"
                            aria-label={`Mover ${item.label} para cima`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-5 w-6"
                            aria-label={`Mover ${item.label} para baixo`}
                            disabled={index === items.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>

                        <div className="min-w-[160px] flex-1">
                          <Label className="text-[10px] text-muted-foreground">Rótulo</Label>
                          <Input
                            className="mt-0.5 h-8 text-sm"
                            value={item.label}
                            aria-label={`Rótulo de ${item.defaultLabel}`}
                            onChange={(e) => update(item.itemHref, { label: e.target.value })}
                          />
                        </div>

                        <div className="min-w-[130px]">
                          <Label className="text-[10px] text-muted-foreground">Grupo</Label>
                          <Input
                            className="mt-0.5 h-8 text-sm"
                            value={item.group}
                            aria-label={`Grupo de ${item.defaultLabel}`}
                            onChange={(e) => update(item.itemHref, { group: e.target.value })}
                          />
                        </div>

                        <Button
                          variant={item.hidden ? "outline" : "ghost"}
                          size="sm"
                          className="mt-4 gap-1.5 shrink-0"
                          aria-pressed={item.hidden}
                          onClick={() => update(item.itemHref, { hidden: !item.hidden })}
                        >
                          {item.hidden
                            ? <><EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Oculto</>
                            : <><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Visível</>}
                        </Button>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <code className="text-[10px] text-muted-foreground">{item.itemHref}</code>
                        {item.label !== item.defaultLabel && (
                          <Badge variant="outline" className="text-[9px]">era &quot;{item.defaultLabel}&quot;</Badge>
                        )}
                        {item.group !== item.defaultGroup && (
                          <Badge variant="outline" className="text-[9px]">grupo era &quot;{item.defaultGroup || "—"}&quot;</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminNavBuilder;
