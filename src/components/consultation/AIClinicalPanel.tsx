/**
 * AIClinicalPanel — central de IA clínica dentro da teleconsulta.
 *
 * Ferramentas (apoio à decisão, decisão final é do médico — CFM 2.314/2022):
 *  • Resumo de exames (texto colado ou imagem/foto via visão)
 *  • Diagnóstico diferencial (CID-10)
 *  • Interações medicamentosas
 *  • Sugestão de conduta / exames / encaminhamento
 *  • Anamnese dirigida
 *  • Apoio posológico (pediátrico / renal)
 *  • Resumo para o paciente (linguagem simples)
 *  • Prontuário SOAP (insere direto no prontuário)
 *  • Pergunte à IA (livre)
 *
 * Reúne contexto do paciente (pré-consulta + perfil + chat recente) e chama a
 * edge function `clinical-ai`, que retorna JSON { result }.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logError } from "@/lib/logger";
import {
  Sparkles, Loader2, FileText, Stethoscope, Pill, ClipboardList,
  Brain, MessageCircleQuestion, Baby, Heart, Copy, Check, Upload,
  ArrowDownToLine, FlaskConical,
} from "lucide-react";

type ChatMsg = { sender: string; text: string };

interface Props {
  appointmentId: string;
  patientId?: string;
  recentMessages?: ChatMsg[];
  /** Insere texto no campo do prontuário SOAP (quando o médico quer aproveitar). */
  onSendToNotes?: (text: string, field?: "subjective" | "objective" | "assessment" | "plan") => void;
}

type TaskKey =
  | "exam_summary" | "differential" | "drug_interactions" | "conduct"
  | "anamnese" | "dosage" | "patient_summary" | "soap" | "ask";

const ACTIONS: { key: TaskKey; label: string; icon: any; hint: string }[] = [
  { key: "exam_summary", label: "Resumir exames", icon: FlaskConical, hint: "Cole o resultado ou anexe a imagem do exame" },
  { key: "differential", label: "Diagnóstico diferencial", icon: Brain, hint: "Hipóteses ranqueadas + CID-10" },
  { key: "conduct", label: "Sugerir conduta", icon: Stethoscope, hint: "Plano, exames e encaminhamento" },
  { key: "drug_interactions", label: "Interações", icon: Pill, hint: "Liste os medicamentos" },
  { key: "anamnese", label: "Anamnese dirigida", icon: ClipboardList, hint: "Perguntas sugeridas" },
  { key: "dosage", label: "Apoio posológico", icon: Baby, hint: "Pediátrico / ajuste renal" },
  { key: "patient_summary", label: "Resumo p/ paciente", icon: Heart, hint: "Linguagem simples" },
  { key: "soap", label: "Gerar SOAP", icon: FileText, hint: "Preenche o prontuário" },
];

function parseSOAP(text: string): null | Record<string, string> {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    if (o && (o.subjective || o.objective || o.assessment || o.plan)) return o;
  } catch { /* ignore */ }
  return null;
}

