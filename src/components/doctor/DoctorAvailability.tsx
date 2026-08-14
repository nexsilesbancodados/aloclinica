import { useState, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDoctorNav } from "./doctorNav";
import { Plus, Trash2, Clock, CalendarOff, Zap, CalendarDays, Copy, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

const daysOfWeek = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const timeOptions = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface Absence {
  id: string;
  absence_date: string;
  reason: string | null;
}

const DoctorAvailability = () => {
  const { user } = useAuth();
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [newDay, setNewDay] = useState("1");
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("12:00");
  const [absenceDate, setAbsenceDate] = useState("");
  const [absenceEnd, setAbsenceEnd] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  // Bulk add: dias selecionados pra aplicar o mesmo horário (Seg-Sex por padrão)
  const [bulkDays, setBulkDays] = useState<number[]>([]);
  const PRESETS: { label: string; days: number[] }[] = [
    { label: "Seg-Sex", days: [1, 2, 3, 4, 5] },
    { label: "Sáb+Dom", days: [0, 6] },
    { label: "Todos os dias", days: [0, 1, 2, 3, 4, 5, 6] },
  ];
  const [loading, setLoading] = useState(true);
  const [availableNow, setAvailableNow] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);

  useEffect(() => { if (user) fetchDoctorProfile(); }, [user]);

  const fetchDoctorProfile = async () => {
    const { data } = await db
      .from("doctor_profiles")
      .select("id, is_on_duty")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setDoctorProfileId(data.id);
      setAvailableNow(data.is_on_duty ?? false);
      fetchSlots(data.id);
      fetchAbsences(data.id);
    }
    setLoading(false);
  };

  const toggleAvailableNow = async () => {
    if (!doctorProfileId) {
      toast.error("Perfil médico não encontrado");
      return;
    }
    setTogglingAvailability(true);
    try {
      const newVal = !availableNow;
      const { error } = await db.from("doctor_profiles").update({
        is_on_duty: newVal,
      } as any).eq("id", doctorProfileId);
      if (error) {
        toast.error("Erro ao atualizar disponibilidade");
      } else {
        setAvailableNow(newVal);
        toast.success(newVal ? "🟢 Online para consultas imediatas!" : "Modo plantão desativado.");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setTogglingAvailability(false);
    }
  };

  const fetchSlots = async (profileId: string) => {
    const { data } = await db
      .from("availability_slots")
      .select("*")
      .eq("doctor_id", profileId)
      .order("day_of_week")
      .order("start_time");
    if (data) setSlots(data.map(s => ({ ...s, is_active: s.is_active ?? true })));
  };

  const fetchAbsences = async (profileId: string) => {
    const { data } = await db
      .from("doctor_absences")
      .select("*")
      .eq("doctor_id", profileId)
      .gte("absence_date", new Date().toISOString().split("T")[0])
      .order("absence_date");
    if (data) setAbsences(data);
  };

  const addSlot = async () => {
    if (!doctorProfileId) return;
    const dayNum = parseInt(newDay);
    const overlapping = slots.filter(s =>
      s.day_of_week === dayNum &&
      s.is_active &&
      newStart < s.end_time &&
      newEnd > s.start_time
    );
    if (overlapping.length > 0) {
      toast.error("Conflito de horário");
      return;
    }
    const { error } = await db.from("availability_slots").insert({
      doctor_id: doctorProfileId,
      day_of_week: dayNum,
      start_time: newStart,
      end_time: newEnd,
    });
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Horário adicionado!");
      fetchSlots(doctorProfileId);
    }
  };

  const removeSlot = async (id: string) => {
    await db.from("availability_slots").delete().eq("id", id);
    if (doctorProfileId) fetchSlots(doctorProfileId);
  };

  const toggleSlotActive = async (slot: Slot) => {
    const { error } = await db.from("availability_slots")
      .update({ is_active: !slot.is_active } as any)
      .eq("id", slot.id);
    if (error) toast.error("Erro ao atualizar");
    else if (doctorProfileId) fetchSlots(doctorProfileId);
  };

  const copyDayTo = async (sourceDay: number, targetDay: number) => {
    if (!doctorProfileId || sourceDay === targetDay) return;
    const sourceSlots = slots.filter(s => s.day_of_week === sourceDay);
    if (sourceSlots.length === 0) return;
    const rows = sourceSlots
      .filter(s => !slots.some(e => e.day_of_week === targetDay && e.start_time === s.start_time && e.end_time === s.end_time))
      .map(s => ({ doctor_id: doctorProfileId, day_of_week: targetDay, start_time: s.start_time, end_time: s.end_time }));
    if (rows.length === 0) { toast.info(`${daysOfWeek[targetDay]} já tem esses horários`); return; }
    const { error } = await db.from("availability_slots").insert(rows);
    if (error) toast.error("Erro ao copiar");
    else { toast.success(`Copiado para ${daysOfWeek[targetDay]}`); fetchSlots(doctorProfileId); }
  };

  /** Adiciona o mesmo horário em todos os dias selecionados (bulkDays). */
  const addBulkSlots = async () => {
    if (!doctorProfileId || bulkDays.length === 0) return;
    if (newStart >= newEnd) { toast.error("Início deve ser antes do fim"); return; }
    const rows: Array<{ doctor_id: string; day_of_week: number; start_time: string; end_time: string }> = [];
    const skipped: string[] = [];
    for (const day of bulkDays) {
      const overlap = slots.some(s => s.day_of_week === day && s.is_active && newStart < s.end_time && newEnd > s.start_time);
      if (overlap) skipped.push(daysOfWeek[day]);
      else rows.push({ doctor_id: doctorProfileId, day_of_week: day, start_time: newStart, end_time: newEnd });
    }
    if (rows.length === 0) { toast.error("Todos os dias selecionados têm conflito"); return; }
    const { error } = await db.from("availability_slots").insert(rows);
    if (error) toast.error("Erro ao adicionar em lote");
    else {
      toast.success(`${rows.length} horário(s) adicionado(s)`, {
        description: skipped.length > 0 ? `Conflito ignorado em: ${skipped.join(", ")}` : undefined,
      });
      setBulkDays([]);
      fetchSlots(doctorProfileId);
    }
  };

  const addAbsence = async () => {
    if (!doctorProfileId || !absenceDate) return;
    const start = parseISO(absenceDate);
    const end = absenceEnd ? parseISO(absenceEnd) : start;
    if (end < start) { toast.error("Data final antes da inicial"); return; }
    const days = eachDayOfInterval({ start, end });
    const existing = new Set(absences.map(a => a.absence_date));
    const reason = absenceReason.trim() || null;
    const rows = days
      .map(d => format(d, "yyyy-MM-dd"))
      .filter(date => !existing.has(date))
      .map(date => ({ doctor_id: doctorProfileId, absence_date: date, reason }));
    if (rows.length === 0) { toast.info("Essas datas já estão marcadas como folga"); return; }
    const { error } = await db.from("doctor_absences").insert(rows);
    if (error) toast.error("Erro ao registrar folga");
    else {
      toast.success(rows.length === 1 ? "Folga registrada!" : `${rows.length} dias marcados como folga`);
      setAbsenceDate("");
      setAbsenceEnd("");
      setAbsenceReason("");
      fetchAbsences(doctorProfileId);
    }
  };

  const removeAbsence = async (id: string) => {
    await db.from("doctor_absences").delete().eq("id", id);
    if (doctorProfileId) fetchAbsences(doctorProfileId);
  };

  const grouped = daysOfWeek.map((day, i) => ({
    day,
    index: i,
    slots: slots.filter(s => s.day_of_week === i),
  }));

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("availability")}>
      <div className="w-full mx-auto max-w-4xl space-y-6 pb-24 md:pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Disponibilidade</h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-0.5">Gestão de Agenda</p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative overflow-hidden rounded-[28px] border p-6 transition-all ${availableNow ? "border-emerald-500/20 bg-emerald-500/5 shadow-[0_8px_30px_rgba(16,185,129,0.1)]" : "border-border/40 bg-card/60"}`}
        >
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-transform ${availableNow ? "bg-emerald-100 border-emerald-200 text-emerald-600 scale-110" : "bg-muted border-border/50 text-muted-foreground"}`}>
                <Zap className={`w-6 h-6 ${availableNow ? "fill-current" : ""}`} />
              </div>
              <div>
                <p className="font-black text-foreground text-[15px]">Disponível para Agora</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[240px]">
                  {availableNow ? "Você está visível para consultas imediatas." : "Ative para ser listado no plantão 24h."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-black uppercase tracking-widest ${availableNow ? "text-emerald-600" : "text-muted-foreground"}`}>
                {availableNow ? "ATIVO" : "OFFLINE"}
              </span>
              <Switch checked={availableNow} onCheckedChange={toggleAvailableNow} disabled={togglingAvailability} className="data-[state=checked]:bg-emerald-500" />
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-border/40 bg-card/60 backdrop-blur-sm p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 mb-5 px-1 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Adicionar Horário Semanal
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block">DIA</label>
                  <Select value={newDay} onValueChange={setNewDay}>
                    <SelectTrigger className="h-12 rounded-2xl border-border/50 bg-muted/30"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {daysOfWeek.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block">INÍCIO</label>
                  <Select value={newStart} onValueChange={setNewStart}>
                    <SelectTrigger className="h-12 rounded-2xl border-border/50 bg-muted/30"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">{timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block">FIM</label>
                  <Select value={newEnd} onValueChange={setNewEnd}>
                    <SelectTrigger className="h-12 rounded-2xl border-border/50 bg-muted/30"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">{timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={addSlot} className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] col-span-2 sm:col-span-1 shadow-lg shadow-emerald-500/20">
                  <Plus className="w-4 h-4 mr-1" /> ADICIONAR
                </Button>
              </div>

              {/* Bulk: aplicar mesmo horário em vários dias de uma vez */}
              <div className="mt-5 pt-5 border-t border-border/30">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 mb-3">
                  Ou aplique em vários dias
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setBulkDays(p.days)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-full border border-border/50 bg-muted/30 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {daysOfWeek.map((d, i) => {
                    const active = bulkDays.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBulkDays(prev => active ? prev.filter(x => x !== i) : [...prev, i])}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted/30 border-border/50 hover:border-emerald-500/40"}`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                <Button
                  onClick={addBulkSlots}
                  disabled={bulkDays.length === 0}
                  variant="outline"
                  className="h-10 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5 font-bold text-[11px] gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Aplicar {newStart}–{newEnd} em {bulkDays.length} dia{bulkDays.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-border/40 bg-card/60 backdrop-blur-sm p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 mb-5 px-1 flex items-center gap-2">
                <CalendarOff className="w-3 h-3 text-destructive" /> Folgas e Ausências
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-4 items-end mb-6">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block uppercase">DE</label>
                  <Input type="date" value={absenceDate} onChange={e => setAbsenceDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="h-12 rounded-2xl border-border/50 bg-muted/30" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block uppercase">ATÉ <span className="text-muted-foreground/50 normal-case">(opcional)</span></label>
                  <Input type="date" value={absenceEnd} onChange={e => setAbsenceEnd(e.target.value)} min={absenceDate || new Date().toISOString().split("T")[0]} className="h-12 rounded-2xl border-border/50 bg-muted/30" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted-foreground px-1 mb-1.5 block uppercase">MOTIVO</label>
                  <Input placeholder="Ex: Feriado, Congresso..." value={absenceReason} onChange={e => setAbsenceReason(e.target.value)} className="h-12 rounded-2xl border-border/50 bg-muted/30" />
                </div>
                <Button onClick={addAbsence} variant="outline" className="h-12 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/10 font-bold text-[11px] px-6 gap-2">
                  <CalendarOff className="w-4 h-4" /> MARCAR
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {absences.map((a) => (
                    <motion.div key={a.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-2 py-1.5 px-3.5 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-[11px] font-bold">
                      <CalendarOff className="w-3 h-3" />
                      {format(parseISO(a.absence_date), "dd MMM", { locale: ptBR })}
                      <button onClick={() => removeAbsence(a.id)} className="ml-1 hover:scale-125 transition-transform"><Trash2 className="w-3 h-3" /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 px-1 flex items-center gap-2"><CalendarDays className="w-3 h-3" /> Horários Ativos</p>
            <AnimatePresence mode="popLayout">
              {grouped.filter(g => g.slots.length > 0).map((g, gi) => (
                <motion.div key={g.index} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: gi * 0.05 }} className="rounded-[24px] border border-border/40 bg-card/60 backdrop-blur-sm p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[12px] font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{g.day}
                    </h3>
                    <Select onValueChange={(v) => copyDayTo(g.index, parseInt(v))}>
                      <SelectTrigger className="h-7 w-auto px-2 gap-1 rounded-lg border-border/40 bg-muted/30 text-[10px] font-bold uppercase tracking-wider">
                        <Copy className="w-3 h-3" />
                        <span className="hidden sm:inline">Copiar para</span>
                      </SelectTrigger>
                      <SelectContent>
                        {daysOfWeek.map((d, i) => i !== g.index && <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.slots.map(s => (
                      <div key={s.id} className={`group flex items-center gap-2 py-1.5 px-3.5 rounded-xl border text-[11px] font-black shadow-sm transition-opacity ${s.is_active ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-border/40 bg-muted/30 text-muted-foreground opacity-60"}`}>
                        <Clock className="w-3 h-3 opacity-60" />{s.start_time.slice(0, 5)} — {s.end_time.slice(0, 5)}
                        <button
                          title={s.is_active ? "Desativar" : "Ativar"}
                          onClick={() => toggleSlotActive(s)}
                          className={`ml-1 hover:scale-125 transition-all ${s.is_active ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
                        >
                          <Power className="w-3 h-3" />
                        </button>
                        <button onClick={() => removeSlot(s.id)} className="opacity-0 group-hover:opacity-100 hover:text-destructive hover:scale-125 transition-all"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DoctorAvailability;
