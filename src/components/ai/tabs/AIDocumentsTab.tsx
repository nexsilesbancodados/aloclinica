import { logError } from "@/lib/logger";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Copy, Check, Loader2, Sparkles, FileDown, Printer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import jsPDF from "jspdf";

import { AI_URL } from "@/lib/ai";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";

const DOC_TYPES = [
  { value: "atestado", label: "📋 Atestado Médico", prompt: "Gere um rascunho de atestado médico", description: "Afastamento, comparecimento" },
  { value: "encaminhamento", label: "🔄 Encaminhamento", prompt: "Gere um rascunho de encaminhamento médico", description: "Referência para especialista" },
  { value: "declaracao", label: "✅ Declaração de Comparecimento", prompt: "Gere um rascunho de declaração de comparecimento", description: "Para apresentar ao empregador" },
  { value: "relatorio", label: "📝 Relatório Clínico", prompt: "Gere um rascunho de relatório clínico", description: "Evolução e prognóstico" },
  { value: "orientacao", label: "💡 Orientações ao Paciente", prompt: "Gere orientações detalhadas para o paciente", description: "Cuidados e recomendações" },
  { value: "receita", label: "💊 Receita Simples (Rascunho)", prompt: "Gere um rascunho de receita médica simples", description: "Apenas rascunho para revisão" },
  { value: "evolucao", label: "📅 Nota de Evolução", prompt: "Gere uma nota de evolução clínica", description: "Acompanhamento do paciente" },
];

interface Props {
  primaryRole: string;
}

const AIDocumentsTab = ({ primaryRole }: Props) => {
  const [docType, setDocType] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientCPF, setPatientCPF] = useState("");
  const [details, setDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    const selectedDoc = DOC_TYPES.find(d => d.value === docType);
    if (!selectedDoc || !details.trim()) return;
    setIsLoading(true);
    setResult("");

    const prompt = `${selectedDoc.prompt} com as seguintes informações:

**Paciente:** ${patientName || "Não informado"}
${patientCPF ? `**CPF:** ${patientCPF}` : ""}
**Detalhes:** ${details}
**Data:** ${new Date().toLocaleDateString("pt-BR")}

Gere o documento em formato profissional brasileiro, com:
- Cabeçalho: "ALLO MÉDICO - Plataforma de Telemedicina"
- Data e local
- Corpo do texto completo e formal
- Local para assinatura do médico com CRM
- Rodapé com nota sobre documento gerado digitalmente

IMPORTANTE: Este é apenas um RASCUNHO para revisão do médico. O documento final deve ser validado e assinado pelo profissional.`;

    try {
      const resp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          role: primaryRole,
          context: `Geração de documento: ${selectedDoc.label}`,
        }),
      });

      if (!resp.ok) throw new Error("Erro na geração");
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setResult(fullContent);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      logError("AI tab error", e);
      setResult("😕 Erro ao gerar documento. Tente novamente.");
    }
    setIsLoading(false);
  }, [docType, patientName, patientCPF, details, primaryRole]);

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copiado!");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const selectedDoc = DOC_TYPES.find(d => d.value === docType);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("ALLO MÉDICO — Plataforma de Telemedicina", 105, 15, { align: "center" });
    doc.setDrawColor(0, 150, 136);
    doc.line(20, 18, 190, 18);
    
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(selectedDoc?.label.replace(/[^\w\s]/g, "").trim() || "Documento", 105, 28, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(80);
    
    // Clean markdown for PDF
    const cleanText = result
      .replace(/\*\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/---/g, "")
      .replace(/\n{3,}/g, "\n\n");
    
    const lines = doc.splitTextToSize(cleanText, 170);
    doc.text(lines, 20, 38);

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("⚠️ RASCUNHO — Documento gerado por IA para revisão do médico responsável.", 105, 285, { align: "center" });

    doc.save(`${docType || "documento"}-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF gerado!");
  };

  const printResult = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${DOC_TYPES.find(d => d.value === docType)?.label || "Documento"}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;font-size:14px;line-height:1.6}
      h1,h2,h3{color:#333}p{margin:8px 0}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #ccc;font-size:11px;color:#999}</style>
      </head><body>${result.replace(/\n/g, "<br>")}<div class="footer">⚠️ RASCUNHO — Gerado por IA para revisão do médico responsável.</div></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Geração de Documentos com IA
          </CardTitle>
          <CardDescription className="text-xs">
            Gere rascunhos profissionais para revisão e assinatura do médico. Exporte como PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Tipo de Documento</label>
            <Select value={docType} onValueChange={setDocType} disabled={isLoading}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione o tipo..." />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    <div className="flex flex-col">
                      <span>{d.label}</span>
                      <span className="text-[11px] text-muted-foreground">{d.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome do Paciente</label>
              <Input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Nome completo"
                className="text-sm"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">CPF (opcional)</label>
              <Input
                value={patientCPF}
                onChange={(e) => setPatientCPF(e.target.value)}
                placeholder="000.000.000-00"
                className="text-sm"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Detalhes / Informações Clínicas</label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Ex: Paciente necessita de repouso por 5 dias devido a virose com febre alta..."
              className="min-h-[80px] text-sm"
              disabled={isLoading}
            />
          </div>

          <Button onClick={generate} disabled={!docType || !details.trim() || isLoading} className="gap-1.5" size="lg">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Gerar Rascunho
          </Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">📄 Rascunho Gerado</CardTitle>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={copyResult} className="gap-1 text-xs h-8">
                      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1 text-xs h-8">
                      <FileDown className="w-3.5 h-3.5" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={printResult} className="gap-1 text-xs h-8">
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed bg-muted/30 p-4 rounded-xl border border-border/50">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
                <p className="text-[10px] text-muted-foreground mt-3">
                  ⚠️ Este é um rascunho gerado por IA. O documento final deve ser revisado, validado e assinado pelo médico responsável.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIDocumentsTab;
