import { useState, useEffect, useRef } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getPatientNav } from "./patientNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { QrCode, DownloadSimple, ShareNetwork, PencilSimple, Check, X, Drop, Warning,
         Phone, Person, Shield, Heart, Hospital, IdentificationCard } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface HealthCardData {
  id?: string;
  card_number?: string;
  blood_type?: string;
  allergies?: string[];
  chronic_conditions?: string[];
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  health_plan_name?: string;
  health_plan_number?: string;
  health_plan_valid_until?: string;
  sus_card_number?: string;
  organ_donor?: boolean;
  notes?: string;
  qr_token?: string;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const bloodTypeColors: Record<string, string> = {
  "A+": "bg-red-500", "A-": "bg-red-400",
  "B+": "bg-blue-500", "B-": "bg-blue-400",
  "AB+": "bg-purple-500", "AB-": "bg-purple-400",
  "O+": "bg-orange-500", "O-": "bg-orange-400",
};

export default function HealthCardPage() {
  const { user, profile } = useAuth();
  const [card, setCard] = useState<HealthCardData>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<HealthCardData>({});
  const [allergyInput, setAllergyInput] = useState("");
  const [conditionInput, setConditionInput] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  useEffect(() => {
    if (!user) return;
    fetchCard();
  }, [user]);

  const fetchCard = async () => {
    setLoading(true);
    const { data } = await db
      .from("health_cards" as any)
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (data) {
      setCard(data as HealthCardData);
    } else {
      // Auto-create empty card
      const { data: newCard } = await db
        .from("health_cards" as any)
        .insert({ user_id: user!.id })
        .select()
        .single();
      if (newCard) setCard(newCard as HealthCardData);
    }
    setLoading(false);
  };

  const startEdit = () => {
    setDraft({ ...card });
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft({});
    setEditing(false);
  };

  const saveCard = async () => {
    if (!user || !card.id) return;
    setSaving(true);
    const { error } = await db
      .from("health_cards" as any)
      .update({
        blood_type: draft.blood_type,
        allergies: draft.allergies ?? [],
        chronic_conditions: draft.chronic_conditions ?? [],
        emergency_contact_name: draft.emergency_contact_name,
        emergency_contact_phone: draft.emergency_contact_phone,
        emergency_contact_relation: draft.emergency_contact_relation,
        health_plan_name: draft.health_plan_name,
        health_plan_number: draft.health_plan_number,
        health_plan_valid_until: draft.health_plan_valid_until || null,
        sus_card_number: draft.sus_card_number,
        organ_donor: draft.organ_donor ?? false,
        notes: draft.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", card.id);

    if (error) {
      toast.error("Erro ao salvar cartão");
    } else {
      setCard({ ...card, ...draft });
      setEditing(false);
      toast.success("Cartão atualizado com sucesso!");
    }
    setSaving(false);
  };

  const addAllergy = () => {
    if (!allergyInput.trim()) return;
    setDraft(d => ({ ...d, allergies: [...(d.allergies ?? []), allergyInput.trim()] }));
    setAllergyInput("");
  };

  const addCondition = () => {
    if (!conditionInput.trim()) return;
    setDraft(d => ({ ...d, chronic_conditions: [...(d.chronic_conditions ?? []), conditionInput.trim()] }));
    setConditionInput("");
  };

  const removeItem = (key: "allergies" | "chronic_conditions", index: number) => {
    setDraft(d => ({ ...d, [key]: (d[key] ?? []).filter((_, i) => i !== index) }));
  };

  const downloadCard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext("2d")!;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 800, 450);
    gradient.addColorStop(0, "#1a6fc4");
    gradient.addColorStop(1, "#0f4c8a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 450);

    // White card area
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.roundRect(20, 20, 760, 410, 20);
    ctx.fill();

    // Header
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 36px Arial";
    ctx.fillText("AloClínica", 40, 70);
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("CARTÃO SAÚDE DIGITAL", 40, 95);

    // Card number
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "14px monospace";
    ctx.fillText(card.card_number ?? "", 40, 130);

    // Patient name
    ctx.fillStyle = "white";
    ctx.font = "bold 28px Arial";
    ctx.fillText(fullName || "Nome do Paciente", 40, 200);

    // Blood type badge
    if (card.blood_type) {
      ctx.fillStyle = "#ef4444";
      ctx.roundRect(40, 220, 80, 40, 10);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 20px Arial";
      ctx.fillText(card.blood_type, 60, 247);
    }

    // Donor
    if (card.organ_donor) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText("♥ Doador de Órgãos", 140, 247);
    }

    // Emergency contact
    if (card.emergency_contact_name) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "14px Arial";
      ctx.fillText(`Emergência: ${card.emergency_contact_name} · ${card.emergency_contact_phone ?? ""}`, 40, 310);
    }

    // Health plan
    if (card.health_plan_name) {
      ctx.fillText(`Plano: ${card.health_plan_name} · ${card.health_plan_number ?? ""}`, 40, 335);
    }

    const link = document.createElement("a");
    link.download = `cartao-saude-${fullName.replace(/\s/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Cartão baixado!");
  };

  const shareCard = async () => {
    const url = `${window.location.origin}/cartao/${card.qr_token}`;
    if (navigator.share) {
      await navigator.share({ title: "Meu Cartão Saúde - AloClínica", url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado para a área de transferência!");
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Paciente" nav={getPatientNav("health-card")}>
        <div className="space-y-4 max-w-2xl mx-auto">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("health-card")}>
      <div className="max-w-2xl mx-auto pb-24 md:pb-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <IdentificationCard size={24} weight="fill" className="text-primary" />
              Cartão Saúde Digital
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Suas informações médicas essenciais — sempre disponíveis
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={shareCard} className="gap-1.5">
              <ShareNetwork size={14} weight="bold" /> Compartilhar
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCard} className="gap-1.5">
              <DownloadSimple size={14} weight="bold" /> Baixar
            </Button>
          </div>
        </div>

        {/* Digital Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl shadow-2xl"
          style={{ background: "linear-gradient(135deg, #1a6fc4 0%, #0f4c8a 60%, #062a52 100%)" }}
        >
          {/* Ambient circles */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-blue-300/10 blur-2xl" />

          <div className="relative p-7">
            {/* Top row */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <p className="text-white/50 text-[10px] font-bold tracking-[0.2em] uppercase mb-1">AloClínica</p>
                <p className="text-white/30 text-[9px] tracking-widest font-mono">{card.card_number}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {card.organ_donor && (
                  <Badge className="bg-rose-500/80 text-white text-[9px] font-bold border-0">
                    ♥ DOADOR
                  </Badge>
                )}
                {card.blood_type && (
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg", bloodTypeColors[card.blood_type] ?? "bg-red-500")}>
                    {card.blood_type}
                  </div>
                )}
                <QrCode size={44} className="text-white/60" weight="regular" />
              </div>
            </div>

            {/* Patient name */}
            <div className="mb-6">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mb-1">Titular</p>
              <p className="text-white font-bold text-2xl leading-tight">
                {fullName || "Seu Nome Completo"}
              </p>
              {profile?.cpf && (
                <p className="text-white/50 text-xs font-mono mt-1">CPF {profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
              )}
            </div>

            {/* Bottom info row */}
            <div className="grid grid-cols-3 gap-4">
              {card.health_plan_name ? (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Plano</p>
                  <p className="text-white/80 text-xs font-semibold truncate">{card.health_plan_name}</p>
                  {card.health_plan_number && (
                    <p className="text-white/50 text-[10px] font-mono">{card.health_plan_number}</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Plano</p>
                  <p className="text-white/40 text-xs italic">Não informado</p>
                </div>
              )}

              {card.sus_card_number ? (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Cartão SUS</p>
                  <p className="text-white/80 text-[10px] font-mono">{card.sus_card_number}</p>
                </div>
              ) : (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Cartão SUS</p>
                  <p className="text-white/40 text-xs italic">Não informado</p>
                </div>
              )}

              <div>
                <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Válido até</p>
                <p className="text-white/80 text-xs">
                  {card.health_plan_valid_until
                    ? new Date(card.health_plan_valid_until).toLocaleDateString("pt-BR", { month: "2-digit", year: "2-digit" })
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Alerts section */}
        {((card.allergies?.length ?? 0) > 0 || (card.chronic_conditions?.length ?? 0) > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/30 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Warning size={16} weight="fill" className="text-amber-600" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Informações Clínicas Importantes</span>
            </div>
            {(card.allergies?.length ?? 0) > 0 && (
              <div className="mb-2">
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-1.5">Alergias</p>
                <div className="flex flex-wrap gap-1.5">
                  {card.allergies!.map((a, i) => (
                    <Badge key={i} className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 text-[11px]">⚠️ {a}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(card.chronic_conditions?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-1.5">Condições Crônicas</p>
                <div className="flex flex-wrap gap-1.5">
                  {card.chronic_conditions!.map((c, i) => (
                    <Badge key={i} className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 text-[11px]">🏥 {c}</Badge>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Emergency Contact */}
        {card.emergency_contact_name && (
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
              <Phone size={18} weight="fill" className="text-red-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Contato de Emergência</p>
              <p className="font-bold text-foreground">{card.emergency_contact_name}</p>
              <p className="text-sm text-muted-foreground">{card.emergency_contact_phone} · {card.emergency_contact_relation}</p>
            </div>
          </div>
        )}

        {/* Edit button */}
        {!editing && (
          <Button onClick={startEdit} className="w-full gap-2" variant="outline">
            <PencilSimple size={16} weight="bold" /> Editar Cartão Saúde
          </Button>
        )}

        {/* Edit Form */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-border bg-card p-5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">Editar Informações</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1.5">
                      <X size={14} /> Cancelar
                    </Button>
                    <Button size="sm" onClick={saveCard} disabled={saving} className="gap-1.5">
                      <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>

                {/* Blood type */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <Drop size={14} className="text-red-500" /> Tipo Sanguíneo
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {BLOOD_TYPES.map(bt => (
                      <button
                        key={bt}
                        onClick={() => setDraft(d => ({ ...d, blood_type: bt }))}
                        className={cn(
                          "w-12 h-12 rounded-xl font-bold text-sm transition-all border-2",
                          draft.blood_type === bt
                            ? "border-primary bg-primary text-primary-foreground scale-110 shadow-lg"
                            : "border-border bg-background text-foreground hover:border-primary/50"
                        )}
                      >
                        {bt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Organ Donor */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50">
                  <div className="flex items-center gap-2.5">
                    <Heart size={16} weight="fill" className="text-rose-500" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Doador de Órgãos</p>
                      <p className="text-xs text-muted-foreground">Autoriza a doação de órgãos em caso de necessidade</p>
                    </div>
                  </div>
                  <Switch
                    checked={draft.organ_donor ?? false}
                    onCheckedChange={v => setDraft(d => ({ ...d, organ_donor: v }))}
                  />
                </div>

                {/* Allergies */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Warning size={14} className="text-amber-500" /> Alergias
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Penicilina, Dipirona, Amendoim"
                      value={allergyInput}
                      onChange={e => setAllergyInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addAllergy()}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={addAllergy} size="sm">Adicionar</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(draft.allergies ?? []).map((a, i) => (
                      <Badge key={i} className="bg-red-100 text-red-700 gap-1.5 cursor-pointer hover:bg-red-200"
                        onClick={() => removeItem("allergies", i)}>
                        {a} <X size={10} />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Chronic Conditions */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Hospital size={14} className="text-blue-500" /> Condições Crônicas
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Diabetes, Hipertensão, Asma"
                      value={conditionInput}
                      onChange={e => setConditionInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCondition()}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={addCondition} size="sm">Adicionar</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(draft.chronic_conditions ?? []).map((c, i) => (
                      <Badge key={i} className="bg-blue-100 text-blue-700 gap-1.5 cursor-pointer hover:bg-blue-200"
                        onClick={() => removeItem("chronic_conditions", i)}>
                        {c} <X size={10} />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Phone size={14} className="text-red-500" /> Contato de Emergência
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Nome completo" value={draft.emergency_contact_name ?? ""} onChange={e => setDraft(d => ({ ...d, emergency_contact_name: e.target.value }))} />
                    <Input placeholder="Telefone" value={draft.emergency_contact_phone ?? ""} onChange={e => setDraft(d => ({ ...d, emergency_contact_phone: e.target.value }))} />
                    <Input placeholder="Parentesco (ex: Cônjuge, Filho)" value={draft.emergency_contact_relation ?? ""} onChange={e => setDraft(d => ({ ...d, emergency_contact_relation: e.target.value }))} />
                  </div>
                </div>

                {/* Health Plan */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Shield size={14} className="text-emerald-500" /> Plano de Saúde
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Nome do plano" value={draft.health_plan_name ?? ""} onChange={e => setDraft(d => ({ ...d, health_plan_name: e.target.value }))} />
                    <Input placeholder="Nº da carteirinha" value={draft.health_plan_number ?? ""} onChange={e => setDraft(d => ({ ...d, health_plan_number: e.target.value }))} />
                    <div>
                      <Label className="text-xs text-muted-foreground">Validade</Label>
                      <Input type="date" value={draft.health_plan_valid_until ?? ""} onChange={e => setDraft(d => ({ ...d, health_plan_valid_until: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Cartão SUS</Label>
                      <Input placeholder="Nº Cartão SUS" value={draft.sus_card_number ?? ""} onChange={e => setDraft(d => ({ ...d, sus_card_number: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Observações Médicas</Label>
                  <Textarea
                    placeholder="Outras informações importantes para emergências..."
                    value={draft.notes ?? ""}
                    onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QR Code info */}
        <div className="rounded-2xl border border-dashed border-border p-4 flex items-center gap-4 bg-muted/30">
          <QrCode size={44} weight="regular" className="text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Código QR de Identificação</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Médicos e emergências podem escanear para acessar suas informações médicas essenciais.
              Token: <span className="font-mono text-primary">{card.qr_token?.slice(0, 8)}...</span>
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
