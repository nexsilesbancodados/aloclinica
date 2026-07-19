import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

type AppRole = "patient" | "doctor" | "admin" | "support" | "clinic" | "receptionist";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
  requiredRoles?: AppRole[];
}

const ProtectedRoute = ({ children, requiredRole, requiredRoles }: ProtectedRouteProps) => {
  const { user, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    if (requiredRole === "patient") return <Navigate to="/paciente" replace />;
    if (requiredRole === "doctor") return <Navigate to="/medico?acesso=entrar" replace />;
    if (requiredRole === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/paciente" replace />;
  }

  // Admin sempre passa
  if (roles.includes("admin")) return <>{children}</>;

  // Verificar role único
  if (requiredRole && !roles.includes(requiredRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Verificar múltiplos roles (usuário precisa ter pelo menos um)
  if (requiredRoles && !requiredRoles.some(r => roles.includes(r))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
