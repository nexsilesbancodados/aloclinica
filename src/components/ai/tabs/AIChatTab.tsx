import { logError } from "@/lib/logger";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Send, Bot, Sparkles, Trash2, Copy, Check, Save, Download,
  Stethoscope, FileText, Calculator, Brain, Mic, MicOff,
  ClipboardList, Users, BarChart3, MessageSquare, RefreshCw,
  Zap, Heart, Shield, Pill
} from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

import { AI_URL } from "@/lib/ai";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ElementType;
  color?: string;
}

const quickActionsByRole: Record<string, QuickAction[]> = {
  patient: [
    { label: "Preparar consulta", prompt: "Quais perguntas devo fazer ao médico na minha próxima consulta?", icon: ClipboardList, color: "text-blue-500" },
    { label: "Entender plano", prompt: "Explique os benefícios do meu plano atual e se vale a pena fazer upgrade.", icon: Shield, color: "text-emerald-500" },
    { label: "Sintomas comuns", prompt: "Tenho dor de cabeça frequente. Qual especialista devo procurar?", icon: Brain, color: "text-purple-500" },
    { label: "Receita médica", prompt: "Ajude-me a entender minha última receita médica de forma simplificada.", icon: Pill, color: "text-orange-500" },
    { label: "Dicas de saúde", prompt: "Quais hábitos diários posso adotar para melhorar minha saúde geral?", icon: Heart, color: "text-rose-500" },
    { label: "Exames", prompt: "Quais exames de rotina devo fazer anualmente na minha faixa etária?", icon: FileText, color: "text-teal-500" },
  ],
  doctor: [
    { label: "Anamnese", prompt: "Sugira perguntas de anamnese para um paciente com queixa de dor torácica.", icon: Stethoscope, color: "text-blue-500" },
    { label: "Nota SOAP", prompt: "Ajude-me a redigir uma nota clínica SOAP para uma consulta de rotina.", icon: FileText, color: "text-emerald-500" },
    { label: "Cálculo pediátrico", prompt: "Calcule a dosagem de amoxicilina para uma criança de 20kg.", icon: Calculator, color: "text-purple-500" },
    { label: "CID-10", prompt: "Qual o CID-10 correto para infecção do trato urinário não complicada?", icon: ClipboardList, color: "text-orange-500" },
    { label: "Interação medicamentosa", prompt: "Verifique possíveis interações entre Losartana, Metformina e AAS.", icon: Pill, color: "text-rose-500" },
    { label: "Protocolo clínico", prompt: "Qual o protocolo atual para manejo de hipertensão estágio 1 em adultos?", icon: Zap, color: "text-teal-500" },
  ],
  admin: [
    { label: "Análise NPS", prompt: "Analise a tendência de NPS e sugira ações para melhorar a satisfação.", icon: BarChart3, color: "text-blue-500" },
    { label: "Comunicado", prompt: "Redija um comunicado para médicos sobre nova funcionalidade de receita digital.", icon: MessageSquare, color: "text-emerald-500" },
    { label: "Métricas", prompt: "Quais KPIs devo monitorar para avaliar a saúde da plataforma?", icon: BarChart3, color: "text-purple-500" },
    { label: "Onboarding", prompt: "Crie um checklist de onboarding para novos médicos da plataforma.", icon: Users, color: "text-orange-500" },
  ],
  receptionist: [
    { label: "Script telefônico", prompt: "Crie um script de atendimento telefônico para agendamento de consultas.", icon: MessageSquare, color: "text-blue-500" },
    { label: "Gestão de fila", prompt: "Como gerenciar encaixes de última hora sem prejudicar a agenda?", icon: Users, color: "text-emerald-500" },
    { label: "Cobrança", prompt: "Como orientar um paciente sobre métodos de pagamento disponíveis?", icon: BarChart3, color: "text-purple-500" },
  ],
  support: [
    { label: "Problema técnico", prompt: "Um paciente não consegue entrar na videochamada. Quais passos de diagnóstico seguir?", icon: Brain, color: "text-blue-500" },
    { label: "Resposta de ticket", prompt: "Redija uma resposta profissional para um paciente insatisfeito com atraso na consulta.", icon: MessageSquare, color: "text-emerald-500" },
    { label: "Escalação", prompt: "Quais critérios usar para escalar um ticket para prioridade alta?", icon: ClipboardList, color: "text-purple-500" },
  ],
  clinic: [
    { label: "Gestão de médicos", prompt: "Como otimizar a distribuição de consultas entre os médicos da clínica?", icon: Users, color: "text-blue-500" },
    { label: "Relatório financeiro", prompt: "Gere um resumo das comissões e receitas da clínica neste mês.", icon: BarChart3, color: "text-emerald-500" },
    { label: "Credenciamento", prompt: "Quais documentos são necessários para credenciar um novo médico na clínica?", icon: ClipboardList, color: "text-purple-500" },
  ],
  partner: [
    { label: "Validação de receita", prompt: "Como validar corretamente uma receita digital recebida pela plataforma?", icon: ClipboardList, color: "text-blue-500" },
    { label: "Integração", prompt: "Quais são as melhores práticas para integrar minha farmácia/laboratório à plataforma?", icon: Brain, color: "text-emerald-500" },
    { label: "Relatório", prompt: "Gere um resumo das validações realizadas neste mês.", icon: BarChart3, color: "text-purple-500" },
  ],
};