export default function AIClinicalPanel({ appointmentId, patientId, recentMessages = [], onSendToNotes }: Props) {
  const [loading, setLoading] = useState<TaskKey | null>(null);
  const [result, setResult] = useState<string>("");
  const [activeTask, setActiveTask] = useState<TaskKey | null>(null);
  const [examText, setExamText] = useState("");
  const [meds, setMeds] = useState("");
  const [drug, setDrug] = useState("");
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const buildContext = useCallback(async (): Promise<string> => {
    const parts: string[] = [];
    try {
      if (patientId) {
        const { data: prof } = await db
          .from("profiles")
          .select("first_name, last_name, birth_date, gender")
          .eq("user_id", patientId)
          .maybeSingle();
        if (prof) {
          const p: any = prof;
          let age = "";
          if (p.birth_date) {
            const d = new Date(p.birth_date);
            age = `${Math.floor((Date.now() - d.getTime()) / 3.156e10)} anos`;
          }
          parts.push(`Paciente: ${[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}${age ? `, ${age}` : ""}${p.gender ? `, ${p.gender}` : ""}`);
        }
      }
      const { data: sym } = await db
        .from("pre_consultation_symptoms")
        .select("main_complaint, symptoms, severity, duration, additional_notes")
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      if (sym) {
        const s: any = sym;
        parts.push(
          `Queixa principal: ${s.main_complaint || "—"}`,
          `Sintomas: ${(Array.isArray(s.symptoms) ? s.symptoms.join(", ") : s.symptoms) || "—"}`,
          `Severidade: ${s.severity || "—"} | Duração: ${s.duration || "—"}`,
          s.additional_notes ? `Notas: ${s.additional_notes}` : "",
        );
      }

      // Memória longitudinal: últimas 3 consultas anteriores + prescrições + exames
      if (patientId) {
        const { data: priorAppts } = await db
          .from("appointments")
          .select("id, scheduled_at, status")
          .eq("patient_id", patientId)
          .eq("status", "completed")
          .neq("id", appointmentId)
          .order("scheduled_at", { ascending: false })
          .limit(3);
        const ids = (priorAppts ?? []).map((a: any) => a.id);
        if (ids.length) {
          const [{ data: priorNotes }, { data: priorRx }, { data: priorExams }] = await Promise.all([
            db.from("consultation_notes").select("appointment_id, assessment, plan").in("appointment_id", ids),
            db.from("prescriptions").select("created_at, medications").in("appointment_id", ids).limit(8),
            db.from("exam_requests").select("created_at, exam_name").in("appointment_id", ids).limit(8),
          ]);
          const notesMap = new Map<string, any>((priorNotes ?? []).map((n: any) => [n.appointment_id, n]));
          const hist = (priorAppts as any[]).map((a) => {
            const n = notesMap.get(a.id);
            const when = new Date(a.scheduled_at).toLocaleDateString("pt-BR");
            return `  • ${when} — A: ${n?.assessment || "—"}; P: ${n?.plan || "—"}`;
          }).join("\n");
          if (hist) parts.push(`Histórico clínico recente do paciente:\n${hist}`);
          if (priorRx?.length) {
            const meds = priorRx.map((r: any) => {
              const list = Array.isArray(r.medications)
                ? r.medications.map((m: any) => m?.name || m?.medication || "—").filter(Boolean).join(", ")
                : "";
              return list ? `  • ${new Date(r.created_at).toLocaleDateString("pt-BR")} — ${list}` : null;
            }).filter(Boolean).join("\n");
            if (meds) parts.push(`Prescrições anteriores:\n${meds}`);
          }
          if (priorExams?.length) {
            const ex = priorExams.map((e: any) => `  • ${new Date(e.created_at).toLocaleDateString("pt-BR")} — ${e.exam_name || "—"}`).join("\n");
            parts.push(`Exames solicitados anteriormente:\n${ex}`);
          }
        }
      }
    } catch (e) {
      logError("AIClinicalPanel buildContext", e);
    }
    if (recentMessages.length) {
      parts.push(`Conversa recente:\n${recentMessages.slice(-12).map((m) => `${m.sender === "doctor" ? "Médico" : "Paciente"}: ${m.text}`).join("\n")}`);
    }
    return parts.filter(Boolean).join("\n");
  }, [appointmentId, patientId, recentMessages]);

  const run = useCallback(async (task: TaskKey) => {
    setActiveTask(task);
    setLoading(task);
    setResult("");
    try {
      const ctx = await buildContext();
      const payload: Record<string, unknown> = { context: ctx };
      if (task === "exam_summary") {
        if (imageDataUrl) payload.imageDataUrl = imageDataUrl;
        payload.examText = examText.trim() || undefined;
        if (!imageDataUrl && !examText.trim()) {
          toast.info("Cole o texto do exame ou anexe uma imagem.");
          setLoading(null); return;
        }
      }
      if (task === "drug_interactions") {
        if (!meds.trim()) { toast.info("Liste os medicamentos."); setLoading(null); return; }
        payload.medications = meds.trim();
      }
      if (task === "dosage") {
        if (!drug.trim()) { toast.info("Informe o medicamento."); setLoading(null); return; }
        payload.drug = drug.trim();
        payload.patientInfo = ctx;
      }
      if (task === "ask") {
        if (!question.trim()) { toast.info("Escreva sua pergunta."); setLoading(null); return; }
        payload.question = question.trim();
      }

      const { data, error } = await db.functions.invoke("clinical-ai", { body: { task, payload } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const text = (data as any)?.result || "";
      setResult(text);

      // SOAP → oferta de inserir direto no prontuário
      if (task === "soap" && onSendToNotes) {
        const soap = parseSOAP(text);
        if (soap) {
          (["subjective", "objective", "assessment", "plan"] as const).forEach((f) => {
            if (soap[f]) onSendToNotes(soap[f], f);
          });
          toast.success("SOAP preenchido no prontuário", { description: "Revise e ajuste antes de salvar." });
        }
      }
    } catch (e: any) {
      logError("clinical-ai invoke", e);
      toast.error("Erro na IA clínica", { description: e?.message || "Tente novamente." });
    } finally {
      setLoading(null);
    }
  }, [buildContext, imageDataUrl, examText, meds, drug, question, onSendToNotes]);

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.info("Anexe uma imagem (PDF: cole o texto)."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.info("Imagem muito grande (máx 5MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => { setImageDataUrl(reader.result as string); setImageName(file.name); };
    reader.readAsDataURL(file);
  };

  const copyResult = async () => {
    try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  const soapDetected = useMemo(() => activeTask === "soap" && parseSOAP(result), [activeTask, result]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Ações rápidas */}
      <div className="p-3 grid grid-cols-2 gap-1.5 border-b border-[hsl(220,15%,12%)]">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => run(a.key)}
            disabled={loading !== null}
            title={a.hint}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-medium text-left transition-all border ${
              activeTask === a.key
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-[hsl(220,20%,9%)] border-[hsl(220,15%,14%)] text-[hsl(220,15%,75%)] hover:bg-[hsl(220,20%,12%)]"
            } disabled:opacity-50`}
          >
            {loading === a.key ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <a.icon className="w-3.5 h-3.5 shrink-0" />}
            <span className="leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Entradas contextuais por tarefa */}
      <div className="px-3 pt-3 space-y-2">
        {activeTask === "exam_summary" && (
          <div className="space-y-2">
            <Textarea
              value={examText}
              onChange={(e) => setExamText(e.target.value)}
              placeholder="Cole aqui o texto/resultado do exame…"
              className="min-h-[70px] bg-[hsl(220,20%,8%)] border-[hsl(220,15%,16%)] text-white text-xs rounded-xl resize-none"
            />
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5 rounded-lg" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3 h-3" /> {imageName ? "Trocar imagem" : "Anexar imagem"}
              </Button>
              {imageName && <span className="text-[10px] text-emerald-400 truncate">{imageName}</span>}
              <Button size="sm" className="h-7 text-[11px] ml-auto rounded-lg" disabled={loading !== null} onClick={() => run("exam_summary")}>
                Resumir
              </Button>
            </div>
          </div>
        )}
        {activeTask === "drug_interactions" && (
          <div className="flex flex-col gap-2">
            <Textarea value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="Ex.: Losartana 50mg, Sinvastatina 20mg, AAS 100mg…"
              className="min-h-[60px] bg-[hsl(220,20%,8%)] border-[hsl(220,15%,16%)] text-white text-xs rounded-xl resize-none" />
            <Button size="sm" className="h-7 text-[11px] self-end rounded-lg" disabled={loading !== null} onClick={() => run("drug_interactions")}>Analisar</Button>
          </div>
        )}
        {activeTask === "dosage" && (
          <div className="flex items-center gap-2">
            <input value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="Medicamento (ex.: Amoxicilina)"
              className="flex-1 h-8 rounded-lg bg-[hsl(220,20%,8%)] border border-[hsl(220,15%,16%)] text-white text-xs px-2.5" />
            <Button size="sm" className="h-8 text-[11px] rounded-lg" disabled={loading !== null} onClick={() => run("dosage")}>Calcular</Button>
          </div>
        )}
        {activeTask === "ask" && (
          <div className="flex flex-col gap-2">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Pergunte algo clínico (usa o contexto do paciente)…"
              className="min-h-[60px] bg-[hsl(220,20%,8%)] border-[hsl(220,15%,16%)] text-white text-xs rounded-xl resize-none" />
            <Button size="sm" className="h-7 text-[11px] self-end rounded-lg" disabled={loading !== null} onClick={() => run("ask")}>Perguntar</Button>
          </div>
        )}
      </div>

      {/* Resultado */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {loading && !result && (
          <div className="flex items-center gap-2 text-xs text-[hsl(220,15%,55%)]">
            <Loader2 className="w-4 h-4 animate-spin" /> A IA está analisando…
          </div>
        )}
        {result && (
          <div className="rounded-xl border border-[hsl(220,15%,14%)] bg-[hsl(220,20%,8%)] p-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[hsl(220,15%,85%)] font-sans">{result}</pre>
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[hsl(220,15%,14%)]">
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5" onClick={copyResult}>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copiar
              </Button>
              {onSendToNotes && !soapDetected && (
                <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5" onClick={() => { onSendToNotes(result, "plan"); toast.success("Enviado ao prontuário (Plano)"); }}>
                  <ArrowDownToLine className="w-3 h-3" /> Enviar ao prontuário
                </Button>
              )}
            </div>
          </div>
        )}
        {!result && !loading && (
          <div className="text-center text-[11px] text-[hsl(220,15%,40%)] mt-6 px-4">
            <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary/50" />
            Escolha uma ferramenta acima. A IA usa o contexto da pré-consulta e da conversa.
            <br /><span className="text-[10px]">Apoio à decisão — a conduta final é sempre sua.</span>
          </div>
        )}
      </div>

      {/* Pergunte à IA — atalho fixo */}
      {activeTask !== "ask" && (
        <button onClick={() => { setActiveTask("ask"); setResult(""); }}
          className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-medium bg-[hsl(220,20%,9%)] border border-[hsl(220,15%,14%)] text-[hsl(220,15%,70%)] hover:bg-[hsl(220,20%,12%)]">
          <MessageCircleQuestion className="w-3.5 h-3.5" /> Pergunte à IA
        </button>
      )}
    </div>
  );
}
