import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Printer, Loader2, FileText, CheckCircle2, Download, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPatientNav } from "./patientNav";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QRCodeSVG } from "qrcode.react";
import { drawSafeText, safeQrBox, clampWidth } from "@/lib/pdf-layout";

const nav = getPatientNav("appointments");

const formatBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const maskCPF = (v?: string | null) => {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return v;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

interface ReceiptData {
  id: string;
  scheduled_at: string;
  appointment_type: string;
  price_at_booking: number | null;
  payment_status: string | null;
  payment_confirmed_at: string | null;
  doctor_name: string;
  doctor_crm: string | null;
  doctor_crm_state: string | null;
  doctor_specialty: string | null;
  patient_name: string;
  patient_cpf: string | null;
  patient_phone: string | null;
  created_at: string | null;
}

const AppointmentReceipt = () => {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      if (!appointmentId || !user) { setLoading(false); return; }

      const { data: appt } = await db
        .from("appointments")
        .select("id, scheduled_at, appointment_type, price_at_booking, payment_status, payment_confirmed_at, doctor_id, patient_id, created_at")
        .eq("id", appointmentId)
        .maybeSingle();

      if (!appt) { setLoading(false); return; }

      if (appt.patient_id !== user.id) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      const [docRes, patRes] = await Promise.all([
        db.from("doctor_profiles_public" as any)
          .select("display_name, full_name, crm, crm_state, specialty_names")
          .eq("id", appt.doctor_id).maybeSingle(),
        db.from("profiles")
          .select("first_name, last_name, cpf, phone")
          .eq("user_id", appt.patient_id).maybeSingle(),
      ]);

      const doc: any = docRes.data;
      const pat: any = patRes.data;

      setData({
        id: appt.id,
        scheduled_at: appt.scheduled_at,
        appointment_type: appt.appointment_type,
        price_at_booking: appt.price_at_booking,
        payment_status: appt.payment_status,
        payment_confirmed_at: appt.payment_confirmed_at,
        created_at: appt.created_at,
        doctor_name: doc?.display_name || doc?.full_name || "Médico AloClínica",
        doctor_crm: doc?.crm ?? null,
        doctor_crm_state: doc?.crm_state ?? null,
        doctor_specialty: doc?.specialty_names?.[0] ?? null,
        patient_name: [pat?.first_name, pat?.last_name].filter(Boolean).join(" ") || "Paciente",
        patient_cpf: pat?.cpf ?? null,
        patient_phone: pat?.phone ?? null,
      });
      setLoading(false);
    };
    fetchAll();
  }, [appointmentId, user]);

  if (loading) {
    return (
      <DashboardLayout title="Recibo" nav={nav}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (unauthorized) {
    return (
      <DashboardLayout title="Acesso negado" nav={nav}>
        <div className="text-center py-20 max-w-md mx-auto">
          <ShieldAlert className="w-12 h-12 mx-auto text-destructive/70 mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Você não tem permissão para visualizar este recibo. Ele pertence a outro paciente.
          </p>
          <Button variant="outline" onClick={() => navigate("/dashboard/appointments?role=patient")} className="rounded-xl">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar às minhas consultas
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout title="Recibo" nav={nav}>
        <div className="text-center py-20">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Recibo não encontrado.</p>
        </div>
      </DashboardLayout>
    );
  }

  const date = new Date(data.scheduled_at);
  const isPaid = ["approved", "confirmed", "received", "paid"].includes(String(data.payment_status));
  const paidAt = data.payment_confirmed_at ? new Date(data.payment_confirmed_at) : null;
  const issuedAt = paidAt ?? (data.created_at ? new Date(data.created_at) : new Date());
  const receiptCode = data.id.slice(0, 8).toUpperCase();
  const verifyUrl = `${window.location.origin}/dashboard/appointments/${data.id}/recibo`;

  const downloadPdf = async () => {
    if (!data) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48; // margem
    let y = M;

    const line = (h = 14) => { y += h; };
    const hr = () => {
      doc.setDrawColor(220);
      doc.line(M, y, W - M, y);
      line(16);
    };
    const label = (t: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(t.toUpperCase(), M, y);
      line(12);
    };
    const value = (t: string) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20);
      y = drawSafeText(doc, t, { x: M, y, maxWidth: W - 2 * M, fontSize: 11, minFontSize: 9, maxLines: 2, lineHeight: 14 });
      line(2);
    };
    const pair = (l: string, v: string, x: number) => {
      const colWidth = clampWidth(doc, x, (W - 2 * M) / 2 - 10, M);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(l.toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20);
      drawSafeText(doc, v, { x, y: y + 13, maxWidth: colWidth, fontSize: 11, minFontSize: 8.5, maxLines: 1, lineHeight: 13 });
    };

    // Cabeçalho
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 90, 170);
    doc.text("RECIBO DE PAGAMENTO", M, y);
    line(16);
    doc.setFontSize(20);
    doc.setTextColor(15);
    doc.text("AloClínica", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text("Plataforma de Telemedicina", M, y + 14);

    // Bloco direito
    doc.setFontSize(8);
    doc.text("Nº do recibo", W - M, y - 14, { align: "right" });
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(data.id.slice(0, 8).toUpperCase(), W - M, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("Emitido em", W - M, y + 14, { align: "right" });
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(format(issuedAt, "dd/MM/yyyy HH:mm", { locale: ptBR }), W - M, y + 26, { align: "right" });

    y += 44;
    hr();

    // Status
    const statusText = isPaid ? "PAGAMENTO CONFIRMADO" : "AGUARDANDO CONFIRMAÇÃO";
    if (isPaid) doc.setFillColor(220, 252, 231); else doc.setFillColor(254, 243, 199);
    doc.roundedRect(M, y, W - 2 * M, 24, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(isPaid ? 16 : 161, isPaid ? 122 : 98, isPaid ? 60 : 7);
    doc.text(statusText, M + 12, y + 16);
    y += 38;

    // Paciente
    label("Paciente");
    value(data.patient_name);
    pair("CPF", maskCPF(data.patient_cpf), M);
    pair("Telefone", data.patient_phone ?? "—", M + 220);
    line(34);

    hr();

    // Profissional
    label("Profissional");
    value(data.doctor_name);
    pair("CRM", data.doctor_crm ? `${data.doctor_crm_state ?? ""} ${data.doctor_crm}`.trim() : "—", M);
    pair("Especialidade", data.doctor_specialty ?? "—", M + 220);
    line(34);

    hr();

    // Serviço
    label("Serviço prestado");
    doc.setDrawColor(220);
    doc.roundedRect(M, y, W - 2 * M, 56, 6, 6, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text("Teleconsulta médica", M + 12, y + 20);
    doc.text(formatBRL(data.price_at_booking), W - M - 12, y + 20, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      `Agendada para ${format(date, "dd 'de' MMMM 'de' yyyy, 'às' HH:mm", { locale: ptBR })} — vídeo criptografado.`,
      M + 12, y + 40
    );
    y += 72;

    // Total
    hr();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text("VALOR TOTAL", M, y + 4);
    doc.setFontSize(18);
    doc.setTextColor(15);
    doc.text(formatBRL(data.price_at_booking), W - M, y + 6, { align: "right" });
    y += 36;

    // Rodapé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    const footer = doc.splitTextToSize(
      "Este recibo é gerado automaticamente pela plataforma AloClínica e tem validade como comprovante de pagamento da teleconsulta indicada acima. Para reembolso junto ao seu plano de saúde, anexe este documento à nota fiscal emitida pelo profissional.",
      W - 2 * M - 90
    );
    doc.text(footer, M, y + 18);

    // QR code (verificação) — posicionado e dimensionado dentro das margens
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 240 });
      const placed = safeQrBox(doc, { x: W - M - 72, y: y + 6, size: 72 }, M);
      const qrSize = placed.size;
      const qrX = placed.x;
      const qrY = placed.y;
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFontSize(7);
      doc.setTextColor(130);
      const labelY = Math.min(qrY + qrSize + 10, H - M);
      doc.text("Verificar recibo", qrX + qrSize / 2, labelY, { align: "center" });
      doc.setFont("courier", "bold");
      const codeY = Math.min(qrY + qrSize + 20, H - M + 10);
      doc.text(receiptCode, qrX + qrSize / 2, codeY, { align: "center" });
    } catch {
      /* QR opcional */
    }

    doc.save(`recibo-aloclinica-${data.id.slice(0, 8)}.pdf`);
  };

  return (
    <DashboardLayout title="Recibo" nav={nav}>
      <div className="w-full max-w-2xl mx-auto pb-24 md:pb-6">
        <div className="flex items-center justify-between mb-5 print:hidden">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="rounded-xl">
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </Button>
            <Button onClick={downloadPdf} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground">
              <Download className="w-4 h-4 mr-2" /> Baixar PDF
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <CardContent className="p-8 print:p-6">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between border-b border-border pb-5 mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-primary mb-1">Recibo de pagamento</p>
                <h1 className="text-2xl font-black text-foreground">AloClínica</h1>
                <p className="text-xs text-muted-foreground mt-1">Plataforma de Telemedicina</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Nº do recibo</p>
                <p className="font-mono text-sm font-bold text-foreground">{data.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Emitido em</p>
                <p className="text-sm font-semibold text-foreground">{format(issuedAt, "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
              </div>
            </div>

            {/* Status */}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl mb-6 ${isPaid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"}`}>
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-semibold">
                {isPaid ? "Pagamento confirmado" : "Aguardando confirmação de pagamento"}
              </span>
            </div>

            {/* Paciente */}
            <section className="mb-5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Paciente</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">Nome</p>
                  <p className="font-semibold text-foreground">{data.patient_name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">CPF</p>
                  <p className="font-semibold text-foreground">{maskCPF(data.patient_cpf)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground">Telefone</p>
                  <p className="font-semibold text-foreground">{data.patient_phone ?? "—"}</p>
                </div>
              </div>
            </section>

            {/* Profissional */}
            <section className="mb-5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Profissional</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground">Médico(a)</p>
                  <p className="font-semibold text-foreground">{data.doctor_name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">CRM</p>
                  <p className="font-semibold text-foreground">
                    {data.doctor_crm ? `${data.doctor_crm_state ?? ""} ${data.doctor_crm}`.trim() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Especialidade</p>
                  <p className="font-semibold text-foreground">{data.doctor_specialty ?? "—"}</p>
                </div>
              </div>
            </section>

            {/* Serviço */}
            <section className="mb-5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Serviço prestado</p>
              <div className="rounded-xl border border-border/60 overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <span className="font-medium text-foreground">Teleconsulta médica</span>
                  <span className="tabular-nums font-semibold text-foreground">{formatBRL(data.price_at_booking)}</span>
                </div>
                <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border/60">
                  Agendada para {format(date, "dd 'de' MMMM 'de' yyyy, 'às' HH:mm", { locale: ptBR })} — modalidade vídeo criptografado.
                </div>
              </div>
            </section>

            {/* Total */}
            <div className="flex items-center justify-between border-t border-border pt-4 mt-6">
              <span className="text-sm font-semibold text-muted-foreground">Valor total</span>
              <span className="text-2xl font-black text-foreground tabular-nums">{formatBRL(data.price_at_booking)}</span>
            </div>

            <div className="mt-8 flex items-start gap-4">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Este recibo é gerado automaticamente pela plataforma AloClínica e tem validade como comprovante de pagamento da teleconsulta indicada acima.
                  Para reembolso junto ao seu plano de saúde, anexe este documento junto à nota fiscal emitida pelo profissional.
                </p>
              </div>
              <div className="shrink-0 text-center">
                <div className="p-2 bg-white rounded-lg border border-border">
                  <QRCodeSVG value={verifyUrl} size={80} level="M" />
                </div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1.5">Verificar</p>
                <p className="font-mono text-[10px] font-bold text-foreground">{receiptCode}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AppointmentReceipt;