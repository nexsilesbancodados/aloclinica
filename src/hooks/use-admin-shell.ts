import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * True quando a visão atual é o console administrativo.
 *
 * Um admin usando "ver como" (?role=patient) NÃO está no shell admin: ele
 * recebe o chrome do painel visitado. Mesma regra que o DashboardLayout aplica
 * ao resolver o papel a partir de propsRole/forceRole — mantida aqui para os
 * componentes que vivem fora do layout (widgets globais do App).
 */
export function useIsAdminShell() {
  const location = useLocation();
  const { roles } = useAuth();
  const forceRole = new URLSearchParams(location.search).get("role");

  return (
    location.pathname.startsWith("/dashboard") &&
    roles.includes("admin") &&
    (!forceRole || forceRole === "admin")
  );
}

export default useIsAdminShell;
