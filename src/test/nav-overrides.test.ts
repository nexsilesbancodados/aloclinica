import { describe, it, expect } from "vitest";
import { applyNavOverrides, normalizeNavHref, type NavOverride } from "@/hooks/use-nav-overrides";

/**
 * O contrato que importa: sem ajustes, o menu sai IDÊNTICO ao do código. Um bug
 * aqui não deixa um item torto — apaga a navegação inteira de um papel.
 */

const nav = [
  { label: "Centro de Controle", href: "/dashboard/admin/panel-center?role=admin", group: "Visão Geral" },
  { label: "Usuários", href: "/dashboard/admin/users?role=admin", group: "Pessoas" },
  { label: "Médicos", href: "/dashboard/admin/doctors?role=admin", group: "Pessoas" },
];

const override = (partial: Partial<NavOverride> & { item_href: string }): NavOverride => ({
  hidden: false, label_override: null, group_override: null, sort_order: null, ...partial,
});

describe("normalizeNavHref", () => {
  it("descarta querystring e hash", () => {
    expect(normalizeNavHref("/dashboard/admin/users?role=admin")).toBe("/dashboard/admin/users");
    expect(normalizeNavHref("/dashboard/admin/users#topo")).toBe("/dashboard/admin/users");
    expect(normalizeNavHref("/dashboard/admin/users")).toBe("/dashboard/admin/users");
  });
});

describe("applyNavOverrides", () => {
  it("sem ajustes devolve o menu intacto", () => {
    expect(applyNavOverrides(nav, [])).toEqual(nav);
  });

  it("oculta o item marcado", () => {
    const out = applyNavOverrides(nav, [override({ item_href: "/dashboard/admin/users", hidden: true })]);
    expect(out.map((i) => i.label)).toEqual(["Centro de Controle", "Médicos"]);
  });

  it("renomeia sem alterar o href", () => {
    const out = applyNavOverrides(nav, [
      override({ item_href: "/dashboard/admin/users", label_override: "Contas" }),
    ]);
    expect(out[1].label).toBe("Contas");
    expect(out[1].href).toBe("/dashboard/admin/users?role=admin");
  });

  it("reagrupa o item", () => {
    const out = applyNavOverrides(nav, [
      override({ item_href: "/dashboard/admin/doctors", group_override: "Operação" }),
    ]);
    expect(out.find((i) => i.href.includes("doctors"))?.group).toBe("Operação");
  });

  it("itens com sort_order vêm antes; o resto mantém a ordem do código", () => {
    const out = applyNavOverrides(nav, [
      override({ item_href: "/dashboard/admin/doctors", sort_order: 0 }),
    ]);
    expect(out.map((i) => i.label)).toEqual(["Médicos", "Centro de Controle", "Usuários"]);
  });

  it("respeita a ordem relativa entre vários sort_order", () => {
    const out = applyNavOverrides(nav, [
      override({ item_href: "/dashboard/admin/users", sort_order: 1 }),
      override({ item_href: "/dashboard/admin/doctors", sort_order: 0 }),
    ]);
    expect(out.map((i) => i.label)).toEqual(["Médicos", "Usuários", "Centro de Controle"]);
  });

  it("ignora ajuste de item que não existe mais no código", () => {
    const out = applyNavOverrides(nav, [
      override({ item_href: "/dashboard/admin/removido", hidden: true }),
    ]);
    expect(out).toEqual(nav);
  });

  it("casa o ajuste independentemente da querystring do item", () => {
    const comQuery = [{ label: "Usuários", href: "/dashboard/admin/users?role=admin&x=1", group: "Pessoas" }];
    const out = applyNavOverrides(comQuery, [
      override({ item_href: "/dashboard/admin/users", hidden: true }),
    ]);
    expect(out).toHaveLength(0);
  });
});
