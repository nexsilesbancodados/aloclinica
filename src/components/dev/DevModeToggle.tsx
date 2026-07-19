import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bug, Terminal, User, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";

export const DevModeToggle = () => {
  const { user, roles, refreshRoles } = useAuth();
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    const dev = localStorage.getItem("aloclinica_dev_mode") === "true";
    setIsDev(dev);
  }, []);

  const toggleDevMode = () => {
    const next = !isDev;
    localStorage.setItem("aloclinica_dev_mode", String(next));
    setIsDev(next);
    toast.success(next ? "Modo Dev Ativado 🛠️" : "Modo Dev Desativado 🔒", {
      description: next ? "Ferramentas de teste habilitadas." : "Interface de produção restaurada.",
    });
    setTimeout(() => window.location.reload(), 800);
  };

  const ensureRoleAndGo = async (role: "patient" | "doctor", path: string) => {
    if (!user) {
      toast.error("Faça login primeiro");
      return;
    }
    try {
      if (!roles.includes(role)) {
        const { error } = await db.from("user_roles").insert({ user_id: user.id, role });
        if (error && !error.message?.includes("duplicate")) {
          toast.error("Não foi possível atribuir o papel", { description: error.message });
          return;
        }
        await refreshRoles?.();
      }
      toast.success(`Entrando como ${role}`);
      window.location.href = path;
    } catch (e: any) {
      toast.error("Erro inesperado", { description: e?.message });
    }
  };

  // Show if already dev or on lovable
  const isLovable = typeof window !== "undefined" && window.location.hostname.includes("lovable.app");
  if (!isDev && !isLovable) return null;

  return (
    <div className="px-3 py-2 space-y-2 border-t border-border/40">
      <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em] px-1">
        🛠️ Modo Dev
      </p>

      <Button
        variant={isDev ? "destructive" : "outline"}
        size="sm"
        onClick={toggleDevMode}
        className="w-full h-8 rounded-lg text-[10px] gap-2 font-bold"
      >
        {isDev ? <Bug className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
        {isDev ? "Desativar Dev" : "Ativar Dev"}
      </Button>

      {isDev && (
        <div className="grid grid-cols-1 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => ensureRoleAndGo("patient", "/dashboard?role=patient")}
            className="h-8 rounded-lg text-[10px] gap-1.5 font-semibold justify-start"
          >
            <User className="w-3 h-3 text-blue-600" /> Sou Paciente
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ensureRoleAndGo("doctor", "/dashboard?role=doctor")}
            className="h-8 rounded-lg text-[10px] gap-1.5 font-semibold justify-start"
          >
            <Stethoscope className="w-3 h-3 text-emerald-600" /> Sou Médico
          </Button>
        </div>
      )}
    </div>
  );
};