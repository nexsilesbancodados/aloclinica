import { useState, useEffect, useCallback, useRef } from "react";
import { warn } from "@/lib/logger";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pill, Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

// Memed Script URL (homologação - trocar para produção quando tiver chaves de prod)
const MEMED_SCRIPT_URL =
  "https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js";

declare global {
  interface Window {
    MdSinapsePrescricao: any;
    MdHub: any;
  }
}

interface MemedPrescriptionProps {
  appointmentId: string;
  patientName: string;
  patientCpf: string;
  patientId: string;
  patientSex?: string;
  patientDob?: string;
  patientPhone?: string;
  patientEmail?: string;
  onPrescriptionCreated?: (prescriptionData: any) => void;
}

const MemedPrescription = ({
  appointmentId,
  patientName,
  patientCpf,
  patientId,
  patientSex,
  patientDob,
  patientPhone,
  patientEmail,
  onPrescriptionCreated,
}: MemedPrescriptionProps) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [memedToken, setMemedToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const scriptLoadedRef = useRef(false);
  const moduleReadyRef = useRef(false);

  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY_MS = 1000;

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  // 1. Get Memed token from our edge function — with exponential backoff retry
  const fetchMemedToken = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setRetryAttempt(0);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        setRetryAttempt(attempt);
        await sleep(delay);
      }

      try {
        const { data, error } = await db.functions.invoke("memed-prescriber", {});

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        if (data?.token) {
          setMemedToken(data.token);
          setRetryAttempt(0);
          return data.token;
        }
        throw new Error("Token não retornado");
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error("Erro ao obter token Memed");
        warn(`Memed token error (attempt ${attempt + 1}/${MAX_RETRIES}):`, err);
      }
    }

    setErrorMsg(lastError?.message ?? "Erro ao obter token Memed após várias tentativas");
    setStatus("error");
    setRetryAttempt(0);
    return null;
  }, []);

  // 2. Load Memed SDK script dynamically
  const loadMemedScript = useCallback((token: string) => {
    if (scriptLoadedRef.current) return;

    // Remove any existing Memed scripts
    const existing = document.querySelector('script[src*="sinapse-prescricao"]');
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = MEMED_SCRIPT_URL;
    script.setAttribute("data-token", token);
    script.async = true;

    script.onload = () => {
      // Memed script loaded
      scriptLoadedRef.current = true;
      setupMemedEvents();
    };

    let scriptRetries = 0;
    const MAX_SCRIPT_RETRIES = 2;

    const retryScriptLoad = () => {
      if (scriptRetries >= MAX_SCRIPT_RETRIES) {
        setErrorMsg("Falha ao carregar o SDK da Memed após várias tentativas");
        setStatus("error");
        return;
      }
      scriptRetries++;
      warn(`Memed script load failed, retrying (${scriptRetries}/${MAX_SCRIPT_RETRIES})…`);
      setTimeout(() => {
        const retryScript = document.createElement("script");
        retryScript.type = "text/javascript";
        retryScript.src = MEMED_SCRIPT_URL;
        retryScript.setAttribute("data-token", token);
        retryScript.async = true;
        retryScript.onload = () => { scriptLoadedRef.current = true; setupMemedEvents(); };
        retryScript.onerror = retryScriptLoad;
        document.body.appendChild(retryScript);
      }, 1500 * scriptRetries);
    };

    script.onerror = retryScriptLoad;

    document.body.appendChild(script);
  }, []);

  // 3. Listen for Memed events
  const setupMemedEvents = useCallback(() => {
    let elapsed = 0;
    const POLL_INTERVAL_MS = 200;
    const POLL_MAX_MS = 30_000; // 30s max — se SDK não carregou, desiste e mostra erro
    const checkMemed = setInterval(() => {
      elapsed += POLL_INTERVAL_MS;
      if (elapsed >= POLL_MAX_MS) {
        clearInterval(checkMemed);
        setErrorMsg("SDK da Memed não respondeu em 30s — verifique sua conexão ou recarregue");
        setStatus("error");
        return;
      }
      if (window.MdSinapsePrescricao) {
        clearInterval(checkMemed);

        window.MdSinapsePrescricao.event.add(
          "core:moduleInit",
          async (module: any) => {
            if (module.name === "plataforma.prescricao") {
              // Memed prescription module ready
              moduleReadyRef.current = true;
              setStatus("ready");

              // Set patient data
              try {
                const nameParts = patientName.split(" ");
                await window.MdHub.command.send(
                  "plataforma.prescricao",
                  "setPaciente",
                  {
                    idExterno: patientId,
                    nome: patientName,
                    cpf: (patientCpf || "").replace(/\D/g, ""),
                    sexo: patientSex === "F" ? "Feminino" : "Masculino",
                    ...(patientDob && { data_nascimento: patientDob }),
                    ...(patientPhone && { telefone: patientPhone.replace(/\D/g, "") }),
                    ...(patientEmail && { email: patientEmail }),
                  }
                );
                // Patient set on Memed
              } catch {
                warn("Error setting patient on Memed");
              }

              // Listen for prescription printed event
              window.MdHub.event.add(
                "prescricaoImpressa",
                async (prescriptionData: any) => {
                  // Prescription created via Memed
                  toast.success("Receita emitida via Memed! ✅");

                  // Save prescription to our database
                  try {
                    const medications =
                      prescriptionData?.medicamentos?.map((med: any) => ({
                        name: med.nome || med.descricao || "Medicamento",
                        dosage: med.posologia || "",
                        instructions: med.observacao || "",
                      })) || [];

                    const { data: doctorProfile } = await db
                      .from("doctor_profiles")
                      .select("id")
                      .eq("user_id", user!.id)
                      .single();

                    if (doctorProfile) {
                      await db.from("prescriptions").insert({
                        appointment_id: appointmentId,
                        doctor_id: doctorProfile.id,
                        patient_id: patientId,
                        medications: medications as any,
                        diagnosis: prescriptionData?.diagnostico || null,
                        observations: "Receita emitida via Memed Digital",
                        pdf_url: prescriptionData?.url_pdf || null,
                      } as any);
                    }
                  } catch {
                    warn("Error saving Memed prescription");
                  }

                  onPrescriptionCreated?.(prescriptionData);
                }
              );

              // Listen for prescription deleted
              window.MdHub.event.add("prescricaoExcluida", () => {
                // Prescription deleted on Memed
              });
            }
          }
        );
      }
    }, 500);

    // Timeout after 15 seconds
    setTimeout(() => {
      clearInterval(checkMemed);
      if (!moduleReadyRef.current) {
        setErrorMsg("Tempo limite ao carregar módulo Memed");
        setStatus("error");
      }
    }, 15000);
  }, [patientName, patientCpf, patientId, patientSex, patientDob, patientPhone, patientEmail, appointmentId, user, onPrescriptionCreated]);

  // Open Memed prescription modal
  const openMemed = useCallback(() => {
    if (window.MdHub && moduleReadyRef.current) {
      window.MdHub.module.show("plataforma.prescricao");
    } else {
      toast.error("Módulo Memed não está pronto. Tente novamente.");
    }
  }, []);

  // Initialize
  const handleInit = useCallback(async () => {
    const token = await fetchMemedToken();
    if (token) {
      loadMemedScript(token);
    }
  }, [fetchMemedToken, loadMemedScript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const script = document.querySelector('script[src*="sinapse-prescricao"]');
      if (script) script.remove();
      scriptLoadedRef.current = false;
      moduleReadyRef.current = false;
    };
  }, []);

  if (status === "idle") {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <Pill className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Receita Digital Memed</p>
                <p className="text-xs text-muted-foreground">
                  Prescreva com a base de medicamentos mais completa do Brasil
                </p>
              </div>
            </div>
            <Button onClick={handleInit} className="bg-gradient-hero text-primary-foreground">
              <Pill className="w-4 h-4 mr-2" />
              Iniciar Memed
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "loading") {
    return (
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-semibold text-foreground">Conectando à Memed...</p>
              <p className="text-xs text-muted-foreground">
                {retryAttempt > 0
                  ? `Tentativa ${retryAttempt + 1} de ${MAX_RETRIES}…`
                  : "Aguarde enquanto preparamos a prescrição digital"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <div>
                <p className="font-semibold text-foreground">Erro ao conectar Memed</p>
                <p className="text-xs text-muted-foreground">{errorMsg}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleInit} size="sm">
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ready state
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">Memed Conectada</p>
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  Pronta
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Paciente: {patientName}
              </p>
            </div>
          </div>
          <Button onClick={openMemed} className="bg-gradient-hero text-primary-foreground">
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Prescrição
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemedPrescription;