interface Props {
  primaryRole: string;
}

const AIChatTab = ({ primaryRole }: Props) => {
  const { user, profile } = useAuth();
  
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const quickActions = quickActionsByRole[primaryRole] || quickActionsByRole.patient;

  const userContext = profile
    ? `Usuário: ${profile.first_name} ${profile.last_name}\nPapel: ${primaryRole}`
    : `Papel: ${primaryRole}`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Count approx tokens
  useEffect(() => {
    const total = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    setTokenCount(total);
  }, [messages]);

  const copyMessage = (idx: number) => {
    navigator.clipboard.writeText(messages[idx]?.content ?? "");
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const exportChat = () => {
    const text = messages.map(m => `[${m.role === "user" ? "Você" : "IA"}]\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-ia-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);

    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success("Chat exportado!");
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Navegador não suporta reconhecimento de voz");
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const saveConversation = async () => {
    if (!user || messages.length === 0) return;
    const title = messages[0]?.content.slice(0, 60) || "Nova conversa";
    const { error } = await db.from("ai_conversations" as any).insert({
      user_id: user.id,
      title,
      messages: JSON.stringify(messages),
      role_context: primaryRole,
    } as any);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("✅ Conversa salva!", { description: "Acesse na aba Histórico." });
    }
  };

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;
    setInput("");

    const userMsg: Msg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          context: userContext || undefined,
          role: primaryRole,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const errorMsg = resp.status === 429
          ? "⏳ Muitas requisições. Aguarde um momento."
          : data.error || "Erro ao conectar com a IA";
        setMessages(prev => [...prev, { role: "assistant", content: `😕 ${errorMsg}` }]);
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("Sem resposta");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (content) upsert(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      logError("AI tab error", e);
      setMessages(prev => [...prev, { role: "assistant", content: "😕 Ocorreu um erro. Tente novamente." }]);
    }
    setIsLoading(false);
  }, [input, isLoading, messages, userContext, primaryRole]);

  const regenerate = useCallback(() => {
    if (messages.length < 2) return;
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === "user");
    if (lastUserIdx === -1) return;
    const idx = messages.length - 1 - lastUserIdx;
    const lastUserMsg = messages[idx].content;
    setMessages(prev => prev.slice(0, idx));
    setTimeout(() => send(lastUserMsg), 100);
  }, [messages, send]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 260px)" }}>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Sparkles className="w-3 h-3" /> DeepSeek
          </Badge>
          {tokenCount > 0 && (
            <span className="text-[10px] text-muted-foreground">~{tokenCount} tokens</span>
          )}
        </div>
        <div className="flex gap-1">
          {messages.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={exportChat} className="text-xs gap-1 text-muted-foreground h-8 px-2">
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={saveConversation} className="text-xs gap-1 text-muted-foreground h-8 px-2">
                <Save className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="text-xs gap-1 text-muted-foreground hover:text-destructive h-8 px-2">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                <Bot className="w-10 h-10 text-primary" />
              </div>
              <motion.div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-background"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-bold text-foreground">
                Olá{profile?.first_name ? `, ${profile.first_name}` : ""}! 👋
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                Sou seu assistente IA personalizado. Escolha uma sugestão ou pergunte qualquer coisa.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full max-w-2xl">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => send(action.prompt)}
                    className="card-interactive flex items-center gap-3 text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 hover:shadow-md transition-all group"
                  >
                    <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                      <Icon className={`w-4 h-4 ${action.color || "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{action.prompt}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`relative group max-w-[80%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3"
                  : "bg-muted/80 rounded-2xl rounded-bl-sm px-4 py-3"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.role === "assistant" && (
                  <div className="absolute -bottom-3 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={() => copyMessage(i)}
                      className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted"
                    >
                      {copiedIdx === i ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                    {i === messages.length - 1 && (
                      <button
                        onClick={regenerate}
                        className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted"
                        title="Regenerar resposta"
                      >
                        <RefreshCw className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted/80 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Pensando</span>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 bg-primary/50 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-border mt-3">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 items-end">
          <div className="relative flex-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Pergunte algo ao assistente..."
              className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm pr-10"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={toggleVoice}
              className={`absolute right-2 bottom-2.5 p-1.5 rounded-lg transition-colors ${
                isListening ? "bg-destructive/10 text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isListening ? "Parar gravação" : "Usar voz"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
          <Button type="submit" size="icon" aria-label="Enviar" disabled={isLoading || !input.trim()} className="shrink-0 h-11 w-11 rounded-xl">
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-muted-foreground">
            A IA pode cometer erros. Sempre confirme informações médicas com um profissional.
          </p>
          {input.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{input.length} caracteres</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIChatTab;
