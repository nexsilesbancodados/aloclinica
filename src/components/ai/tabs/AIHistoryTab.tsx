import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Trash2, MessageSquare, Loader2, Clock, Search, Download, ArrowLeft, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Conversation {
  id: string;
  title: string;
  messages: { role: "user" | "assistant"; content: string }[];
  role_context: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  primaryRole: string;
}

const roleLabels: Record<string, string> = {
  patient: "Paciente", doctor: "Médico", admin: "Admin",
  receptionist: "Recepção", support: "Suporte", clinic: "Clínica",
  partner: "Parceiro",
};

const AIHistoryTab = ({ primaryRole }: Props) => {
  const { user } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await db
      .from("ai_conversations" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setConversations((data as any[]).map((c: any) => ({
        id: c.id as string,
        title: (c.title ?? "Conversa") as string,
        role_context: (c.role_context ?? c.context ?? "patient") as string,
        created_at: c.created_at as string,
        updated_at: (c.updated_at ?? c.created_at) as string,
        messages: typeof c.messages === "string" ? JSON.parse(c.messages) : c.messages,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [user, fetchConversations]);

  const deleteConversation = async (id: string) => {
    const { error } = await db.from("ai_conversations" as any).delete().eq("id", id);
    if (!error) {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (selectedConv?.id === id) setSelectedConv(null);
      toast.success("Conversa excluída");
    }
  };

  const exportConversation = (conv: Conversation) => {
    const text = conv.messages.map((m) => `[${m.role === "user" ? "Você" : "IA"}]\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conv.title.slice(0, 30)}.md`;
    document.body.appendChild(a);

    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success("Conversa exportada!");
  };

  const filtered = conversations.filter(c => {
    const matchSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchRole = filterRole === "all" || c.role_context === filterRole;
    return matchSearch && matchRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedConv) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" aria-label="Ação" onClick={() =>  setSelectedConv(null)} className="shrink-0 h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{selectedConv.title}</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedConv.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                {" · "}{selectedConv.messages.length} mensagens
              </p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => exportConversation(selectedConv)} className="text-xs h-8 px-2">
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { deleteConversation(selectedConv.id); }} className="text-xs h-8 px-2 text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {selectedConv.messages.map((msg, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.5) }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[85%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3"
                  : "bg-muted rounded-2xl rounded-bl-sm px-4 py-3"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nas conversas..."
            className="text-sm pl-9"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-full sm:w-40 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            {Object.entries(roleLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Conversas Salvas</h3>
        <span className="text-xs text-muted-foreground">
          ({filtered.length}{filtered.length !== conversations.length ? ` de ${conversations.length}` : ""})
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {conversations.length === 0
                ? "Nenhuma conversa salva ainda."
                : "Nenhuma conversa encontrada com os filtros atuais."}
            </p>
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Use o botão "Salvar" no Chat para guardar conversas.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((conv, index) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
              >
                <Card
                  className="border-border/50 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => setSelectedConv(conv)}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(conv.updated_at), "dd/MM/yy HH:mm")}
                          </span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">
                            {roleLabels[conv.role_context] || conv.role_context}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {conv.messages.length} msgs
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Exportar" onClick={(ev) => { ev.stopPropagation(); exportConversation(conv); }}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Excluir" onClick={(ev) => { ev.stopPropagation(); deleteConversation(conv.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default AIHistoryTab;
