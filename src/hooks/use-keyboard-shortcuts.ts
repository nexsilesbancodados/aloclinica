import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Alt + H", description: "Ir para a Página Inicial" },
  { keys: "Alt + D", description: "Ir para o Painel" },
  { keys: "Alt + N", description: "Nova consulta / Agendar" },
  { keys: "Alt + P", description: "Meu Perfil" },
  { keys: "⌘K / Ctrl+K", description: "Busca rápida" },
  { keys: "?", description: "Mostrar atalhos de teclado" },
];

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], form, [role='dialog']"));
};

/**
 * Global keyboard shortcuts — dashboard only.
 * Never run while typing or interacting with forms/dialogs.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roles } = useAuth();
  const forceRole = new URLSearchParams(location.search).get("role");
  const isAdminShell = roles.includes("admin") && (!forceRole || forceRole === "admin");

  const showHelp = useCallback(() => {
    const shortcuts = isAdminShell ? SHORTCUTS.filter((s) => s.keys !== "Alt + N") : SHORTCUTS;
    const lines = shortcuts.map((s) => `${s.keys} → ${s.description}`).join("  ·  ");
    toast.info("⌨️ Atalhos de Teclado", {
      description: lines,
      duration: 6000,
    });
  }, [isAdminShell]);

  useEffect(() => {
    const isDashboardRoute = location.pathname.startsWith("/dashboard");
    if (!isDashboardRoute) return;

    const handler = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target) || isInteractiveTarget(document.activeElement)) {
        return;
      }

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "h":
            e.preventDefault();
            navigate("/");
            break;
          case "d":
            e.preventDefault();
            navigate(isAdminShell ? "/dashboard/admin/panel-center?role=admin" : "/dashboard");
            break;
          case "n":
            if (isAdminShell) {
              e.preventDefault();
              break;
            }
            e.preventDefault();
            navigate("/dashboard/schedule");
            break;
          case "p":
            e.preventDefault();
            navigate(isAdminShell ? "/dashboard/profile?role=admin" : forceRole ? `/dashboard/profile?role=${forceRole}` : "/dashboard/profile");
            break;
        }
        return;
      }

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showHelp();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [location.pathname, location.search, navigate, showHelp, isAdminShell, forceRole]);
}

