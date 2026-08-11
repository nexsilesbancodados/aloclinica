import { useState, useEffect, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Users, Calendar, BarChart3, Settings, Plus, Check, X, Search, Mail, MessageCircle, Percent } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const nav = [
  { label: "Início", href: "/dashboard", icon: <BarChart3 className="w-4 h-4" />, active: true },
  { label: "Médicos", href: "/dashboard/clinic/doctors", icon: <Users className="w-4 h-4" /> },
  { label: "Consultas", href: "/dashboard/appointments", icon: <Calendar className="w-4 h-4" /> },
  { label: "Configurações", href: "/dashboard/settings", icon: <Settings className="w-4 h-4" /> },
];

interface ClinicDoctor {
  affiliation_id: string;
  doctor_id: string;
  status: string;
  first_name: string;
  last_name: string;
  crm: string;
  crm_state: string;
  specialties: string[];
  commission_percent: number;
}

const ClinicDoctorsManagement = () => {
  const { user } = useAuth();
  
  const [clinicProfileId, setClinicProfileId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCrm, setSearchCrm] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<ClinicDoctor | null>(null);
  const [commissionValue, setCommissionValue] = useState(70);
  const userId = user?.id;

  const fetchDoctors = useCallback(async (clinicId: string) => {
    const { data: affiliations } = await db
      .from("clinic_affiliations")
      .select("id, doctor_id, status, commission_percent")
      .eq("clinic_id", clinicId);

    if (!affiliations || affiliations.length === 0) {
      setDoctors([]);
      return;
    }

    const doctorIds = affiliations.map(a => a.doctor_id);
    const { data: docProfiles } = await db
      .from("doctor_profiles")
      .select("id, user_id, crm, crm_state")
      .in("id", doctorIds);

    const userIds = docProfiles?.map(d => d.user_id) ?? [];
    const [profilesRes, specsRes] = await Promise.all([
      db.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds),
      db.from("doctor_specialties").select("doctor_id, specialties(name)").in("doctor_id", doctorIds),
    ]);

    const profileMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) ?? []);
    const specMap = new Map<string, string[]>();
    specsRes.data?.forEach((s: any) => {
      const arr = specMap.get(s.doctor_id) ?? [];
      arr.push(s.specialties?.name ?? "");
      specMap.set(s.doctor_id, arr);
    });

    const results: ClinicDoctor[] = affiliations.map(a => {
      const doc = docProfiles?.find(d => d.id === a.doctor_id);
      const profile = doc ? profileMap.get(doc.user_id) : null;
      return {
        affiliation_id: a.id,
        doctor_id: a.doctor_id,
        status: a.status,
        first_name: (profile as any)?.first_name ?? "",
        last_name: (profile as any)?.last_name ?? "",
        crm: doc?.crm ?? "",
        crm_state: doc?.crm_state ?? "",
        specialties: specMap.get(a.doctor_id) ?? [],
        commission_percent: (a as { commission_percent?: number }).commission_percent ?? 70,
      };
    });

    setDoctors(results);
  }, []);

  const fetchClinicProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await db
      .from("clinic_profiles")
      .select("id, name")
      .eq("user_id", userId)
      .single();

    if (data) {
      setClinicProfileId(data.id);
      setClinicName(data.name);
      fetchDoctors(data.id);
    }
    setLoading(false);
  }, [fetchDoctors, userId]);

  useEffect(() => { void fetchClinicProfile(); }, [fetchClinicProfile]);

  const searchDoctor = async () => {
    if (!searchCrm.trim()) return;
    setSearching(true);
    setSearchResult(null);

    const { data } = await db
      .from("doctor_profiles")
      .select("id, user_id, crm, crm_state")
      .eq("crm", searchCrm.trim())
      .single();

    if (!data) {
      toast.error("Médico não encontrado", { description: "Verifique o CRM informado." });
      setSearching(false);
      return;
    }

    const { data: profile } = await db
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", data.user_id)
      .single();

    setSearchResult({
      ...data,
      first_name: profile?.first_name ?? "",
      last_name: profile?.last_name ?? "",
    } as Record<string, unknown>);
    setSearching(false);
  };

  const addDoctor = async () => {
    if (!clinicProfileId || !searchResult) return;

    const { error } = await db.from("clinic_affiliations").insert({
      clinic_id: clinicProfileId,
      doctor_id: searchResult.id,
      status: "pending",
    });

    if (error) {
      toast.error("Erro", { description: error.message });
    } else {
      toast.success("Convite enviado!");
      setDialogOpen(false);
      setSearchCrm("");
      setSearchResult(null);
      fetchDoctors(clinicProfileId);
    }
  };

  const updateStatus = async (affiliationId: string, status: string) => {
    await db.from("clinic_affiliations").update({ status }).eq("id", affiliationId);
    if (clinicProfileId) fetchDoctors(clinicProfileId);
  };

  const sendInviteEmail = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await db.functions.invoke("send-email", {
        body: {
          to: inviteEmail,
          subject: `Convite para atender na ${clinicName}`,
          html: `<p>Você foi convidado para atender na clínica <strong>${clinicName}</strong> na plataforma Allo Médico.</p><p>Cadastre-se em: <a href="${window.location.origin}/medico">${window.location.origin}/medico</a></p>`,
        },
      });
      toast.success("Convite enviado por e-mail! 📧");
      setInviteEmail("");
      setInviteDialogOpen(false);
    } catch {
      toast.error("Erro ao enviar convite");
    }
  };

  const sendInviteWhatsApp = () => {
    const msg = encodeURIComponent(
      `Olá! Você foi convidado para atender na clínica ${clinicName} na plataforma Allo Médico. Cadastre-se em: ${window.location.origin}/medico`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const saveCommission = async () => {
    if (!editingDoctor) return;
    await db.from("clinic_affiliations")
      .update({ commission_percent: commissionValue })
      .eq("id", editingDoctor.affiliation_id);
    toast.success(`Repasse atualizado: ${commissionValue}% para o médico`);
    setCommissionDialogOpen(false);
    if (clinicProfileId) fetchDoctors(clinicProfileId);
  };

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendente", variant: "outline" },
    active: { label: "Ativo", variant: "default" },
    inactive: { label: "Inativo", variant: "destructive" },
  };

  return (
    <DashboardLayout title="Clínica" nav={nav.map(n => ({ ...n, active: n.href === "/dashboard/clinic/doctors" }))}>
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tabular-nums">Médicos Vinculados</h1>
            <p className="text-muted-foreground">Gerencie os médicos da sua clínica</p>
          </div>
          <div className="flex gap-2">
            {/* Invite button */}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Mail className="w-4 h-4 mr-1" /> Convidar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Médico</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Envie um convite para um médico se cadastrar e atender pela sua clínica.</p>
                  <div>
                    <Label>E-mail do médico</Label>
                    <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="medico@email.com" className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={sendInviteEmail} className="flex-1" disabled={!inviteEmail.trim()}>
                      <Mail className="w-4 h-4 mr-1" /> Enviar por E-mail
                    </Button>
                    <Button variant="outline" onClick={sendInviteWhatsApp} className="flex-1">
                      <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Add by CRM */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-hero text-primary-foreground">
                  <Plus className="w-4 h-4 mr-1" /> Adicionar por CRM
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Médico</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="Buscar por CRM..." value={searchCrm} onChange={e => setSearchCrm(e.target.value)} />
                    <Button onClick={searchDoctor} disabled={searching}>
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                  {searchResult && (
                    <Card className="border-border">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">Dr(a). {searchResult.first_name} {searchResult.last_name}</p>
                          <p className="text-sm text-muted-foreground">CRM {searchResult.crm}/{searchResult.crm_state}</p>
                        </div>
                        <Button onClick={addDoctor} size="sm" className="bg-gradient-hero text-primary-foreground">
                          <Plus className="w-4 h-4 mr-1" /> Vincular
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="shimmer-v2 h-5 rounded w-32 inline-block" aria-label="Carregando" />
        ) : doctors.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-8 text-center">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nenhum médico vinculado ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {doctors.map(doc => (
              <Card key={doc.affiliation_id} className="border-border">
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {doc.first_name[0]}{doc.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Dr(a). {doc.first_name} {doc.last_name}</p>
                    <p className="text-xs text-muted-foreground">CRM {doc.crm}/{doc.crm_state}</p>
                    {doc.specialties.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {doc.specialties.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Percent className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Repasse: <strong className="text-foreground">{doc.commission_percent}%</strong> médico / <strong className="text-foreground">{100 - doc.commission_percent}%</strong> clínica</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusConfig[doc.status]?.variant ?? "outline"}>
                      {statusConfig[doc.status]?.label ?? doc.status}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingDoctor(doc); setCommissionValue(doc.commission_percent); setCommissionDialogOpen(true); }}>
                      <Percent className="w-4 h-4 text-primary" />
                    </Button>
                    {doc.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(doc.affiliation_id, "active")}>
                        <Check className="w-4 h-4 text-secondary" />
                      </Button>
                    )}
                    {doc.status === "active" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(doc.affiliation_id, "inactive")}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Commission dialog */}
        <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Configurar Repasse</DialogTitle>
            </DialogHeader>
            {editingDoctor && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Dr(a). {editingDoctor.first_name} {editingDoctor.last_name}
                </p>
                <div>
                  <Label>Repasse para o médico: <strong>{commissionValue}%</strong></Label>
                  <Slider
                    value={[commissionValue]}
                    onValueChange={v => setCommissionValue(v[0])}
                    min={0} max={100} step={5}
                    className="mt-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Clínica retém: {100 - commissionValue}%</span>
                    <span>Médico recebe: {commissionValue}%</span>
                  </div>
                </div>
                <Button onClick={saveCommission} className="w-full">Salvar Repasse</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ClinicDoctorsManagement;
