import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { warn } from "@/lib/logger";

/**
 * Ajustes de menu configurados no painel (§5 — Construtor de Navegação).
 *
 * Os menus continuam definidos em código; esta camada só os AJUSTA. Se a tabela
 * estiver vazia, a migration não tiver sido aplicada ou a rede falhar, o menu
 * volta a ser exatamente o do código — nunca some.
 */

export interface NavOverride {
  item_href: string;
  hidden: boolean;
  label_override: string | null;
  group_override: string | null;
  sort_order: number | null;
}

/** Item mínimo de menu — compatível com o NavItem do DashboardLayout. */
interface NavLike {
  label: string;
  href: string;
  group?: string;
}

/**
 * O `href` guardado é o caminho SEM querystring: `/dashboard/admin/users?role=admin`
 * e `/dashboard/admin/users` são o mesmo item de menu.
 */
export const normalizeNavHref = (href: string): string => {
  const noHash = href.split("#")[0];
  return noHash.split("?")[0];
};

/**
 * Aplica os ajustes a uma lista de menu.
 *
 * Ordenação: itens com `sort_order` definido vêm primeiro, na ordem escolhida;
 * o resto mantém a posição original do código. Assim o admin pode promover uns
 * poucos itens sem precisar reordenar o menu inteiro.
 */
export const applyNavOverrides = <T extends NavLike>(items: T[], overrides: NavOverride[]): T[] => {
  if (overrides.length === 0) return items;

  const byHref = new Map(overrides.map((o) => [o.item_href, o]));

  const decorated = items
    .map((item, index) => ({ item, index, override: byHref.get(normalizeNavHref(item.href)) }))
    .filter(({ override }) => !override?.hidden)
    .map(({ item, index, override }) => ({
      index,
      sort: override?.sort_order ?? null,
      value: override
        ? {
            ...item,
            label: override.label_override ?? item.label,
            group: override.group_override ?? item.group,
          }
        : item,
    }));

  decorated.sort((a, b) => {
    if (a.sort !== null && b.sort !== null) return a.sort - b.sort;
    if (a.sort !== null) return -1;
    if (b.sort !== null) return 1;
    return a.index - b.index;
  });

  return decorated.map((d) => d.value);
};

/** Carrega os ajustes de um menu. Falha silenciosa → lista vazia → menu padrão. */
export const useNavOverrides = (menu: string | undefined) => {
  const [overrides, setOverrides] = useState<NavOverride[]>([]);

  useEffect(() => {
    if (!menu) return;
    let active = true;

    void (async () => {
      try {
        const { data, error } = await db
          .from("nav_overrides")
          .select("item_href, hidden, label_override, group_override, sort_order")
          .eq("menu", menu);
        if (error) throw error;
        if (active) setOverrides((data ?? []) as NavOverride[]);
      } catch (e) {
        // Migration ausente ou rede fora: mantém o menu do código.
        warn("nav overrides indisponíveis; usando menu padrão", e);
        if (active) setOverrides([]);
      }
    })();

    return () => { active = false; };
  }, [menu]);

  return overrides;
};
