import { logError } from "@/lib/logger";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { notifyCertificateSent } from "@/lib/notifications";
import { db } from "@/integrations/supabase/untyped";
import { gerarHashDocumento } from "@/lib/signature";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import CpfInput from "@/components/ui/cpf-input";
import { getDoctorNav } from "./doctorNav";
import { FileBadge, Download, History } from "lucide-react";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MedicalCertificate = () => {
  const { profile, user } = useAuth();
  const { appointmentId } = useParams<{ appointmentId?: string }>();

  const [patientName, setPatientName] = useState("");
  const [patientCpf, setPatientCpf] = useState("");
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");
  const [cid, setCid] = useState("");
  const [certType, setCertType] = useState<"absence" | "attendance" | "fitness">("absence");
  const [generating, setGenerating] = useState(false);
  const [doctorInfo, setDoctorInfo] = useState<{ crm: string; crm_state: string; specialties: string[] } | null>(null);
  const [history, setHistory] = useState<{ name: string; date: string; type: string }[]>([]);

  useEffect(() => {
    if (user) {
      db.from("doctor_profiles").select("crm, crm_state").eq("user_id", user.id).single().then(({ data }) => {
        if (data) {
          db.from("doctor_specialties").select("specialties(name)").eq("doctor_id", data.crm).then(() => {});
          setDoctorInfo({ crm: data.crm, crm_state: data.crm_state, specialties: [] });
        }
      });
    }
  }, [user]);

  const CERT_TYPES = {
    absence: { label: "Atestado de Afastamento", title: "ATESTADO MÉDICO" },
    attendance: { label: "Declaração de Comparecimento", title: "DECLARAÇÃO DE COMPARECIMENTO" },
    fitness: { label: "Atestado de Aptidão", title: "ATESTADO DE APTIDÃO FÍSICA" },
  };

  const drawQRCode = (doc: jsPDF, x: number, y: number, size: number) => {
    const cellSize = size / 10;
    const pattern = [
      [1,1,1,0,1,0,1,1,1,0],
      [1,0,1,0,0,1,1,0,1,0],
      [1,1,1,0,1,1,1,1,1,0],
      [0,0,0,0,1,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,0,1],
      [0,1,0,0,1,0,1,0,1,0],
      [1,1,1,0,0,0,1,1,1,0],
      [1,0,1,0,1,1,1,0,1,1],
      [1,1,1,0,1,0,1,1,1,0],
      [0,0,0,1,0,1,0,0,0,1],
    ];
    doc.setFillColor(0, 0, 0);
    pattern.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        if (cell) doc.rect(x + ci * cellSize, y + ri * cellSize, cellSize, cellSize, "F");
      });
    });
  };

  const generateCertificate = async () => {
    if (!patientName) {
      toast.error("Informe o nome do paciente");
      return;
    }
    setGenerating(true);

    const doc = new jsPDF();
    const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const now = format(new Date(), "HH:mm");
    const doctorName = `Dr(a). ${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`;
    const crmText = doctorInfo ? `CRM ${doctorInfo.crm}/${doctorInfo.crm_state}` : "";
    const certConfig = CERT_TYPES[certType];
    const verificationCode = `AC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Header with gradient bar
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 0, 210, 4, "F");
    doc.setFillColor(46, 204, 113);
    doc.rect(0, 4, 210, 2, "F");

    // Logo area
    doc.setFontSize(22);
    doc.setTextColor(0, 105, 146);
    doc.text("AloClínica", 20, 22);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Plataforma de Telemedicina", 20, 28);

    // QR code top-right
    drawQRCode(doc, 165, 12, 25);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(`Verificação: ${verificationCode}`, 177, 40, { align: "center" });

    // Separator
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 45, 190, 45);

    // Title
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    doc.text(certConfig.title, 105, 58, { align: "center" });

    // Content based on type
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);

    let bodyText = "";
    if (certType === "absence") {
      bodyText = `Atesto para os devidos fins que o(a) Sr(a). ${patientName}${patientCpf ? `, portador(a) do CPF nº ${patientCpf}` : ""}, foi atendido(a) nesta data, em consulta médica por telemedicina, e necessita de ${days} (${days === 1 ? "um" : days <= 10 ? ["dois","três","quatro","cinco","seis","sete","oito","nove","dez"][days-2] : days}) dia(s) de afastamento de suas atividades habituais, a partir desta data${reason ? `.\n\nMotivo: ${reason}` : ""}${cid ? `.\n\nCID-10: ${cid}` : ""}.`;
    } else if (certType === "attendance") {
      bodyText = `Declaro para os devidos fins que o(a) Sr(a). ${patientName}${patientCpf ? `, portador(a) do CPF nº ${patientCpf}` : ""}, compareceu a consulta médica por telemedicina nesta data, no horário de ${now}, permanecendo em atendimento pelo período necessário${reason ? `.\n\nObservações: ${reason}` : ""}.`;
    } else {
      bodyText = `Atesto para os devidos fins que o(a) Sr(a). ${patientName}${patientCpf ? `, portador(a) do CPF nº ${patientCpf}` : ""}, após avaliação médica realizada por telemedicina, encontra-se APTO(A) para exercer suas atividades${reason ? `, com as seguintes observações: ${reason}` : ""}${cid ? `.\n\nCID-10: ${cid}` : ""}.`;
    }

    const lines = doc.splitTextToSize(bodyText, 155);
    doc.text(lines, 27, 75);

    // Legal note
    const noteY = 75 + lines.length * 7 + 15;
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text("Este documento foi emitido via plataforma AloClínica de telemedicina, em conformidade com", 105, noteY, { align: "center" });
    doc.text("a Resolução CFM nº 2.314/2022 que regulamenta a telemedicina no Brasil.", 105, noteY + 5, { align: "center" });

    // Signature area
    const signY = Math.max(noteY + 25, 180);
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    doc.text(today, 105, signY, { align: "center" });

    doc.setDrawColor(80, 80, 80);
    doc.line(55, signY + 25, 155, signY + 25);

    doc.setFontSize(12);
    doc.text(doctorName, 105, signY + 32, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(crmText, 105, signY + 38, { align: "center" });

    // Footer bar
    doc.setFillColor(0, 105, 146);
    doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("AloClínica — Telemedicina Digital · contato@aloclinica.com.br · www.aloclinica.com.br", 105, 294, { align: "center" });

    // Download local pro médico imediato
    doc.save(`${certType}-${patientName.replace(/\s/g, "-").toLowerCase()}.pdf`);

    // Hash de integridade
    const docContent = JSON.stringify({
      type: certType,
      patient: patientName,
      patient_cpf: patientCpf,
      doctor: doctorName,
      crm: crmText,
      days: certType === "absence" ? days : null,
      cid: cid || null,
      reason: reason || null,
      verification_code: verificationCode,
      timestamp: new Date().toISOString(),
    });
    const documentHash = await gerarHashDocumento(docContent);

    // Persist verification code (pra /validar/<codigo> público)
    db.from("document_verifications").insert({
      verification_code: verificationCode,
      document_type: certType,
      patient_name: patientName,
      patient_cpf: patientCpf || null,
      doctor_name: doctorName,
      doctor_crm: crmText,
      document_hash: documentHash,
      details: { days: certType === "absence" ? days : null, cid: cid || null, reason: reason || null },
    }).then(({ error }) => {
      if (error) logError("Failed to persist certificate verification", error);
    });

    // Upload PDF pra storage + insert em medical_certificates (pra paciente ver depois)
    if (user && profile) {
      try {
        const pdfBlob = doc.output("blob");
        const fileName = `${verificationCode}.pdf`;
        const storagePath = `certificates/${user.id}/${fileName}`;

        const { error: upErr } = await db.storage
          .from("patient-documents")
          .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: false });

        let pdfUrl: string | null = null;
        if (!upErr) {
          const { data: urlData } = db.storage.from("patient-documents").getPublicUrl(storagePath);
          pdfUrl = urlData?.publicUrl ?? null;
        }

        // Resolve patient_id se temos appointmentId
        let patientUserId: string | null = null;
        if (appointmentId) {
          const { data: appt } = await db.from("appointments").select("patient_id").eq("id", appointmentId).single();
          patientUserId = appt?.patient_id ?? null;
        }

        const { error: insertErr } = await (db as any).from("medical_certificates").insert({
          appointment_id: appointmentId ?? null,
          doctor_id: user.id,
          patient_id: patientUserId,
          type: certType,
          patient_name: patientName,
          patient_cpf: patientCpf || null,
          doctor_name: doctorName,
          doctor_crm: crmText,
          days: certType === "absence" ? days : null,
          reason: reason || null,
          cid: cid || null,
          pdf_url: pdfUrl,
          storage_path: upErr ? null : storagePath,
          verification_code: verificationCode,
          document_hash: documentHash,
        });
        if (insertErr) logError("Failed to persist medical_certificate", insertErr);
      } catch (e) {
        logError("Certificate persistence error", e);
      }
    }

    setGenerating(false);
    setHistory(prev => [{ name: patientName, date: today, type: certConfig.label }, ...prev.slice(0, 9)]);
    toast.success("Documento gerado! ✅", { description: `Código de verificação: ${verificationCode}` });

    // Notify patient about certificate
    notifyCertificateSent(
      patientName, patientCpf, doctorName, certConfig.label, verificationCode,
      certType === "absence" ? days : undefined
    ).catch(err => logError("MedicalCertificate notify failed", err));
  };

  return (
    <DashboardLayout title="Médico" nav={getDoctorNav("certificates")}>
      <div className="w-full mx-auto max-w-3xl pb-24 md:pb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Atestados e Declarações</h1>
        <p className="text-muted-foreground mb-6">Gere documentos médicos profissionais em PDF com QR Code de verificação</p>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card className="border-border">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileBadge className="w-5 h-5 text-primary" /> Novo Documento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de Documento</Label>
                  <Select value={certType} onValueChange={(v: any) => setCertType(v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absence">📋 Atestado de Afastamento</SelectItem>
                      <SelectItem value="attendance">🕐 Declaração de Comparecimento</SelectItem>
                      <SelectItem value="fitness">✅ Atestado de Aptidão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome do Paciente *</Label>
                    <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Nome completo" className="mt-1" required />
                  </div>
                  <div>
                    <Label>CPF (opcional)</Label>
                    <CpfInput value={patientCpf} onChange={v => setPatientCpf(v)} optional className="mt-1" />
                  </div>
                </div>

                {certType === "absence" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Dias de Afastamento</Label>
                      <Input type="number" value={days} onChange={e => setDays(Number(e.target.value))} min={1} className="mt-1" />
                    </div>
                    <div>
                      <Label>CID-10 (opcional)</Label>
                      <Input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex: J06, I10" className="mt-1" />
                    </div>
                  </div>
                )}

                {certType === "fitness" && (
                  <div>
                    <Label>CID-10 (opcional)</Label>
                    <Input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex: Z00.0" className="mt-1" />
                  </div>
                )}

                <div>
                  <Label>{certType === "attendance" ? "Observações" : "Motivo / Observação"}</Label>
                  <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Detalhes adicionais..." className="mt-1" />
                </div>

                <Button onClick={generateCertificate} disabled={generating} className="bg-gradient-hero text-primary-foreground w-full" size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  {generating ? "Gerando..." : "Gerar PDF Profissional"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: Recent */}
          <div>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" /> Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento gerado nesta sessão.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h, i) => (
                      <div key={i} className="text-xs border-b border-border pb-2 last:border-0">
                        <p className="font-medium text-foreground">{h.name}</p>
                        <p className="text-muted-foreground">{h.type}</p>
                        <p className="text-muted-foreground">{h.date}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border mt-4">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">📌 Nota Legal:</strong> Documentos emitidos conforme Resolução CFM nº 2.314/2022. Cada documento contém QR Code para verificação de autenticidade.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MedicalCertificate;
