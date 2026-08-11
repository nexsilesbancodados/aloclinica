import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Bot, Sparkles, Trash2, Copy, Check, MessageSquare, Maximize2, Minimize2, Mic, MicOff, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { PingoMascot } from "@/components/mascot/PingoMascot";
import { SUPABASE_FUNCTIONS_URL } from "@/lib/supabase-config";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

type Msg = { role: "user" | "assistant"; content: string };

export function PingoAssistantChat() {
  const { roles } = useAuth();
  const location = useLocation();
  const forceRole = new URLSearchParams(location.search).get("role");
  const isAdminShell = roles.includes("admin") && (!forceRole || forceRole === "admin");
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Olá! Eu sou o **Pingo** 🐧, seu assistente inteligente da AloClínica. Como posso ajudar você hoje?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollArea = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [messages, isLoading]);

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
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;
    
    // Prevents duplicate consecutive messages
    if (messages.length > 0 && messages[messages.length - 1].content === text && messages[messages.length - 1].role === "user" && !hasError) {
      return;
    }

    setInput("");

    const userMsg: Msg = { role: "user", content: text };
    const currentMessages = [...messages, userMsg];

    setLastUserMessage(text);
    setHasError(false);
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

    const performRequest = async (retryCount = 0, msgsToSend = currentMessages): Promise<void> => {
      try {
        const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/pingo-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: msgsToSend,
            role: "patient",
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          console.error(`Pingo Chat error: ${resp.status}`, errText);
          throw new Error(resp.status === 429 ? "rate_limit" : "api_error");
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
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) upsert(content);
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      } catch (e: any) {
        if (retryCount < 1) return performRequest(retryCount + 1, msgsToSend);
        setHasError(true);
        logError("Pingo Assistant Chat error", e);
      }
    };

    await performRequest();
    setIsLoading(false);
  }, [input, isLoading, messages]);

  const copyMessage = (idx: number) => {
    navigator.clipboard.writeText(messages[idx]?.content ?? "");
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (isAdminShell) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              "pointer-events-auto bg-background border border-border/60 shadow-2xl rounded-3xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
              isMaximized 
                ? "fixed inset-4 md:inset-10 z-[101] w-auto h-auto rounded-3xl" 
                : "w-[90vw] sm:w-[380px] h-[550px] max-h-[80vh]"
            )}
          >
            {/* Header */}
            <div className="bg-primary px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-none">Pingo IA</h3>
                  <p className="text-[10px] text-white/70 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-medical-green animate-pulse" />
                    Online agora
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  onClick={() => setIsMaximized(!isMaximized)}
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <ScrollArea ref={scrollRef} className="flex-1 p-4 bg-muted/5 scrollbar-hide">
              <div className="space-y-5">
                {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                          <Bot className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      <div className={cn(
                        "relative group max-w-[85%] px-4 py-2.5 rounded-2xl text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-card border border-border/50 text-foreground rounded-tl-none shadow-sm"
                      )}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                        
                        {msg.role === "assistant" && (
                          <div className="absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyMessage(i)}
                              className="w-5 h-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted"
                              title="Copiar"
                            >
                              {copiedIdx === i ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                }
                {hasError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 flex flex-col items-center text-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-foreground">Conexão instável</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Não foi possível processar sua mensagem devido a uma instabilidade momentânea.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="rounded-full h-8 px-4 gap-2 text-xs border-destructive/30 hover:bg-destructive/5"
                        onClick={() => {
                          setMessages(prev => prev.slice(0, -1));
                          setHasError(false);
                        }}
                      >
                        Limpar erro
                      </Button>
                      <Button 
                        size="sm" 
                        className="rounded-full h-8 px-4 gap-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => send(lastUserMessage)}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Tentar novamente
                      </Button>
                    </div>
                  </motion.div>
                )}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1">
                      <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 bg-background border-t border-border shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
              {messages.length === 1 && !isLoading && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {["Como agendar?", "Especialidades", "Valor consulta"].map(h => (
                    <button key={h} onClick={() => send(h)} className="text-[10px] font-semibold px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors">
                      {h}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Como posso te ajudar hoje?"
                  className="min-h-[46px] max-h-32 pr-20 py-3 rounded-2xl resize-none bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/20 text-xs scrollbar-hide transition-all"
                  rows={1}
                />
                <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "w-8 h-8 rounded-xl transition-all",
                      isListening ? "text-red-500 bg-red-50 animate-pulse" : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={toggleVoice}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    className={cn(
                      "w-8 h-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-90",
                      (!input.trim() || isLoading) && "opacity-50 grayscale"
                    )}
                    disabled={!input.trim() || isLoading}
                    onClick={() => send()}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 px-1">
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-primary" /> 
                  IA da AloClínica
                </p>
                {messages.length > 1 && (
                  <button 
                    onClick={() => setMessages([messages[0]])}
                    className="text-[9px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-2.5 h-2.5" /> Limpar conversa
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger Button */}
      <motion.button
        className="pointer-events-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 relative z-[102] group"
        whileHover={{ scale: 1.05, y: -4 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
            >
              <X className="w-7 h-7 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="pingo"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="relative"
            >
              <PingoMascot variant="logo" size={50} className="drop-shadow-none" bounce={false} />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-medical-green rounded-full border-2 border-primary flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-4 py-2 bg-white rounded-2xl shadow-xl border border-border/50 text-foreground text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none translate-x-4 group-hover:translate-x-0">
            Dúvidas? Fale comigo! 🐧
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-white rotate-45 border-t border-r border-border/50" />
          </div>
        )}
      </motion.button>
    </div>
  );
}
