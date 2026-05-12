import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import mascotWave from "@/assets/mascot-wave.png";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Star, Calendar, Zap, AlertTriangle, SlidersHorizontal, X, Heart, ChevronRight, Clock, Stethoscope, Brain, Eye as EyeIcon, Bone, Baby, Activity, BadgeCheck, ShieldCheck, Languages as LanguagesIcon, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { getPatientNav } from "./patientNav";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface DoctorResult {
  id: string;
  user_id: string;
  crm: string;
  crm_state: string;
  bio: string | null;
  short_description?: string | null;
  consultation_price: number;
  consultation_duration?: number | null;
  rating: number;
  total_reviews: number | null;
  experience_years: number | null;
  available_now?: boolean;
  available_now_since?: string | null;
  display_name?: string | null;
  crm_verified?: boolean;
  kyc_status?: string | null;
  accepts_insurance?: boolean | null;
  languages?: string[] | null;
  profile: { first_name: string; last_name: string; avatar_url: string | null } | null;
  specialties: string[];
  careAreas: string[];
}

const LANG_LABEL: Record<string, string> = { pt: "PT", "pt-BR": "PT", en: "EN", es: "ES", fr: "FR", it: "IT", de: "DE" };

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } }),
};

const RECENT_SEARCHES_KEY = "aloclinica_recent_searches";
const MAX_RECENT = 5;

const getRecentSearches = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]"); } catch { return []; }
};
const saveRecentSearch = (term: string) => {
  if (!term.trim() || term.length < 2) return;
  const recent = getRecentSearches().filter(s => s !== term);
  recent.unshift(term);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
};

const SPECIALTY_ICONS: Record<string, React.ReactNode> = {
  "Cardiologia": <Heart className="w-6 h-6 text-destructive" />,
  "Pediatria": <Baby className="w-6 h-6 text-[hsl(var(--p-primary))]" />,
  "Ortopedia": <Bone className="w-6 h-6 text-warning" />,
  "Ginecologia": <Activity className="w-6 h-6 text-secondary" />,
  "Oftalmologia": <EyeIcon className="w-6 h-6 text-[hsl(var(--p-primary))]" />,
  "Neurologia": <Brain className="w-6 h-6 text-secondary" />,
};

const FREQUENT_SEARCHES = ["Check-up Geral", "Dermatologia", "Nutrição", "Saúde Mental"];

type DoctorTypeFilter = "telemedicina" | "oftalmologia";

