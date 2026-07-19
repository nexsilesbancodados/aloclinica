import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, isInternalOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prescription_id } = await req.json();

    if (!prescription_id) {
      return new Response(
        JSON.stringify({ error: "prescription_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch prescription data
    const { data: prescription, error: prescError } = await supabase
      .from("ophthalmology_prescriptions")
      .select(
        `*,
         exam:exam_id(id),
         patient:patient_id(full_name, cpf),
         doctor:doctor_id(full_name, crm, crm_state)`
      )
      .eq("id", prescription_id)
      .single();

    if (prescError || !prescription) {
      return new Response(
        JSON.stringify({ error: "Prescription not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorize: allow trusted server-to-server calls, the owner doctor, or an admin.
    // Blocks IDOR: doctor_id references auth.users(id) directly, so it is the owner's user id.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user || (!caller.isAdmin && caller.user.id !== prescription.doctor_id)) {
        return new Response(
          JSON.stringify({ error: "forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate HTML for prescription
    const html = generatePrescriptionHTML(prescription);

    // For now, return the HTML (frontend will handle PDF generation with libraries like html2pdf)
    // In production, use a service like headless Chrome or wkhtmltopdf
    return new Response(
      JSON.stringify({
        success: true,
        html,
        filename: `prescricao_oftalmologica_${prescription_id}.pdf`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generatePrescriptionHTML(prescription: any): string {
  const typeLabel =
    prescription.prescription_type === "glasses"
      ? "Óculos"
      : prescription.prescription_type === "contact_lens"
        ? "Lente de Contato"
        : "Óculos e Lente de Contato";

  const expiryDate = prescription.expiry_date
    ? new Date(prescription.expiry_date).toLocaleDateString("pt-BR")
    : "—";

  const prescribedDate = new Date(prescription.prescribed_at).toLocaleDateString("pt-BR");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prescrição Oftalmológica</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #ddd;
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 20px;
    }
    .header h1 {
      font-size: 24px;
      color: #0066cc;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 12px;
      color: #666;
    }
    .patient-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .info-item {
      font-size: 13px;
    }
    .info-item label {
      font-weight: bold;
      color: #0066cc;
      display: block;
      margin-bottom: 4px;
    }
    .info-item value {
      display: block;
    }
    .prescription-section {
      margin-bottom: 30px;
    }
    .prescription-section h2 {
      font-size: 14px;
      font-weight: bold;
      background: #e6f0ff;
      padding: 10px;
      margin-bottom: 15px;
      border-left: 4px solid #0066cc;
    }
    .eye-prescription {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 15px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .eye-label {
      font-weight: bold;
      font-size: 12px;
      grid-column: 1 / -1;
      color: #0066cc;
    }
    .prescription-value {
      text-align: center;
    }
    .prescription-value label {
      font-size: 11px;
      color: #666;
      display: block;
      margin-bottom: 5px;
    }
    .prescription-value value {
      font-size: 14px;
      font-weight: bold;
      display: block;
    }
    .additional-info {
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
      font-size: 13px;
    }
    .additional-info p {
      margin-bottom: 8px;
    }
    .observations {
      margin-top: 20px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fffbf0;
      font-size: 12px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      text-align: center;
      color: #666;
    }
    .signature-area {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      padding-top: 30px;
    }
    .signature-line {
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 10px;
      font-size: 12px;
    }
    @media print {
      body { padding: 0; }
      .container { border: none; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>PRESCRIÇÃO OFTALMOLÓGICA</h1>
      <p>Alo Clínica | Telemedicina</p>
    </div>

    <!-- Patient Info -->
    <div class="patient-info">
      <div class="info-item">
        <label>Paciente:</label>
        <value>${prescription.patient?.full_name || "—"}</value>
      </div>
      <div class="info-item">
        <label>CPF:</label>
        <value>${prescription.patient?.cpf || "—"}</value>
      </div>
      <div class="info-item">
        <label>Data da Prescrição:</label>
        <value>${prescribedDate}</value>
      </div>
      <div class="info-item">
        <label>Validade:</label>
        <value>${expiryDate}</value>
      </div>
    </div>

    <!-- Prescription Type -->
    <div class="prescription-section">
      <h2>Tipo de Prescrição</h2>
      <div style="padding: 10px; font-size: 14px; font-weight: bold;">
        ${typeLabel}
      </div>
    </div>

    <!-- Refraction -->
    <div class="prescription-section">
      <h2>Refração</h2>
      <div class="eye-prescription">
        <div class="eye-label">Olho Direito (OD)</div>
        <div class="prescription-value">
          <label>Esfera (D)</label>
          <value>${prescription.od_sphere !== null ? (prescription.od_sphere > 0 ? "+" : "") + prescription.od_sphere : "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Cilindro (D)</label>
          <value>${prescription.od_cylinder !== null ? (prescription.od_cylinder > 0 ? "+" : "") + prescription.od_cylinder : "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Eixo (°)</label>
          <value>${prescription.od_axis || "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Adição (D)</label>
          <value>${prescription.od_add !== null ? "+" + prescription.od_add : "—"}</value>
        </div>
      </div>

      <div class="eye-prescription">
        <div class="eye-label">Olho Esquerdo (OS)</div>
        <div class="prescription-value">
          <label>Esfera (D)</label>
          <value>${prescription.os_sphere !== null ? (prescription.os_sphere > 0 ? "+" : "") + prescription.os_sphere : "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Cilindro (D)</label>
          <value>${prescription.os_cylinder !== null ? (prescription.os_cylinder > 0 ? "+" : "") + prescription.os_cylinder : "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Eixo (°)</label>
          <value>${prescription.os_axis || "—"}</value>
        </div>
        <div class="prescription-value">
          <label>Adição (D)</label>
          <value>${prescription.os_add !== null ? "+" + prescription.os_add : "—"}</value>
        </div>
      </div>
    </div>

    <!-- Additional Info -->
    <div class="prescription-section">
      <h2>Informações Adicionais</h2>
      <div class="additional-info">
        ${
          prescription.pupillary_distance
            ? `<p><strong>Distância Pupilar:</strong> ${prescription.pupillary_distance} mm</p>`
            : ""
        }
        <p><strong>Recomendação de Uso:</strong> ${prescription.recommended_use || "—"}</p>
        ${
          prescription.recommended_use === "Progressiva" || prescription.od_add || prescription.os_add
            ? `<p><strong>Tipo:</strong> Lente Progressiva/Multifocal</p>`
            : ""
        }
      </div>
    </div>

    <!-- Observations -->
    ${
      prescription.observations
        ? `
    <div class="observations">
      <strong>Observações:</strong>
      <p>${prescription.observations.replace(/\n/g, "<br>")}</p>
    </div>
    `
        : ""
    }

    <!-- Signature -->
    <div class="signature-area">
      <div class="signature-line">
        <p style="margin-bottom: 20px;"></p>
        <p><strong>${prescription.doctor?.full_name || "Oftalmologista"}</strong></p>
        <p>CRM: ${prescription.doctor?.crm || "—"}/${prescription.doctor?.crm_state || "—"}</p>
      </div>
      <div class="signature-line">
        <p style="margin-bottom: 20px;">Data: ${prescribedDate}</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Esta prescrição foi emitida por Telemedicina</p>
      <p style="margin-top: 10px; font-size: 10px;">Prescrição ID: ${prescription.id}</p>
    </div>
  </div>
</body>
</html>
  `;
}
