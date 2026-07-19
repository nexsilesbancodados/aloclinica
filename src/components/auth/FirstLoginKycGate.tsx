/**
 * FirstLoginKycGate — força a verificação biométrica de identidade no
 * primeiro acesso de pacientes e médicos. Enquanto kyc_status !== 'approved',
 * redireciona automaticamente para /kyc?return=<rota atual>.
 *
 * - Admin / support / clinic / partner / receptionist passam direto
 * - Já está em /kyc, /kyc-mobile ou rotas públicas → não redireciona
 * - Carregamento ou perfil ainda nulo → não redireciona (evita loop)
 */
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";

export function FirstLoginKycGate({ children }: { children: React.ReactNode }) {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    // Papéis operacionais não precisam de KYC para acessar o painel
    const exemptRoles = ["admin", "support", "clinic", "partner", "receptionist"];
    if (roles.some((r) => exemptRoles.includes(r))) {
      setChecked(true);
      return;
    }

    // Rotas onde NÃO devemos redirecionar (evita loop)
    const path = location.pathname;
    if (path.startsWith("/kyc") || path === "/awaiting-approval") {
      setChecked(true);
      return;
    }

    const isDoctor = roles.includes("doctor");

    const verify = async () => {
      try {
        if (isDoctor) {
          const { data: doc } = await db
            .from("doctor_profiles")
            .select("kyc_status")
            .eq("user_id", user.id)
            .maybeSingle();
          const status = (doc as any)?.kyc_status;
          if (status !== "approved" && status !== "verified") {
            navigate(`/kyc?return=${encodeURIComponent(path + location.search)}`, { replace: true });
            return;
          }
        } else {
          // Paciente
          const { data: prof } = await db
            .from("profiles")
            .select("kyc_status")
            .eq("user_id", user.id)
            .maybeSingle();
          const status = (prof as any)?.kyc_status;
          if (status !== "approved") {
            navigate(`/kyc?return=${encodeURIComponent(path + location.search)}`, { replace: true });
            return;
          }
        }
      } catch {
        // Em caso de falha, não bloqueia — deixa o restante do app continuar
      } finally {
        setChecked(true);
      }
    };

    verify();
  }, [loading, user, roles, location.pathname, location.search, navigate]);

  if (loading || !checked) return null;
  return <>{children}</>;
}

export default FirstLoginKycGate;