const DoctorSearch = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isUrgency = searchParams.get("urgency") === "true";
  const initialQ = searchParams.get("q") ?? "";
  const initialType: DoctorTypeFilter =
    searchParams.get("type") === "oftalmologia" ? "oftalmologia" : "telemedicina";
  const [doctorType, setDoctorType] = useState<DoctorTypeFilter>(initialType);
  const [doctors, setDoctors] = useState<DoctorResult[]>([]);
  const [availableNowIds, setAvailableNowIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState(initialQ);
  const debouncedSearch = useDebounce(search, 300);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches());
  const [showRecent, setShowRecent] = useState(false);
  const [viewMode, setViewMode] = useState<"specialties" | "results">("specialties");

  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [minRating, setMinRating] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("rating");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [insuranceOnly, setInsuranceOnly] = useState(false);
  const [totalDoctors, setTotalDoctors] = useState<number>(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchSpecialties();
    if (user) fetchFavorites();
  }, [user]);

  useEffect(() => {
    fetchDoctors();
  }, [doctorType]);

  useEffect(() => {
    if (debouncedSearch || selectedSpecialty || isUrgency) {
      setViewMode("results");
    }
  }, [debouncedSearch, selectedSpecialty, isUrgency]);

  const fetchFavorites = async () => {
    if (!user) return;
    const { data } = await db.from("favorite_doctors").select("doctor_id").eq("patient_id", user.id);
    if (data) setFavoriteIds(new Set(data.map(f => f.doctor_id)));
  };

  const toggleFavorite = async (doctorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (favoriteIds.has(doctorId)) {
      await db.from("favorite_doctors").delete().eq("patient_id", user.id).eq("doctor_id", doctorId);
      setFavoriteIds(prev => { const n = new Set(prev); n.delete(doctorId); return n; });
    } else {
      await db.from("favorite_doctors").insert({ patient_id: user.id, doctor_id: doctorId });
      setFavoriteIds(prev => new Set(prev).add(doctorId));
    }
  };

  const fetchSpecialties = async () => {
    const { data } = await db.from("specialties").select("id, name").order("name");
    if (data) setSpecialties(data);
  };

  const fetchDoctors = async (loadMore = false) => {
    if (loadMore) setLoadingMore(true);
    else setLoading(true);

    const offset = loadMore ? doctors.length : 0;
    const richCols = "id, user_id, crm, crm_state, bio, short_description, consultation_price, consultation_duration_min, rating, total_reviews, experience_years, available_now, available_now_since, display_name, crm_verified, accepts_insurance, languages";

    let resp: any = await db
      .from("doctor_profiles")
      .select(richCols, { count: "exact" })
      .eq("is_approved", true)
      .eq("doctor_type" as any, doctorType)
      .order("rating", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (resp.error) {
      resp = await db
        .from("doctor_profiles")
        .select("id, user_id, crm, crm_state, bio, consultation_price, rating, total_reviews, experience_years, available_now, available_now_since, display_name, crm_verified", { count: "exact" })
        .eq("is_approved", true)
        .eq("doctor_type" as any, doctorType)
        .order("rating", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
    }
    const doctorData = resp.data as any[] | null;
    setTotalDoctors(resp.count ?? 0);

    if (!doctorData) {
      if (loadMore) setLoadingMore(false);
      else setLoading(false);
      return;
    }

    const doctorIds = doctorData.map(d => d.id);
    const userIds = doctorData.map(d => d.user_id);

    const [profilesRes, specRes, slotsRes, careAreasRes] = await Promise.all([
      db.from("profiles").select("user_id, first_name, last_name, avatar_url").in("user_id", userIds),
      db.from("doctor_specialties").select("doctor_id, specialty_id, specialties(name)").in("doctor_id", doctorIds),
      db.from("availability_slots").select("doctor_id, day_of_week, start_time, end_time").eq("is_active", true).in("doctor_id", doctorIds),
      db.from("doctor_care_areas" as any).select("doctor_id, area_name").in("doctor_id", doctorIds),
    ]);

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const availableNow = new Set<string>();
    slotsRes.data?.forEach(slot => {
      if (slot.day_of_week === currentDay && slot.start_time <= currentTime && slot.end_time > currentTime) {
        availableNow.add(slot.doctor_id);
      }
    });
    setAvailableNowIds(availableNow);

    const profilesMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) ?? []);
    const specsMap = new Map<string, string[]>();
    specRes.data?.forEach((s: { doctor_id: string; specialties?: { name?: string } | null }) => {
      const arr = specsMap.get(s.doctor_id) ?? [];
      arr.push(s.specialties?.name ?? "");
      specsMap.set(s.doctor_id, arr);
    });

    const careAreasMap = new Map<string, string[]>();
    (careAreasRes.data as any[])?.forEach((c: { doctor_id: string; area_name: string }) => {
      const arr = careAreasMap.get(c.doctor_id) ?? [];
      arr.push(c.area_name);
      careAreasMap.set(c.doctor_id, arr);
    });

    const results: DoctorResult[] = doctorData.map((d: any) => ({
      ...d,
      consultation_price: Number(d.consultation_price),
      rating: Number(d.rating),
      languages: Array.isArray(d.languages) ? d.languages : (typeof d.languages === "string" && d.languages ? [d.languages] : null),
      profile: profilesMap.get(d.user_id) ?? null,
      specialties: specsMap.get(d.id) ?? [],
      careAreas: careAreasMap.get(d.id) ?? [],
    }));

    if (loadMore) {
      // Concatena com doctors já carregados, evita duplicatas via Map
      const merged = [...doctors, ...results];
      const dedupe = Array.from(new Map(merged.map(d => [d.id, d])).values());
      setDoctors(dedupe);
      setLoadingMore(false);
    } else {
      const maxPrice = Math.max(...results.map(d => d.consultation_price), 500);
      setPriceRange([0, maxPrice]);
      setDoctors(results);
      setLoading(false);
    }
  };

  const filtered = doctors
    .filter(d => {
      const searchLower = debouncedSearch.toLowerCase();
      const nameMatch = !debouncedSearch ||
        `${d.profile?.first_name} ${d.profile?.last_name}`.toLowerCase().includes(searchLower) ||
        d.crm.includes(debouncedSearch) ||
        d.careAreas.some(a => a.toLowerCase().includes(searchLower));
      const specMatch = !selectedSpecialty || d.specialties.some(s => s === selectedSpecialty);
      const urgencyMatch = !isUrgency || availableNowIds.has(d.id) || Boolean(d.available_now);
      const priceMatch = d.consultation_price >= priceRange[0] && d.consultation_price <= priceRange[1];
      const ratingMatch = d.rating >= minRating;
      const availMatch = availabilityFilter === "all" ||
        (availabilityFilter === "today" && availableNowIds.has(d.id)) ||
        (availabilityFilter === "on_duty" && Boolean(d.available_now));
      const insuranceMatch = !insuranceOnly || Boolean(d.accepts_insurance);
      return nameMatch && specMatch && urgencyMatch && priceMatch && ratingMatch && availMatch && insuranceMatch;
    })
    .sort((a, b) => {
      const aFav = favoriteIds.has(a.id) ? 1 : 0;
      const bFav = favoriteIds.has(b.id) ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
      const aOnDuty = a.available_now ? 1 : 0;
      const bOnDuty = b.available_now ? 1 : 0;
      if (bOnDuty !== aOnDuty) return bOnDuty - aOnDuty;
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "price_asc") return a.consultation_price - b.consultation_price;
      if (sortBy === "price_desc") return b.consultation_price - a.consultation_price;
      if (sortBy === "experience") return (b.experience_years ?? 0) - (a.experience_years ?? 0);
      return 0;
    });

  const activeFilters = (minRating > 0 ? 1 : 0) + (availabilityFilter !== "all" ? 1 : 0) + (sortBy !== "rating" ? 1 : 0) + (insuranceOnly ? 1 : 0);

  const clearFilters = () => {
    setMinRating(0);
    setAvailabilityFilter("all");
    setSortBy("rating");
    setPriceRange([0, 500]);
    setInsuranceOnly(false);
  };

  const FiltersContent = () => (
    <div className="space-y-5 py-2 pb-24 md:pb-6">
      <div>
        <p className="text-sm font-medium text-foreground mb-3">💰 Preço: R${priceRange[0]} – R${priceRange[1]}</p>
        <Slider min={0} max={500} step={10} value={priceRange} onValueChange={(v) => setPriceRange(v as [number, number])} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-3">⭐ Avaliação mínima</p>
        <div className="flex gap-2 flex-wrap">
          {[0, 3, 3.5, 4, 4.5].map(r => (
            <Button key={r} variant={minRating === r ? "default" : "outline"} size="sm" className="h-10 min-w-[52px] text-sm gap-1 rounded-full" onClick={() => setMinRating(r)}>
              {r === 0 ? "Todas" : <><Star className="w-3.5 h-3.5 fill-current" /> {r}+</>}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-3">📅 Disponibilidade</p>
        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer horário</SelectItem>
            <SelectItem value="today">Atende hoje</SelectItem>
            <SelectItem value="on_duty">🟢 De plantão agora</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--p-primary))]" />
          <p className="text-sm font-medium text-foreground">Aceita convênio</p>
        </div>
        <Switch checked={insuranceOnly} onCheckedChange={setInsuranceOnly} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-3">🔄 Ordenar por</p>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">Melhor avaliação</SelectItem>
            <SelectItem value="price_asc">Menor preço</SelectItem>
            <SelectItem value="price_desc">Maior preço</SelectItem>
            <SelectItem value="experience">Mais experiente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1 h-11 rounded-full" onClick={clearFilters}><X className="w-4 h-4 mr-1" /> Limpar</Button>
        <Button className="flex-1 h-11 bg-[#00347F] text-white rounded-full" onClick={() => setFiltersOpen(false)}>
          Ver {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout title="Paciente" nav={getPatientNav("doctors")}>
      <div className="w-full max-w-2xl mx-auto pb-24 md:pb-6">
        {/* Doctor type segmented control */}
        <div className="mb-4 inline-flex p-1 rounded-2xl bg-muted/60 border border-border/30 w-full sm:w-auto">
          {([
            { value: "telemedicina", label: "Telemedicina", icon: Stethoscope },
            { value: "oftalmologia", label: "Oftalmologia", icon: EyeIcon },
          ] as const).map(opt => {
            const Icon = opt.icon;
            const active = doctorType === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { setDoctorType(opt.value); setSelectedSpecialty(null); }}
                className={cn(
                  "flex-1 sm:flex-none h-10 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95",
                  active
                    ? "bg-card text-[hsl(var(--p-primary))] shadow-[var(--p-shadow-card)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Qual especialidade você procura?"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowRecent(false); }}
              onFocus={() => { if (!search && recentSearches.length > 0) setShowRecent(true); }}
              onBlur={() => setTimeout(() => setShowRecent(false), 200)}
              onKeyDown={e => { if (e.key === "Enter" && search.trim()) { saveRecentSearch(search.trim()); setRecentSearches(getRecentSearches()); } }}
              className="pl-12 h-12 rounded-2xl text-base bg-muted/50 border-transparent focus:border-[hsl(var(--p-primary))]/30"
            />
            {showRecent && recentSearches.length > 0 && (
              <div className="absolute top-14 left-0 right-0 bg-card border border-border rounded-2xl shadow-[var(--p-shadow-elevated)] z-20 overflow-hidden">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-semibold px-4 pt-3 pb-1">Buscas recentes</p>
                {recentSearches.map((term, i) => (
                  <button key={i} className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 flex items-center gap-2 transition-colors" onMouseDown={() => { setSearch(term); setShowRecent(false); }}>
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/50" /> {term}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl shrink-0 relative" aria-label="Filtros">
                <SlidersHorizontal className="w-5 h-5" />
                {activeFilters > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#00347F] text-white text-[10px] flex items-center justify-center font-bold">{activeFilters}</span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
              <FiltersContent />
            </SheetContent>
          </Sheet>
        </div>

        {/* Specialties grid view (default) */}
        {viewMode === "specialties" && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Pingo speech bubble */}
            <div className="flex items-start gap-3 mb-6 p-4 rounded-2xl bg-[hsl(var(--p-primary))]/10 border border-[hsl(var(--p-primary))]/20">
              <img src={mascotWave} alt="Pingo" className="w-12 h-12 rounded-full object-cover shrink-0" loading="lazy" decoding="async" width={48} height={48} />
              <p className="text-sm text-foreground leading-relaxed">
                "Olá! Eu posso te ajudar a encontrar o melhor especialista para você hoje."
              </p>
            </div>

            {/* Frequent searches */}
            <div className="mb-6">
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-bold mb-2">Buscas frequentes</p>
              <div className="flex gap-2 flex-wrap">
                {FREQUENT_SEARCHES.map(term => (
                  <button
                    key={term}
                    className="h-9 px-4 text-sm rounded-full border border-border/50 hover:bg-[hsl(var(--p-primary))]/10 hover:border-[hsl(var(--p-primary))]/30 transition-colors font-medium text-foreground active:scale-95"
                    onClick={() => { setSearch(term); setViewMode("results"); }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Specialty grid */}
            <div className="mb-6">
              <h2 className="text-lg font-extrabold text-foreground mb-4 font-[Manrope]">Navegar por Especialidades</h2>
              <div className="grid grid-cols-2 gap-3">
                {specialties.slice(0, 6).map((spec, i) => (
                  <motion.button
                    key={spec.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setSelectedSpecialty(spec.name); setViewMode("results"); }}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border/30 hover:border-[hsl(var(--p-primary))]/30 hover:shadow-[var(--p-shadow-elevated)] transition-all shadow-[var(--p-shadow-card)]"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                      {SPECIALTY_ICONS[spec.name] || <Stethoscope className="w-6 h-6 text-[hsl(var(--p-primary))]" />}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{spec.name}</span>
                  </motion.button>
                ))}
              </div>
              {specialties.length > 6 && (
                <Button variant="ghost" className="w-full mt-3 text-sm text-[hsl(var(--p-primary))] font-semibold" onClick={() => setViewMode("results")}>
                  Ver todas as especialidades
                </Button>
              )}
            </div>

            {/* CTA banner */}
            <div className="rounded-2xl bg-[#00347F] p-6 text-white">
              <h3 className="text-lg font-bold mb-1 font-[Manrope]">Não encontrou o que precisava?</h3>
              <p className="text-sm text-white/70 mb-4">
                Nossa equipe de suporte está disponível para te ajudar a encontrar o especialista ideal.
              </p>
              <Button className="rounded-full bg-white text-[#00347F] font-bold shadow-[var(--p-shadow-btn)]" onClick={() => navigate("/dashboard/support")}>
                Falar com Atendente
              </Button>
            </div>
          </motion.div>
        )}

        {/* Results view */}
        {viewMode === "results" && (
          <>
            {/* Urgency banner */}
            {isUrgency && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3.5 rounded-2xl bg-[hsl(var(--p-danger-soft))] border border-destructive/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">Modo Urgência</p><p className="text-xs text-muted-foreground">Médicos disponíveis agora</p></div>
              </motion.div>
            )}

            {/* Back to specialties */}
            {!isUrgency && (
              <button
                onClick={() => { setViewMode("specialties"); setSearch(""); setSelectedSpecialty(null); }}
                className="text-sm text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 active:scale-95"
              >
                ← Voltar às especialidades
              </button>
            )}

            {/* Specialty chips */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide snap-x -mx-1 px-1">
              <button
                className={cn(
                  "shrink-0 h-9 px-4 text-sm rounded-full snap-start active:scale-95 transition-all font-semibold",
                  selectedSpecialty === null ? "bg-[#00347F] text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
                onClick={() => setSelectedSpecialty(null)}
              >
                Todas
              </button>
              {specialties.map(s => (
                <button
                  key={s.id}
                  className={cn(
                    "shrink-0 h-9 px-4 text-sm rounded-full snap-start active:scale-95 transition-all font-semibold",
                    selectedSpecialty === s.name ? "bg-[#00347F] text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setSelectedSpecialty(selectedSpecialty === s.name ? null : s.name)}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {/* Results count */}
            {!loading && <p className="text-xs text-muted-foreground mb-3">{filtered.length} médico{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</p>}

            {/* Loading / Empty / Results */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="p-4 rounded-2xl border border-border/20 bg-card">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
                      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
                      <Skeleton className="h-8 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-border/40 bg-muted/10">
                <img src={mascotWave} alt="Pingo" className="w-20 h-20 object-contain mx-auto drop-shadow-md mb-3 select-none" loading="lazy" decoding="async" width={80} height={80} />
                <p className="text-[13px] font-semibold text-foreground">Nenhum médico encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros de busca</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filtered.map((doctor, i) => (
                    <motion.div key={doctor.id} custom={i} variants={fadeUp} initial="hidden" animate="show"
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "relative p-4 rounded-2xl border bg-card cursor-pointer group shadow-[var(--p-shadow-card)] hover:shadow-[var(--p-shadow-elevated)] transition-shadow",
                        doctor.available_now ? "border-secondary/40" : "border-border/30"
                      )}
                      onClick={() => navigate(`/dashboard/schedule/${doctor.id}`)}
                    >
                      <button onClick={(e) => toggleFavorite(doctor.id, e)} className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted/50 transition-colors z-10">
                        <Heart className={`w-5 h-5 transition-colors ${favoriteIds.has(doctor.id) ? "fill-destructive text-destructive" : "text-muted-foreground/40"}`} />
                      </button>
                      <div className="flex items-start gap-3">
                        <Avatar className="w-14 h-14 rounded-2xl shrink-0 ring-2 ring-[hsl(var(--p-primary))]/15">
                          {doctor.profile?.avatar_url && <AvatarImage src={doctor.profile.avatar_url} alt={`Dr(a). ${doctor.profile?.first_name}`} className="rounded-2xl object-cover" loading="lazy" decoding="async" />}
                          <AvatarFallback className="rounded-2xl bg-gradient-to-br from-[#00347F] to-[#2563EB] text-white font-bold text-base">{(doctor.display_name?.[0] || doctor.profile?.first_name?.[0] || "?")}{doctor.profile?.last_name?.[0] ?? ""}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 pr-8">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-foreground text-[15px] leading-tight truncate font-[Manrope]">{doctor.display_name || `Dr(a). ${doctor.profile?.first_name ?? ""} ${doctor.profile?.last_name ?? ""}`.trim()}</h3>
                            {doctor.kyc_status === "approved" && doctor.crm_verified && (
                              <span title="Médico verificado" className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary">
                                <BadgeCheck className="w-3 h-3" /> Verificado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">CRM-{doctor.crm_state} {doctor.crm}{(doctor.experience_years ?? 0) > 0 && ` · ${doctor.experience_years} anos de experiência`}</p>
                          {(doctor.short_description || doctor.bio) && (
                            <p className="text-[12px] text-muted-foreground/90 mt-1 line-clamp-2">{doctor.short_description || doctor.bio}</p>
                          )}
                          {doctor.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">{doctor.specialties.slice(0, 2).map(s => (<span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--p-primary))]/10 text-[hsl(var(--p-primary))] font-semibold">{s}</span>))}</div>
                          )}
                          {doctor.careAreas.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {doctor.careAreas.slice(0, 3).map(a => (
                                <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">{a}</span>
                              ))}
                              {doctor.careAreas.length > 3 && <span className="text-[10px] text-muted-foreground/60">+{doctor.careAreas.length - 3}</span>}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {doctor.available_now && (
                              <span className="text-[11px] px-2.5 py-1 rounded-full bg-[hsl(var(--p-success-soft))] text-success font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />Plantão</span>
                            )}
                            {availableNowIds.has(doctor.id) && !doctor.available_now && (
                              <span className="text-[11px] px-2.5 py-1 rounded-full bg-secondary/10 text-secondary font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Disponível</span>
                            )}
                            {doctor.rating > 0 ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="w-3.5 h-3.5 text-warning fill-warning" />{doctor.rating.toFixed(1)}<span className="text-muted-foreground/60">({doctor.total_reviews ?? 0})</span></span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">Novo</span>
                            )}
                            {doctor.accepts_insurance && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--p-primary))]/10 text-[hsl(var(--p-primary))] font-semibold flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Convênio</span>
                            )}
                            {doctor.languages && doctor.languages.length > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium flex items-center gap-1">
                                <LanguagesIcon className="w-3 h-3" />
                                {doctor.languages.slice(0, 3).map(l => LANG_LABEL[l] || l.slice(0, 2).toUpperCase()).join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30 gap-2">
                        <div className="min-w-0">
                          <span className="text-xl font-extrabold text-foreground font-[Manrope]">R$ {doctor.consultation_price.toFixed(2).replace(".", ",")}</span>
                          <span className="text-xs text-muted-foreground ml-1">/consulta</span>
                          <span className="block text-[11px] text-muted-foreground/80 flex items-center gap-1"><Clock className="w-3 h-3" /> {doctor.consultation_duration ?? 30} min</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="ghost" className="h-9 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/doctor-profile/${doctor.id}`); }}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Perfil
                          </Button>
                          <Button size="sm" className="h-10 px-5 rounded-full bg-[#00347F] text-white text-sm font-bold gap-1.5 shadow-[var(--p-shadow-btn)]"
                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/schedule/${doctor.id}`); }}>
                            <Calendar className="w-4 h-4" /> Agendar <ChevronRight className="w-4 h-4 -mr-1" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {doctors.length < totalDoctors && (
                  <div className="pt-3 text-center">
                    <Button
                      variant="outline"
                      onClick={() => fetchDoctors(true)}
                      disabled={loadingMore}
                      className="rounded-full px-6"
                    >
                      {loadingMore ? "Carregando…" : `Carregar mais (${totalDoctors - doctors.length} restantes)`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DoctorSearch;
