import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Activity, ArrowLeft } from "lucide-react";

interface ServiceStatus {
  name: string;
  url: string;
  category: "core" | "infrastructure" | "external";
  status: "checking" | "up" | "down";
  responseTime?: number;
}

const SERVICES: Omit<ServiceStatus, "status">[] = [
  { name: "Site principal", url: "https://aloclinica.com.br/health", category: "core" },
  { name: "Reconhecimento facial (KYC)", url: "https://face.aloclinica.com.br", category: "core" },
  { name: "Sala de teleconsulta", url: "https://meet.telemedicinaaloclinica.sbs", category: "core" },
  { name: "WhatsApp", url: "https://whatsapp.telemedicinaaloclinica.sbs/api/server/version", category: "core" },
  { name: "Banco de dados", url: "https://pwxvvimdtmvziynbspgx.supabase.co/auth/v1/health", category: "infrastructure" },
];

export default function Status() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ ...s, status: "checking" as const }))
  );
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkAll = async () => {
    const results = await Promise.all(
      SERVICES.map(async (s) => {
        const start = Date.now();
        try {
          const res = await fetch(s.url, { method: "GET", mode: "no-cors", signal: AbortSignal.timeout(8000) });
          const responseTime = Date.now() - start;
          // no-cors returns opaque response; treat any reachable response as up
          return { ...s, status: "up" as const, responseTime };
        } catch {
          return { ...s, status: "down" as const };
        }
      })
    );
    setServices(results);
    setLastCheck(new Date());
  };

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, 60000); // re-check every 60s
    return () => clearInterval(interval);
  }, []);

  const upCount = services.filter((s) => s.status === "up").length;
  const allUp = upCount === services.length;
  const anyChecking = services.some((s) => s.status === "checking");

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="flex items-center gap-1 text-sm text-primary hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Status do Sistema</h1>
            <p className="text-sm text-muted-foreground">
              {lastCheck ? `Última verificação: ${lastCheck.toLocaleString("pt-BR")}` : "Verificando..."}
            </p>
          </div>
        </div>

        <Card className={allUp ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardContent className="pt-6">
            {anyChecking ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Verificando serviços...</span>
              </div>
            ) : allUp ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold">Todos os serviços operacionais</p>
                  <p className="text-xs text-muted-foreground">{upCount} de {services.length} sistemas online</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6 text-amber-600" />
                <div>
                  <p className="font-semibold">Operação parcial</p>
                  <p className="text-xs text-muted-foreground">{upCount} de {services.length} sistemas online</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(["core", "infrastructure"] as const).map((cat) => {
          const filtered = services.filter((s) => s.category === cat);
          if (!filtered.length) return null;
          return (
            <Card key={cat} className="mt-4">
              <CardHeader>
                <CardTitle className="text-base capitalize">
                  {cat === "core" ? "Serviços principais" : cat === "infrastructure" ? "Infraestrutura" : cat}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {filtered.map((s) => (
                    <li key={s.url} className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
                      <span className="text-sm">{s.name}</span>
                      <div className="flex items-center gap-2">
                        {s.responseTime != null && (
                          <span className="text-xs text-muted-foreground">{s.responseTime}ms</span>
                        )}
                        {s.status === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        {s.status === "up" && <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Operacional</Badge>}
                        {s.status === "down" && <Badge variant="destructive">Fora do ar</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Reportar problema: <a href="mailto:suporte@aloclinica.com.br" className="text-primary hover:underline">suporte@aloclinica.com.br</a>
        </p>
      </div>
    </div>
  );
}
