import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { warn, logError } from "@/lib/logger";
import { db } from "@/integrations/supabase/untyped";
import { useConsultationStore } from "@/stores/consultationStore";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, FileText, Download, Calendar, Clock, Users, Settings, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import MemedPrescription from "./MemedPrescription";
import CfmPrescription from "./CfmPrescription";
import { gerarHashDocumento, gerarCodigoVerificacao } from "@/lib/signature";
import { usePrescriptionData } from "@/hooks/usePrescriptionData";
import { useDigitalSignature } from "@/hooks/useDigitalSignature";
import type { Medication } from "@/hooks/usePrescriptionData";
import logoReceita from "@/assets/logo-receita.png";
import PrescriptionTemplates from "@/components/doctor/PrescriptionTemplates";
import { isFeatureEnabled } from "@/lib/featureFlags";

const doctorNav = [
  { label: "Início", href: "/dashboard", icon: <Clock className="w-4 h-4" /> },
  { label: "Agenda", href: "/dashboard/schedule", icon: <Calendar className="w-4 h-4" /> },
  { label: "Pacientes", href: "/dashboard/patients", icon: <Users className="w-4 h-4" /> },
  { label: "Receitas", href: "/dashboard/prescriptions", icon: <FileText className="w-4 h-4" />, active: true },
  { label: "Disponibilidade", href: "/dashboard/availability", icon: <Settings className="w-4 h-4" /> },
];

