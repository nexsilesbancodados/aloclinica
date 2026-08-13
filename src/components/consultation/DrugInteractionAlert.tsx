/**
 * DrugInteractionAlert — banner passivo que detecta interações medicamentosas
 * em tempo real conforme o médico digita a receita.
 *
 * Debounce 1500ms para evitar floodar a IA enquanto o médico está digitando.
 * Só dispara quando há ≥ 2 medicamentos com nome preenchido. Resultado vem da
 * task `drug_interactions` da clinical-ai (já existente).
 */
import { useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { logError } from "@/lib/logger";

interface Medication {
  name?: string;
  dosage?: string;
  frequency?: string;
}

interface Props {
  medications: Medication[];
  /** Contexto opcional do paciente (ex: alergias, condições). */
  patientContext?: string;
}

type Severity = "leve" | "moderada" | "grave";

function detectSeverity(text: string): Severity {
  const t = text.toLowerCase();
  if (/\b(grave|severa|severo|alto risco|crítica|contraindicad)/.test(t)) return "grave";
  if (/\b(moderad)/.test(t)) return "moderada";
  return "leve";
}

const SEV_STYLE: Record<Severity, { wrap: string; text: string; icon: string; label: string }> = {
  grave:    { wrap: "border-destructive/40 bg-destructive/5",   text: "text-destructive",                icon: "text-destructive",                label: "Grave" },
  moderada: { wrap: "border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600", label: "Moderada" },
  leve:     { wrap: "border-blue-400/40 bg-blue-50/40 dark:bg-blue-950/20",    text: "text-blue-700 dark:text-blue-300",   icon: "text-blue-600",  label: "Leve" },
};

export default function DrugInteractionAlert({ medications, patientContext }: Props) {
  const meds = useMemo(
    () => medications
      .map((m) => m.name?.trim())
      .filter((n): n is string => Boolean(n && n.length >= 3))
      .map((n, i) => ({ name: n, dosage: medications[i]?.dosage, frequency: medications[i]?.frequency })),
    [medications],
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (meds.length < 2) { setResult(""); setError(false); return; }
    const handle = setTimeout(async () => {
      setLoading(true); setError(false);
      try {
        const list = meds.map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(" ")).join("; ");
        const { data, error: e } = await db.functions.invoke("clinical-ai", {
          body: { task: "drug_interactions", payload: { medications: list, context: patientContext ?? "" } },
        });
        if (e) throw e;
        setResult((data as any)?.result || "");
      } catch (err) {
        logError("DrugInteractionAlert", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [meds, patientContext]);

  if (meds.length < 2) return null;
  if (loading && !result) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando interações entre medicamentos…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        Não foi possível verificar interações agora. A receita pode ser emitida normalmente.
      </div>
    );
  }
  if (!result) return null;

  const sev = detectSeverity(result);
  const s = SEV_STYLE[sev];
  // Detecta também o caso "sem interações" da IA
  const noInteractions = /sem\s+intera|não\s+(há|foram).*intera|nenhuma\s+intera/i.test(result);

  if (noInteractions) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-3 flex items-center gap-2 text-xs text-success">
        <ShieldCheck className="w-3.5 h-3.5" /> Sem interações relevantes detectadas entre os medicamentos.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${s.wrap}`} role="alert" aria-live="polite">
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${s.text} mb-1`}>
            Possível interação medicamentosa — gravidade {s.label.toLowerCase()}
          </p>
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground font-sans max-h-32 overflow-auto">{result}</pre>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Apoio à decisão — você decide a conduta final. Atualizado a cada alteração na lista.
          </p>
        </div>
      </div>
    </div>
  );
}