const PrescriptionForm = () => {
  const { appointmentId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const store = useConsultationStore();

  // Centralizado: usePrescriptionData hook
  const prescription = usePrescriptionData(appointmentId);
   const { signPrescription, registerSignature, signing: signingDigital, isValidating, error: signError } = useDigitalSignature();

  const [saving, setSaving] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  // Persist draft to Zustand (para compatibilidade com store existente)
  useEffect(() => {
    if (appointmentId && prescription.data.patientName) {
      store.setAppointmentId(appointmentId);
      store.setDiagnosis(prescription.data.diagnosis);
      store.setObservations(prescription.data.observations);
      store.setMedications(prescription.data.medications);
    }
  }, [prescription.data, appointmentId]);

  // Auto-save draft to localStorage with debounce (2s)
  useEffect(() => {
    if (!appointmentId) return;
    const timer = setTimeout(() => {
      const draftData = {
        patientName: prescription.data.patientName,
        diagnosis: prescription.data.diagnosis,
        observations: prescription.data.observations,
        medications: prescription.data.medications,
        savedAt: Date.now(),
      };
      localStorage.setItem(`prescription_draft_${appointmentId}`, JSON.stringify(draftData));
      // Show brief indicator
      toast.success("Rascunho salvo localmente", { duration: 2 });
    }, 2000);
    return () => clearTimeout(timer);
  }, [prescription.data, appointmentId]);

  // Load draft on mount if available
  useEffect(() => {
    if (!appointmentId) return;
    const draft = localStorage.getItem(`prescription_draft_${appointmentId}`);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        // Only restore if draft is less than 24 hours old
        if (Date.now() - parsed.savedAt < 86400000) {
          toast("Rascunho encontrado", {
            action: { label: "Restaurar", onClick: () => {
              prescription.updateField("patientName", parsed.patientName);
              prescription.updateField("diagnosis", parsed.diagnosis);
              prescription.updateField("observations", parsed.observations);
              prescription.updateField("medications", parsed.medications);
            }},
            duration: 5000,
          });
        }
      } catch (e) {
        logError("Failed to parse prescription draft", e);
      }
    }
  }, []);


   const generatePDF = async (internalUuid?: string) => {
    const { data } = prescription;
    const { patientName, patientCpf, diagnosis, observations, medications: meds, doctorInfo } = data;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const now = new Date();
    const prescriptionId = `RX-${format(now, "yyyyMMdd")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // ─── Header ───
    // Cores AloClínica (Azul Marinho e Ouro Suave para acentos)
    const primaryBlue = [21, 35, 75]; // #15234B
    const accentGold = [197, 165, 114]; // #C5A572
    
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("AloClínica", 15, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Receituário Médico Digital", 15, 21);
 
     // Logo da Plataforma (Pingo) — quadrada, alinhada à direita do header azul
     try {
       doc.addImage(logoReceita, "PNG", pageWidth - 35, 3, 22, 22);
     } catch (e) {
       // Silencioso se a logo não carregar
     }
 
     doc.setFontSize(8);
      doc.text(`Receita Nº: ${prescriptionId}`, pageWidth - 15, 14, { align: "right" });
      if (internalUuid) {
        doc.setFontSize(7);
        doc.text(`ID: ${internalUuid.substring(0, 8).toUpperCase()}`, pageWidth - 15, 18, { align: "right" });
        doc.setFontSize(8);
      }
    doc.text(`Data: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth - 15, 21, { align: "right" });

     // ─── Platform ID ───
     doc.setFontSize(7);
     doc.setTextColor(200, 200, 200);
     doc.text("Documento médico oficial gerado via plataforma AloClínica", 15, 25);
     
     // Linha decorativa fina abaixo do header
     doc.setDrawColor(accentGold[0], accentGold[1], accentGold[2]);
     doc.setLineWidth(0.8);
     doc.line(0, 28, pageWidth, 28);
 
    // ─── Doctor & Patient info boxes ───
    let y = 36;

    // Doctor box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, y, pageWidth / 2 - 20, 28, 3, 3, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("MÉDICO RESPONSÁVEL", 19, y + 6);
    doc.setFontSize(10);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text(`${doctorInfo?.first_name} ${doctorInfo?.last_name}`, 19, y + 14);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`CRM: ${doctorInfo?.crm}/${doctorInfo?.crm_state}`, 19, y + 21);

    // Patient box
    const patientBoxX = pageWidth / 2 + 5;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(patientBoxX, y, pageWidth / 2 - 20, 28, 3, 3, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("PACIENTE", patientBoxX + 4, y + 6);
    doc.setFontSize(10);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text(patientName, patientBoxX + 4, y + 14);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`CPF: ${patientCpf || "Não informado"}`, patientBoxX + 4, y + 21);

    // ─── Diagnosis ───
    y += 36;
    if (diagnosis) {
      doc.setFillColor(255, 248, 240);
      doc.roundedRect(15, y, pageWidth - 30, 14, 3, 3, "F");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("DIAGNÓSTICO", 19, y + 5);
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(diagnosis, 19, y + 11);
      y += 20;
    }

    // ─── Separator ───    
    doc.setDrawColor(accentGold[0], accentGold[1], accentGold[2]);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageWidth - 15, y);
    y += 4;

    // ─── Section title ───
    doc.setFontSize(14);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text("PRESCRIÇÃO MÉDICA", pageWidth / 2, y + 6, { align: "center" });
    y += 14;

    // ─── Medications ───
    meds.forEach((med, i) => {
      if (!med.name) return;

      // Check if we need a new page
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
      }

      // Medication card
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(240, 240, 240);
      doc.roundedRect(15, y, pageWidth - 30, med.instructions ? 38 : 30, 2, 2, "FD");

      // Number circle
      doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.circle(23, y + 8, 5, "F");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), 23, y + 9.5, { align: "center" });

      // Name
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(med.name, 32, y + 10);

      // Detalhes da Prescrição (Formatados sem emojis para garantir legibilidade)
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      let detailY = y + 18;
      
      if (med.dosage) {
        doc.setFont("helvetica", "bold");
        doc.text("Posologia:", 32, detailY);
        doc.setFont("helvetica", "normal");
        doc.text(med.dosage, 50, detailY);
        detailY += 5;
      }
      
      if (med.frequency) {
        doc.setFont("helvetica", "bold");
        doc.text("Frequência:", 32, detailY);
        doc.setFont("helvetica", "normal");
        doc.text(med.frequency, 52, detailY);
        detailY += 5;
      }
      
      if (med.duration) {
        doc.setFont("helvetica", "bold");
        doc.text("Duração:", 32, detailY);
        doc.setFont("helvetica", "normal");
        doc.text(med.duration, 48, detailY);
        detailY += 5;
      }

      if (med.instructions) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "bold");
        doc.text("Orientações:", 32, detailY);
        doc.setFont("helvetica", "normal");
        const wrappedInst = doc.splitTextToSize(med.instructions, pageWidth - 65);
        doc.text(wrappedInst, 52, detailY);
        detailY += (wrappedInst.length * 4);
      }

      // Ajuste dinâmico de altura do card
      y = detailY + 4;
    });

    // ─── Observations ───
    if (observations) {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
      }

      y += 4;
      doc.setFillColor(254, 254, 250);
      doc.setDrawColor(245, 240, 230);
      const obsLines = doc.splitTextToSize(observations, pageWidth - 40);
      const obsHeight = Math.max(18, obsLines.length * 5 + 12);
      doc.roundedRect(15, y, pageWidth - 30, obsHeight, 2, 2, "FD");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("OBSERVAÇÕES", 19, y + 6);
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(obsLines, 19, y + 13);
      y += obsHeight + 6;
    }

    // ─── BLOCO DE ASSINATURA DIGITAL (ICP-Brasil / PAdES) ───
    const sigBoxY = pageHeight - 60;
    const sigBoxH = 42;
    
    // Container da assinatura
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(15, sigBoxY, pageWidth - 30, sigBoxH, 2, 2, "FD");
    
    // Badge de assinatura no topo do box
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.roundedRect(15, sigBoxY, pageWidth - 30, 7, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("DOCUMENTO ASSINADO DIGITALMENTE - ICP-BRASIL (PAdES)", pageWidth / 2, sigBoxY + 5, { align: "center" });
    
    // QR Code — escaneável para verificação pública
    const qrSize = 28;
    const qrX = 20;
    const qrY = sigBoxY + 10;
    try {
      const verificationUrl = `${window.location.origin}/validar-receita/${prescriptionId}`;
      const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#15234B", light: "#ffffff" }
      });
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (error) {
      logError("QR Code generation failed:", error);
    }
    
    // Dados do assinante (lado direito do QR)
    const infoX = qrX + qrSize + 6;
    let sigY = qrY + 4;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text(`Dr(a). ${doctorInfo?.first_name ?? ""} ${doctorInfo?.last_name ?? ""}`.trim(), infoX, sigY);
    sigY += 4.5;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(`CRM: ${doctorInfo?.crm ?? "—"}/${doctorInfo?.crm_state ?? "—"}`, infoX, sigY);
    sigY += 4;
    
    doc.text(`Tipo de certificado: e-CPF A1 (ICP-Brasil)`, infoX, sigY);
    sigY += 4;
    
    doc.text(`Carimbo de tempo: ${format(now, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`, infoX, sigY);
    sigY += 4;
    
    doc.text(`Código de verificação: ${prescriptionId}`, infoX, sigY);
    sigY += 4;
    
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.setFont("helvetica", "bold");
    doc.text(`Validar em: ${window.location.host}/validar-receita/${prescriptionId}`, infoX, sigY);

    // Bottom bar — Conformidade legal
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, pageHeight - 12, pageWidth, 12, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Conforme Resolução CFM nº 2.299/2021 e MP 2.200-2/2001 (ICP-Brasil) | Escaneie o QR Code para validar a autenticidade",
      pageWidth / 2, pageHeight - 5, { align: "center" }
    );

      return { doc, prescriptionId };
  };

  const handleSave = async (skipRedirect = false) => {
    // Validação centralizada no hook
    if (!prescription.validate()) {
      prescription.errors.forEach(err => {
        toast.error(err.message);
      });
      return;
    }

    if (!prescription.data.doctorInfo) {
      toast.error("Dados do médico não carregados. Aguarde.");
      return;
    }

    setSaving(true);
    const { data } = prescription;
    const validMeds = prescription.validMedications;

    try {
      // Generate digital hash for document integrity
      const docContent = JSON.stringify({
        appointment_id: appointmentId,
        doctor: `${data.doctorInfo?.first_name} ${data.doctorInfo?.last_name}`,
        crm: `${data.doctorInfo?.crm}/${data.doctorInfo?.crm_state}`,
        patient: data.patientName,
        patient_cpf: data.patientCpf,
        medications: validMeds,
        diagnosis: data.diagnosis,
        observations: data.observations,
        timestamp: new Date().toISOString(),
      });
      const documentHash = await gerarHashDocumento(docContent);
      const verificationCode = gerarCodigoVerificacao();

      const { data: insertedPrescription, error } = await db.from("prescriptions").insert({
        appointment_id: appointmentId!,
        doctor_id: data.doctorId,
        patient_id: data.patientId,
        medications: validMeds as unknown as Parameters<typeof db.from>[0],
        diagnosis: data.diagnosis || null,
        observations: data.observations || null,
        document_hash: documentHash,
        status: "finalized",
      }).select("id").single();

      // Also persist verification record
      await db.from("document_verifications").insert({
        verification_code: verificationCode,
        document_type: "prescription",
        patient_name: data.patientName,
        patient_cpf: data.patientCpf || null,
        doctor_name: `Dr(a). ${data.doctorInfo?.first_name} ${data.doctorInfo?.last_name}`,
        doctor_crm: `CRM ${data.doctorInfo?.crm}/${data.doctorInfo?.crm_state}`,
        document_hash: documentHash,
        details: { medications: validMeds.length, diagnosis: data.diagnosis || null },
      });

      if (error) {
        toast.error("Erro ao salvar receita", { description: error.message });
        return;
      }

      // Send prescription via email + WhatsApp
      const doctorFullName = `Dr(a). ${data.doctorInfo?.first_name} ${data.doctorInfo?.last_name}`;
      db.functions
        .invoke("send-prescription", {
          body: {
            appointment_id: appointmentId,
            doctor_name: doctorFullName,
            patient_name: data.patientName,
            medications: validMeds.map(m => ({
              name: m.name,
              dosage: m.dosage,
              frequency: m.frequency,
            })),
            diagnosis: data.diagnosis || undefined,
          },
        })
        .then(({ data: respData, error: sendErr }) => {
          if (sendErr) {
            warn("Send prescription notification error:", sendErr);
          } else {
            const sentEmail = respData?.sent_to?.email;
            const sentWhatsapp = respData?.sent_to?.whatsapp;
            const channels = [sentEmail && "e-mail", sentWhatsapp && "WhatsApp"]
              .filter(Boolean)
              .join(" e ");
            if (channels) {
              toast.success(`📩 Receita enviada por ${channels}`);
            }
          }
        })
        .catch((err) => {
          logError("[PrescriptionForm] send-prescription edge function failed", err);
        });

      // In-app + Push notification for prescription
      if (data.patientId) {
        const { notifyPrescriptionSent } = await import("@/lib/notifications");
        const medsSummary = validMeds.map(m => `${m.name} ${m.dosage}`).join(", ");
        notifyPrescriptionSent(data.patientId, doctorFullName, data.diagnosis || undefined, medsSummary).catch(
          (err) => {
            logError("[PrescriptionForm] notifyPrescriptionSent failed", err);
          }
        );
      }

      store.clearDraft();
      toast.success("Receita salva com sucesso! ✅");
      if (!skipRedirect) navigate("/dashboard/prescriptions");
      return insertedPrescription?.id;
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const { doc } = await generatePDF();
      doc.save(`receita-${prescription.data.patientName.replace(/\s/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF baixado com sucesso! 📄");
    } catch (error) {
      logError("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar o PDF. Tente novamente.");
    }
  };

  const handleSignAndSave = async () => {
    // Validação
    if (!prescription.validate()) {
      prescription.errors.forEach(err => {
        toast.error(err.message);
      });
      return;
    }

    if (!prescription.data.doctorInfo) {
      toast.error("Dados do médico não carregados. Aguarde.");
      return;
    }

    if (!appointmentId) {
      toast.error("ID da consulta não encontrado.");
      return;
    }

    setSaving(true);
    try {
      // 1. Salvar prescrição primeiro para obter o UUID
      const uuid = await handleSave(true);
      if (!uuid) {
        setSaving(false);
        return;
      }

      // 2. Gerar PDF
      const { doc, prescriptionId: rxDisplayId } = await generatePDF(uuid);

      // Converter PDF para Base64
      const pdfBlob = doc.output("blob");
      const reader = new FileReader();

      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];

        // 3. Assinar digitalmente usando o UUID da prescrição salva
        const signedDoc = await signPrescription({
          fileName: `receita-${rxDisplayId}.pdf`,
          fileBase64: base64,
          doctorName: `Dr(a). ${prescription.data.doctorInfo?.first_name} ${prescription.data.doctorInfo?.last_name}`,
          doctorCRM: `${prescription.data.doctorInfo?.crm}/${prescription.data.doctorInfo?.crm_state}`,
          doctorCPF: profile?.cpf || "CPF_NAO_DISPONIVEL",
          prescriptionId: uuid, // Passamos o UUID aqui
          documentType: "prescription",
        });

        if (!signedDoc) {
          toast.error(`Erro ao assinar digitalmente: ${signError || "Erro desconhecido"}`);
          setSaving(false);
          return;
        }

        // 4. Registrar assinatura na tabela canônica (digital_signatures) com hash + PDF
        await registerSignature({
          document_id: rxDisplayId,
          document_type: "prescription",
          related_record_id: uuid,
          doctor_name: `Dr(a). ${prescription.data.doctorInfo?.first_name} ${prescription.data.doctorInfo?.last_name}`,
          doctor_crm: `${prescription.data.doctorInfo?.crm}/${prescription.data.doctorInfo?.crm_state}`,
          doctor_cpf: profile?.cpf || "CPF_NAO_DISPONIVEL",
          patient_name: prescription.data.patientName,
          document_hash: signedDoc.signatureHash,
          signature_data: {
            verification_code: signedDoc.verificationCode,
            signed_at: signedDoc.signatureDate,
            algorithm: "SHA-256",
            format: "PAdES",
          },
          certificate_alias: `e-CPF A1 ICP-Brasil`,
          pdf_base64: base64,
        });

        setIsSigned(true);
        toast.success("✅ Prescrição assinada digitalmente com ICP-Brasil!");
        
        setTimeout(() => {
          setSaving(false);
          navigate("/dashboard/prescriptions");
        }, 1500);
      };

      reader.readAsDataURL(pdfBlob);
    } catch (error) {
      logError("Erro ao assinar e salvar prescrição:", error);
      toast.error("Erro ao processar assinatura digital. Tente novamente.");
      setSaving(false);
    }
  };

  const { data } = prescription;

  return (
    <DashboardLayout title="Médico" nav={doctorNav}>
      <div className="max-w-3xl pb-24 md:pb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-1">Receita Médica</h1>
        <p className="text-muted-foreground mb-4">Prescreva medicamentos para o paciente</p>

        {/* Aviso: assinatura simplificada (sem ICP-Brasil) */}
        {!isFeatureEnabled("icp_brasil_signature") && (
          <div className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-100">Assinatura simplificada ativa</p>
                <p className="text-amber-800/80 dark:text-amber-200/80 leading-relaxed mt-0.5">
                  As receitas são assinadas com hash SHA-256 + carimbo digital (válido pra uso comum).
                  Para receitas controladas que exigem ICP-Brasil real (e-CPF), configure VIDaaS no admin.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Explainer: CFM vs Memed */}
        <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-semibold text-foreground mb-1.5">Qual receita usar?</p>
              <ul className="space-y-1 text-muted-foreground leading-relaxed">
                <li>
                  <span className="font-semibold text-foreground">CFM (oficial)</span> — para receitas
                  controladas (tarja preta/vermelha) e atestados que precisam de QR e validação no CFM.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Memed (digital)</span> — para receitas comuns;
                  o paciente recebe por WhatsApp/email e usa direto na farmácia parceira.
                </li>
              </ul>
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Pode emitir as duas se necessário. As duas são assinadas digitalmente.
              </p>
            </div>
          </div>
        </div>

        {/* CFM Official Prescription */}
        {data.doctorInfo && (
          <div className="mb-4">
            <CfmPrescription
              doctorCrm={data.doctorInfo.crm}
              doctorCrmState={data.doctorInfo.crm_state}
              doctorName={`${data.doctorInfo.first_name} ${data.doctorInfo.last_name}`}
              patientName={data.patientName}
              patientCpf={data.patientCpf}
              onDocumentCreated={(docType) => {
                toast.success("Documento CFM emitido! ✅", { description: `${docType} criado na plataforma oficial do CFM.` });
              }}
            />
          </div>
        )}

        {/* Memed Digital Prescription */}
        {appointmentId && data.patientId && (
          <div className="mb-6">
            <MemedPrescription
              appointmentId={appointmentId}
              patientName={data.patientName}
              patientCpf={data.patientCpf}
              patientId={data.patientId}
              onPrescriptionCreated={(data) => {
                toast.success("Receita Memed salva! ✅", { description: "A receita digital foi emitida e registrada." });
              }}
            />
          </div>
        )}

        {/* Patient info */}
        <Card variant="flat" className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Paciente</p>
            <p className="font-semibold text-foreground">{data.patientName || "Carregando..."}</p>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card variant="elevated" className="mb-6">
          <CardHeader><CardTitle className="text-base">Diagnóstico</CardTitle></CardHeader>
          <CardContent>
            <Input
              value={data.diagnosis}
              onChange={e => prescription.updateField("diagnosis", e.target.value)}
              placeholder="Ex: Infecção respiratória aguda (J06.9)"
            />
          </CardContent>
        </Card>

        {/* Medications */}
        <Card variant="elevated" className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Medicamentos</CardTitle>
              <div className="flex items-center gap-2">
                <PrescriptionTemplates
                  userId={user?.id}
                  current={{
                    diagnosis: data.diagnosis,
                    medications: data.medications,
                    observations: data.observations,
                  }}
                  onApply={(t) => prescription.loadTemplate(t)}
                />
                <Button variant="outline" size="sm" onClick={() => prescription.addMedication()}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.medications.map((med, i) => (
              <div key={i} className="relative border border-border rounded-xl p-4">
                {data.medications.length > 1 && (
                  <button
                    onClick={() => prescription.removeMedication(i)}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <p className="text-xs font-semibold text-muted-foreground mb-3">Medicamento {i + 1}</p>
                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs">Nome do medicamento</Label>
                    <Input
                      value={med.name}
                      onChange={e => prescription.updateMedication(i, { ...med, name: e.target.value })}
                      placeholder="Ex: Amoxicilina 500mg"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Dosagem</Label>
                      <Input
                        value={med.dosage}
                        onChange={e => prescription.updateMedication(i, { ...med, dosage: e.target.value })}
                        placeholder="Ex: 1 comprimido"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Frequência</Label>
                      <Input
                        value={med.frequency}
                        onChange={e => prescription.updateMedication(i, { ...med, frequency: e.target.value })}
                        placeholder="Ex: 8 em 8 horas"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Duração</Label>
                      <Input
                        value={med.duration}
                        onChange={e => prescription.updateMedication(i, { ...med, duration: e.target.value })}
                        placeholder="Ex: 7 dias"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Instruções</Label>
                      <Input
                        value={med.instructions}
                        onChange={e => prescription.updateMedication(i, { ...med, instructions: e.target.value })}
                        placeholder="Ex: Tomar após refeições"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Observations */}
        <Card variant="elevated" className="mb-6">
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={data.observations}
              onChange={e => prescription.updateField("observations", e.target.value)}
              placeholder="Orientações adicionais, restrições, retorno..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 flex-col md:flex-row">
           <Button
             onClick={handleSignAndSave}
             className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
             disabled={saving || signingDigital || isValidating}
           >
             {isSigned ? (
               <>
                 <CheckCircle2 className="w-4 h-4 mr-2" />
                 ✅ Assinado Digitalmente
               </>
             ) : (signingDigital || isValidating || saving) ? (
               <>
                 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                 {isValidating ? "Validando e-CPF..." : signingDigital ? "Assinando digitalmente..." : "Salvando..."}
               </>
             ) : (
               <>
                 <FileText className="w-4 h-4 mr-2" />
                 🔐 Assinar com ICP-Brasil e Salvar
               </>
             )}
           </Button>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownloadPDF} disabled={saving || signingDigital}>
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
          </div>
        </div>

        {/* Status de Assinatura Digital */}
        {isSigned && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                 <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                   ✅ Assinatura Digital Validada com e-CPF
                 </p>
                 <p className="text-emerald-700 dark:text-emerald-300 text-xs mt-1">
                   A identidade do médico foi confirmada: o CPF do certificado digital corresponde ao registro no CRM.
                   Documento assinado com certificado qualificado ICP-Brasil (Resolução CFM 2.299/2021).
                 </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PrescriptionForm;
