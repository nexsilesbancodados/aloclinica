import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getCaller, isInternalOrService, checkRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailRequest {
  type: string;
  to: string;
  data: Record<string, string>;
}

// ─── URL Constants ─────────────────────────────────────────────────────────────
const ROOT_DOMAIN = Deno.env.get("SITE_DOMAIN") || "aloclinica.com";
const PROTOCOL = "https://";
const FALLBACK_URL = Deno.env.get("SITE_URL") || "https://allo-medico-care.lovable.app";

// Subdomain-based URLs for each role
const sub = (subdomain: string, path = "") => `${PROTOCOL}${subdomain}.${ROOT_DOMAIN}${path}`;

const URLS = {
  // Patient routes (paciente.aloclinica.com)
  patientDashboard:    sub("paciente", "/dashboard"),
  patientSchedule:     sub("paciente", "/dashboard/schedule"),
  patientAppointments: sub("paciente", "/dashboard/appointments"),
  patientHealth:       sub("paciente", "/dashboard/health"),
  patientPlans:        sub("paciente", "/dashboard/plans"),
  patientPrescriptions:sub("paciente", "/dashboard/prescriptions"),
  patientSupport:      sub("paciente", "/dashboard/support"),
  // Doctor routes (medico.aloclinica.com)
  doctorDashboard:     sub("medico", "/dashboard"),
  doctorAuth:          sub("medico"),
  // Clinic routes (clinica.aloclinica.com)
  clinicDashboard:     sub("clinica", "/dashboard"),
  clinicAuth:          sub("clinica"),
  // Partner routes (parceiro.aloclinica.com)
  partnerDashboard:    sub("parceiro", "/dashboard"),
  partnerAuth:         sub("parceiro"),
  // Admin (admin.aloclinica.com)
  adminDashboard:      sub("admin", "/dashboard"),
  // Laudista (laudista.aloclinica.com)
  laudistaDashboard:   sub("laudista", "/dashboard"),
  // Auth (root)
  authLogin:           `${PROTOCOL}${ROOT_DOMAIN}/auth`,
  // Validation
  validateDoc: (code: string) => `${PROTOCOL}${ROOT_DOMAIN}/validar/${code}`,
  // Discount card
  discountCard:        `${PROTOCOL}${ROOT_DOMAIN}/cartao-beneficios`,
};

// ─── Email wrapper ─────────────────────────────────────────────────────────────
const BRAND = {
  color: "#1a6fc4",
  colorDark: "#0f4c8a",
  green: "#22c55e",
  greenDark: "#15803d",
  red: "#ef4444",
  redDark: "#b91c1c",
  amber: "#f59e0b",
  amberDark: "#d97706",
  bg: "#f8fafc",
  muted: "#666",
  border: "#e2e8f0",
};



// Banner configs per email category
const BANNERS: Record<string, { emoji: string; title: string; gradient: [string, string]; accent: string }> = {
  appointment:    { emoji: "📅", title: "Consultas",        gradient: [BRAND.color, BRAND.colorDark],   accent: BRAND.color },
  welcome:        { emoji: "🎉", title: "Bem-vindo(a)!",    gradient: [BRAND.color, "#2563eb"],          accent: BRAND.color },
  welcome_doctor: { emoji: "🩺", title: "Portal Médico",    gradient: [BRAND.color, BRAND.colorDark],   accent: BRAND.color },
  welcome_clinic: { emoji: "🏥", title: "Clínica",          gradient: [BRAND.color, BRAND.colorDark],   accent: BRAND.color },
  approved:       { emoji: "✅", title: "Aprovado!",         gradient: [BRAND.green, BRAND.greenDark],   accent: BRAND.green },
  rejected:       { emoji: "❌", title: "Atualização",       gradient: [BRAND.red, BRAND.redDark],       accent: BRAND.red },
  prescription:   { emoji: "💊", title: "Receita Médica",    gradient: [BRAND.color, "#7c3aed"],         accent: BRAND.color },
  certificate:    { emoji: "📋", title: "Documento Médico",  gradient: [BRAND.color, BRAND.colorDark],   accent: BRAND.color },
  payment:        { emoji: "💳", title: "Financeiro",        gradient: [BRAND.green, "#059669"],         accent: BRAND.green },
  consultation:   { emoji: "📹", title: "Teleconsulta",      gradient: [BRAND.color, "#6366f1"],         accent: BRAND.color },
  alert:          { emoji: "⚠️", title: "Atenção",          gradient: [BRAND.amber, BRAND.amberDark],   accent: BRAND.amber },
  card:           { emoji: "💳", title: "Cartão Benefícios", gradient: [BRAND.green, "#10b981"],         accent: BRAND.green },
  exam:           { emoji: "🔬", title: "Resultados",        gradient: [BRAND.color, "#0ea5e9"],         accent: BRAND.color },
  invite:         { emoji: "🔑", title: "Convite",           gradient: [BRAND.green, BRAND.color],       accent: BRAND.color },
  survey:         { emoji: "⭐", title: "Avaliação",          gradient: [BRAND.amber, "#f97316"],         accent: BRAND.amber },
  default:        { emoji: "💙", title: "AloClínica",        gradient: [BRAND.color, BRAND.colorDark],   accent: BRAND.color },
};

const banner = (category: string) => {
  const b = BANNERS[category] || BANNERS.default;
  return `
    <div style="background:linear-gradient(135deg,${b.gradient[0]},${b.gradient[1]});border-radius:16px 16px 0 0;padding:28px 32px 24px;text-align:center;margin:-32px -32px 24px -32px;">
      <div style="margin-bottom:10px;">
        <span style="color:white;font-size:24px;font-weight:800;letter-spacing:1px;">Alo</span><span style="color:#a5d6ff;font-size:24px;font-weight:800;letter-spacing:1px;">Clínica</span>
      </div>
      <div style="font-size:36px;margin-bottom:4px;">${b.emoji}</div>
      <h1 style="color:white;font-size:20px;font-weight:700;margin:0;letter-spacing:0.5px;">${b.title}</h1>
    </div>`;
};

// Map template type → banner category
const TEMPLATE_BANNER: Record<string, string> = {
  appointment_confirmation: "appointment",
  appointment_reminder: "appointment",
  appointment_cancelled: "alert",
  appointment_rescheduled: "alert",
  payment_receipt: "payment",
  prescription_sent: "prescription",
  certificate_sent: "certificate",
  welcome: "welcome",
  welcome_doctor: "welcome_doctor",
  welcome_clinic: "welcome_clinic",
  doctor_approved: "approved",
  doctor_rejected: "rejected",
  clinic_approved: "approved",
  clinic_rejected: "rejected",
  affiliate_approved: "approved",
  affiliate_rejected: "rejected",
  consultation_started: "consultation",
  consultation_completed: "consultation",
  document_uploaded: "certificate",
  password_reset: "default",
  subscription_activated: "payment",
  subscription_expiring: "alert",
  payment_confirmed: "payment",
  exam_report_ready: "exam",
  card_activated: "card",
  card_expiring: "alert",
  refund_processed: "payment",
  renewal_approved: "approved",
  renewal_rejected: "rejected",
  no_show_fee: "alert",
  doctor_invite_code: "invite",
  b2b_lead_received: "default",
  nps_survey: "survey",
  waitlist_slot_available: "approved",
  kyc_approved: "approved",
  kyc_rejected: "rejected",
  payment_failed: "alert",
  security_alert: "alert",
  welcome_laudista: "welcome_doctor",
  exam_assigned: "exam",
  clinic_exam_report_ready: "exam",
  doctor_payout_completed: "payment",
  newsletter_welcome: "welcome",
};

// Lista de templates promocionais que precisam de unsubscribe explícito (LGPD/CAN-SPAM)
const MARKETING_TEMPLATES = new Set([
  "newsletter_welcome",
  "card_activated",
  "subscription_expiring",
  "card_expiring",
  "nps_survey",
  "waitlist_slot_available",
]);

const COMPANY_ADDRESS = Deno.env.get("EMAIL_COMPANY_ADDRESS")
  || "AloClínica Telemedicina · Brasil";
const SUPPORT_EMAIL = Deno.env.get("EMAIL_SUPPORT_ADDRESS")
  || "suporte@aloclinica.com.br";

const wrap = (body: string, templateType = "default") => {
  const bannerHtml = banner(TEMPLATE_BANNER[templateType] || "default");
  const isMarketing = MARKETING_TEMPLATES.has(templateType);
  const unsubLink = isMarketing
    ? `<p style="color:${BRAND.muted};font-size:11px;text-align:center;margin:8px 0 0;">
         <a href="${PROTOCOL}${ROOT_DOMAIN}/dashboard/notifications" style="color:${BRAND.muted};text-decoration:underline;">Gerenciar preferências de e-mail</a>
       </p>`
    : "";
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:24px auto;padding:32px;background:${BRAND.bg};border-radius:16px;border:1px solid ${BRAND.border};overflow:hidden;">
    ${bannerHtml}
    ${body}
    <hr style="border:none;border-top:1px solid ${BRAND.border};margin:32px 0 16px;" />
    <p style="color:${BRAND.muted};font-size:11px;text-align:center;margin:0;line-height:1.6;">
      <strong>AloClínica</strong> · Telemedicina Digital<br/>
      ${COMPANY_ADDRESS}<br/>
      Precisa de ajuda? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.color};text-decoration:none;">${SUPPORT_EMAIL}</a>
    </p>
    ${unsubLink}
    <p style="color:${BRAND.muted};font-size:10px;text-align:center;margin:12px 0 0;opacity:0.7;">
      Este e-mail foi enviado pra você porque está cadastrado na AloClínica.<br/>
      Não responda — usamos ${SUPPORT_EMAIL} pra qualquer dúvida.
    </p>
  </div>
</body>
</html>`;
};

const btn = (url: string, label: string, color = BRAND.color) =>
  `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;background:${color};color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">${label}</a></div>`;

const card = (content: string, borderColor = BRAND.color) =>
  `<div style="background:white;padding:18px;border-radius:10px;margin:16px 0;border-left:4px solid ${borderColor};">${content}</div>`;

// ─── Templates ─────────────────────────────────────────────────────────────────
const templates: Record<string, (d: Record<string, string>) => { subject: string; html: string }> = {

  appointment_confirmation: (d) => ({
    subject: "✅ Consulta Confirmada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Consulta Confirmada!</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Sua consulta com <strong>${d.doctor_name}</strong> foi confirmada.</p>
      ${card(`
        <p><strong>📅 Data:</strong> ${d.date}</p>
        <p><strong>⏰ Horário:</strong> ${d.time}</p>
        <p><strong>🩺 Especialidade:</strong> ${d.specialty || "Clínica Geral"}</p>
      `)}
      <p>Acesse a plataforma <strong>5 minutos antes</strong> para entrar na sala de espera virtual.</p>
      ${d.room_link ? btn(d.room_link, "📹 Entrar na sala") : ""}
      ${btn(URLS.patientAppointments, "Ver Minha Consulta", BRAND.muted)}
    `, "appointment_confirmation"),
  }),

  payment_receipt: (d) => ({
    subject: `🧾 Recibo de pagamento ${d.receipt_number ? "#" + d.receipt_number : ""} — AloClínica`,
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Pagamento recebido</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Recebemos o pagamento da sua teleconsulta. Este e-mail serve como comprovante.</p>
      ${card(`
        <p><strong>🧾 Recibo nº:</strong> ${d.receipt_number || d.appointment_id?.slice(0, 8).toUpperCase() || "—"}</p>
        <p><strong>📅 Emitido em:</strong> ${d.issued_at}</p>
        <p><strong>💳 Forma de pagamento:</strong> ${d.payment_method || "—"}</p>
        ${d.payment_id ? `<p><strong>🔖 ID da transação:</strong> ${d.payment_id}</p>` : ""}
      `, BRAND.green)}
      ${card(`
        <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">Pagador</p>
        <p style="margin:0 0 4px;"><strong>${d.patient_name}</strong></p>
        ${d.patient_cpf ? `<p style="margin:0;color:${BRAND.muted};font-size:13px;">CPF: ${d.patient_cpf}</p>` : ""}
      `)}
      ${card(`
        <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">Serviço prestado</p>
        <p style="margin:0 0 4px;"><strong>Teleconsulta médica</strong> com ${d.doctor_name}</p>
        ${d.doctor_crm ? `<p style="margin:0;color:${BRAND.muted};font-size:13px;">CRM ${d.doctor_crm}</p>` : ""}
        <p style="margin:8px 0 0;"><strong>📅 Data da consulta:</strong> ${d.date} às ${d.time}</p>
      `)}
      <div style="background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;padding:18px;margin:20px 0;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">Valor total pago</span>
        <span style="font-size:24px;font-weight:800;color:${BRAND.greenDark};">${d.amount}</span>
      </div>
      ${btn(d.receipt_url || URLS.patientAppointments, "Baixar recibo em PDF")}
      <p style="font-size:12px;color:${BRAND.muted};margin-top:20px;">Guarde este recibo para fins de reembolso junto ao seu plano de saúde ou imposto de renda. Em caso de dúvidas, fale com o suporte AloClínica.</p>
    `, "payment_receipt"),
  }),

  appointment_reminder: (d) => ({
    subject: `⏰ Lembrete: Consulta em ${d.time_until} — AloClínica`,
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Lembrete de Consulta</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Sua consulta com <strong>${d.doctor_name}</strong> acontece em <strong>${d.time_until}</strong>.</p>
      ${card(`
        <p><strong>📅 Data:</strong> ${d.date}</p>
        <p><strong>⏰ Horário:</strong> ${d.time}</p>
      `)}
      <p>Você pode entrar na sala de espera virtual com antecedência — basta clicar no botão abaixo.</p>
      ${btn(d.room_link || URLS.patientAppointments, "📹 Entrar na sala")}
      <p style="font-size:12px;color:${BRAND.muted};text-align:center;margin-top:-8px;">Você precisa estar logado(a) na AloClínica para acessar a sala.</p>
    `, "appointment_reminder"),
  }),

  appointment_cancelled: (d) => ({
    subject: "❌ Consulta Cancelada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Consulta Cancelada</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Sua consulta com <strong>${d.doctor_name}</strong> foi <strong style="color:${BRAND.red};">cancelada</strong>.</p>
      ${card(`
        <p><strong>📅 Data:</strong> ${d.date}</p>
        <p><strong>⏰ Horário:</strong> ${d.time}</p>
        ${d.reason ? `<p><strong>📝 Motivo:</strong> ${d.reason}</p>` : ""}
        <p><strong>Cancelado por:</strong> ${d.cancelled_by || "—"}</p>
      `, BRAND.red)}
      <p>Deseja reagendar? Acesse a plataforma e escolha um novo horário.</p>
      ${btn(URLS.patientSchedule, "Reagendar Consulta")}
    `, "appointment_cancelled"),
  }),

  appointment_rescheduled: (d) => ({
    subject: "🔄 Consulta Reagendada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">Consulta Reagendada</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Sua consulta com <strong>${d.doctor_name}</strong> foi reagendada.</p>
      ${card(`
        <p><strong>📅 Nova Data:</strong> ${d.new_date}</p>
        <p><strong>⏰ Novo Horário:</strong> ${d.new_time}</p>
      `, BRAND.amber)}
    `, "appointment_rescheduled"),
  }),

  prescription_sent: (d) => ({
    subject: "💊 Nova Receita Médica — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Nova Receita Médica</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>O(a) <strong>${d.doctor_name}</strong> emitiu uma nova receita para você.</p>
      ${d.diagnosis ? `<div style="background:#fff8f0;padding:12px;border-radius:8px;margin:12px 0;"><strong>Diagnóstico:</strong> ${d.diagnosis}</div>` : ""}
      ${d.medications ? card(`<strong>Medicamentos:</strong><pre style="white-space:pre-wrap;font-family:sans-serif;font-size:14px;margin-top:8px;">${d.medications}</pre>`) : ""}
      ${btn(URLS.patientPrescriptions, "Ver Minha Receita")}
    `, "prescription_sent"),
  }),

  certificate_sent: (d) => ({
    subject: "📋 Atestado Médico Emitido — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Atestado Médico Emitido</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>O(a) <strong>${d.doctor_name}</strong> emitiu um ${d.cert_type || "atestado médico"} para você.</p>
      ${card(`
        ${d.days ? `<p><strong>📅 Dias de afastamento:</strong> ${d.days}</p>` : ""}
        <p><strong>🔐 Código de verificação:</strong> ${d.verification_code || "—"}</p>
      `)}
      ${btn(URLS.patientHealth, "Baixar Documento")}
    `, "certificate_sent"),
  }),

  welcome: (d) => ({
    subject: "🎉 Bem-vindo(a) à AloClínica!",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Bem-vindo(a) à AloClínica!</h2>
      <p>Olá <strong>${d.name}</strong>,</p>
      <p>Sua conta foi criada com sucesso. Agora você pode:</p>
      <ul>
        <li>Buscar médicos por especialidade</li>
        <li>Agendar consultas online</li>
        <li>Receber receitas e atestados digitais</li>
      </ul>
      ${btn(URLS.patientDashboard, "Acessar Painel")}
    `, "welcome"),
  }),

  welcome_doctor: (d) => ({
    subject: "🩺 Bem-vindo(a), Dr(a)! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Bem-vindo(a) ao Portal Médico!</h2>
      <p>Olá <strong>Dr(a). ${d.name}</strong>,</p>
      <p>Seu cadastro como médico(a) foi recebido com sucesso!</p>
      ${card(`
        <p><strong>CRM:</strong> ${d.crm || "—"}</p>
        <p><strong>Próximos passos:</strong></p>
        <ol style="margin-top:8px;padding-left:20px;">
          <li>Aguarde a aprovação do administrador</li>
          <li>Complete o onboarding no painel</li>
          <li>Configure sua disponibilidade</li>
        </ol>
      `)}
    `, "welcome_doctor"),
  }),

  welcome_clinic: (d) => ({
    subject: "🏥 Clínica Cadastrada! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Clínica Cadastrada com Sucesso!</h2>
      <p>Olá <strong>${d.name}</strong>,</p>
      <p>Sua clínica <strong>${d.clinic_name}</strong> foi cadastrada na plataforma AloClínica.</p>
      ${card(`<p>📋 <strong>Status:</strong> Aguardando aprovação do administrador</p>`)}
    `, "welcome_clinic"),
  }),

  doctor_approved: (d) => ({
    subject: "✅ Cadastro Médico Aprovado! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">🎉 Cadastro Aprovado!</h2>
      <p>Olá <strong>Dr(a). ${d.name}</strong>,</p>
      <p>Seu cadastro na AloClínica foi <strong style="color:${BRAND.green};">APROVADO</strong>!</p>
      ${card(`
        <ul>
          <li>Configurar sua disponibilidade</li>
          <li>Receber agendamentos de pacientes</li>
          <li>Emitir receitas e atestados digitais</li>
        </ul>
      `, BRAND.green)}
      ${btn(d.login_url || URLS.doctorAuth, "Acessar Painel Médico", BRAND.green)}
    `, "doctor_approved"),
  }),

  doctor_rejected: (d) => ({
    subject: "❌ Cadastro Médico Não Aprovado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Cadastro Não Aprovado</h2>
      <p>Olá <strong>Dr(a). ${d.name}</strong>,</p>
      <p>Infelizmente, seu cadastro na AloClínica <strong style="color:${BRAND.red};">não foi aprovado</strong> neste momento.</p>
      ${d.reason ? `<div style="background:#fef2f2;padding:12px;border-radius:8px;margin:12px 0;"><strong>Motivo:</strong> ${d.reason}</div>` : ""}
      <p>Se acredita que houve um engano, entre em contato com o suporte.</p>
    `, "doctor_rejected"),
  }),

  clinic_approved: (d) => ({
    subject: "✅ Clínica Aprovada! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">🏥 Clínica Aprovada!</h2>
      <p>Olá <strong>${d.name}</strong>,</p>
      <p>Sua clínica <strong>${d.clinic_name || ""}</strong> foi <strong style="color:${BRAND.green};">APROVADA</strong>!</p>
      ${card(`
        <ul>
          <li>Vincular médicos à sua clínica</li>
          <li>Gerenciar agendas e recepção</li>
          <li>Acompanhar financeiro e relatórios</li>
        </ul>
      `, BRAND.green)}
      ${btn(d.login_url || URLS.clinicAuth, "Acessar Painel da Clínica", BRAND.green)}
    `, "clinic_approved"),
  }),

  clinic_rejected: (d) => ({
    subject: "❌ Clínica Não Aprovada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Clínica Não Aprovada</h2>
      <p>Olá <strong>${d.name}</strong>,</p>
      <p>Sua clínica <strong>${d.clinic_name || ""}</strong> <strong style="color:${BRAND.red};">não foi aprovada</strong> neste momento.</p>
      ${d.reason ? `<div style="background:#fef2f2;padding:12px;border-radius:8px;margin:12px 0;"><strong>Motivo:</strong> ${d.reason}</div>` : ""}
      <p>Se acredita que houve um engano, entre em contato com o suporte.</p>
    `, "clinic_rejected"),
  }),

  affiliate_approved: (d) => ({
    subject: "✅ Afiliação Aprovada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">🎉 Parabéns, ${d.name}!</h2>
      <p>Sua solicitação de afiliação à <strong>AloClínica</strong> foi <strong style="color:${BRAND.green};">APROVADA</strong>!</p>
      ${card(`
        <p><strong>💰 Comissão:</strong> 2% sobre ganhos dos pacientes indicados</p>
        <p><strong>🔄 Recorrência:</strong> Assinaturas mensais e consultas avulsas</p>
        <p><strong>💳 Saque:</strong> Solicite pelo painel</p>
      `, BRAND.green)}
      ${btn(d.login_url || URLS.partnerAuth, "Acessar Painel de Afiliado", BRAND.green)}
    `, "affiliate_approved"),
  }),

  affiliate_rejected: (d) => ({
    subject: "❌ Solicitação de Afiliação — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Solicitação não aprovada</h2>
      <p>Olá <strong>${d.name}</strong>,</p>
      <p>Sua solicitação de afiliação <strong style="color:${BRAND.red};">não foi aprovada</strong> neste momento.</p>
      ${d.reason ? `<div style="background:#fef2f2;padding:12px;border-radius:8px;margin:12px 0;"><strong>Motivo:</strong> ${d.reason}</div>` : ""}
    `, "affiliate_rejected"),
  }),

  consultation_started: (d) => ({
    subject: "📹 Seu Médico Está Online! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Seu Médico Entrou na Sala!</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p><strong>${d.doctor_name}</strong> já está na sala de consulta virtual.</p>
      ${btn(d.consultation_url || "#", "Entrar na Consulta 📹")}
    `, "consultation_started"),
  }),

  consultation_completed: (d) => ({
    subject: "🎉 Consulta Finalizada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Consulta Finalizada!</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>Sua consulta com <strong>${d.doctor_name}</strong> foi concluída com sucesso!</p>
      ${card(`
        <p>📋 Receitas e documentos já estão disponíveis no seu painel.</p>
        <p>⭐ Avalie sua experiência para ajudar outros pacientes!</p>
      `, BRAND.green)}
      ${btn(URLS.patientHealth, "Ver Documentos")}
    `, "consultation_completed"),
  }),

  document_uploaded: (d) => ({
    subject: "📎 Novo Documento Disponível — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Novo Documento Disponível</h2>
      <p>Olá <strong>${d.patient_name}</strong>,</p>
      <p>O(a) <strong>${d.doctor_name}</strong> enviou um novo documento para você:</p>
      ${card(`
        <p><strong>📄 Arquivo:</strong> ${d.file_name || "Documento"}</p>
        ${d.description ? `<p><strong>📝 Descrição:</strong> ${d.description}</p>` : ""}
      `)}
      ${btn(URLS.patientHealth, "Visualizar e Baixar")}
    `, "document_uploaded"),
  }),

  password_reset: (d) => ({
    subject: "🔐 Redefinição de Senha — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Redefinição de Senha</h2>
      <p>Olá${d.name ? ` <strong>${d.name}</strong>` : ""},</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta AloClínica.</p>
      ${d.reset_link ? btn(d.reset_link, "Redefinir Senha") : ""}
      <p style="color:${BRAND.muted};font-size:13px;">Este link expira em 1 hora. Se não solicitou a redefinição, ignore este e-mail.</p>
    `, "password_reset"),
  }),

  subscription_activated: (d) => ({
    subject: "🎉 Plano Ativado com Sucesso — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Plano Ativado!</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu <strong>${d.plan_name || "plano"}</strong> foi ativado com sucesso.</p>
      ${card(`
        <p><strong>Plano:</strong> ${d.plan_name || "—"}</p>
        <p><strong>Válido até:</strong> ${d.expires_at || "—"}</p>
        <p><strong>Consultas incluídas:</strong> ${d.max_appointments || "Ilimitadas"}</p>
      `, BRAND.green)}
      ${btn(URLS.patientSchedule, "Agendar Consulta", BRAND.green)}
    `, "subscription_activated"),
  }),

  subscription_expiring: (d) => ({
    subject: "⚠️ Seu Plano Expira em Breve — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">Plano Expirando</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu plano <strong>${d.plan_name || "atual"}</strong> expira em <strong>${d.days_left || "poucos"} dias</strong>.</p>
      ${card(`<p><strong>📅 Expira em:</strong> ${d.expires_at || "—"}</p>`, BRAND.amber)}
      ${btn(d.renew_link || URLS.patientPlans, "Renovar Plano", BRAND.amber)}
    `, "subscription_expiring"),
  }),

  payment_confirmed: (d) => ({
    subject: "✅ Pagamento Confirmado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Pagamento Confirmado! ✅</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu pagamento${d.amount ? ` de <strong>R$ ${d.amount}</strong>` : ""} foi confirmado com sucesso!</p>
      ${card(`
        <p><strong>🩺 Médico:</strong> ${d.doctor_name || "—"}</p>
        <p><strong>📅 Data:</strong> ${d.date || "—"}</p>
        <p><strong>⏰ Horário:</strong> ${d.time || "—"}</p>
      `, BRAND.green)}
      <p>Sua consulta está <strong>garantida</strong>. Acesse a plataforma 5 minutos antes.</p>
      ${btn(URLS.patientAppointments, "Ver Minhas Consultas")}
    `, "payment_confirmed"),
  }),

  exam_report_ready: (d) => ({
    subject: "📋 Resultado de Exame Disponível — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Seu Laudo Está Pronto! 📋</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>O laudo do exame <strong>${d.exam_type || "exame"}</strong> foi finalizado por <strong>${d.doctor_name || "médico"}</strong>.</p>
      ${card(`
        <p><strong>🔬 Tipo:</strong> ${d.exam_type || "—"}</p>
        <p><strong>🩺 Laudista:</strong> ${d.doctor_name || "—"}</p>
        ${d.verification_code ? `<p><strong>🔐 Código:</strong> ${d.verification_code}</p>` : ""}
      `)}
      ${btn(d.download_link || URLS.patientHealth, "Acessar Meu Laudo")}
      ${d.validate_link ? `<p style="font-size:12px;color:${BRAND.muted};text-align:center;">Verifique em: <a href="${d.validate_link}" style="color:${BRAND.color};">${d.validate_link}</a></p>` : ""}
    `, "exam_report_ready"),
  }),

  card_activated: (d) => ({
    subject: "🎉 Cartão de Benefícios Ativado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">🎉 Cartão Ativado!</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu <strong>Cartão de Benefícios ${d.plan_name || ""}</strong> foi ativado!</p>
      ${card(`
        <p><strong>💳 Plano:</strong> ${d.plan_name || "—"}</p>
        <p><strong>📅 Válido até:</strong> ${d.valid_until || "—"}</p>
        <p><strong>💰 Desconto:</strong> ${d.discount_percent || "30"}% em consultas</p>
      `, BRAND.green)}
      <div style="background:#f0fdf4;padding:16px;border-radius:10px;margin:16px 0;">
        <p style="font-weight:bold;color:#166534;margin:0 0 8px;">Seus benefícios:</p>
        <ul style="color:#166534;font-size:14px;padding-left:20px;margin:0;">
          <li>Telemedicina 24h/7</li>
          <li>Clube de Vantagens (até 80% off)</li>
          <li>Reagendamentos gratuitos</li>
        </ul>
      </div>
      ${btn(URLS.patientSchedule, "Agendar Consulta com Desconto", BRAND.green)}
    `, "card_activated"),
  }),

  card_expiring: (d) => ({
    subject: "⚠️ Cartão de Benefícios Expirando — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">⚠️ Cartão Expirando!</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu <strong>Cartão ${d.plan_name || ""}</strong> expira em <strong>${d.days_left || "poucos"} dias</strong>.</p>
      ${card(`
        <p><strong>📅 Expira em:</strong> ${d.valid_until || "—"}</p>
        <p>Renove para manter seus descontos e benefícios!</p>
      `, BRAND.amber)}
      ${btn(URLS.patientPlans, "Renovar Meu Cartão", BRAND.amber)}
    `, "card_expiring"),
  }),

  refund_processed: (d) => ({
    subject: "💸 Reembolso Processado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Reembolso Processado 💸</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Seu reembolso${d.amount ? ` de <strong>R$ ${d.amount}</strong>` : ""} foi processado com sucesso.</p>
      ${card(`
        ${d.reason ? `<p><strong>Motivo:</strong> ${d.reason}</p>` : ""}
        <p><strong>Prazo:</strong> O valor será devolvido em até 10 dias úteis.</p>
      `)}
    `, "refund_processed"),
  }),

  renewal_approved: (d) => ({
    subject: "✅ Receita Renovada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Receita Renovada! ✅</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Sua renovação de receita foi <strong style="color:${BRAND.green};">aprovada</strong> por <strong>${d.doctor_name || "médico"}</strong>.</p>
      ${card(`
        <p>📋 A nova receita já está disponível.</p>
        ${d.notes ? `<p><strong>Observações:</strong> ${d.notes}</p>` : ""}
      `, BRAND.green)}
      ${btn(URLS.patientPrescriptions, "Ver Minha Receita", BRAND.green)}
    `, "renewal_approved"),
  }),

  renewal_rejected: (d) => ({
    subject: "❌ Renovação de Receita Negada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Renovação Não Aprovada</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Sua renovação de receita <strong style="color:${BRAND.red};">não foi aprovada</strong>.</p>
      ${d.reason ? `<div style="background:#fef2f2;padding:12px;border-radius:8px;margin:12px 0;"><strong>Motivo:</strong> ${d.reason}</div>` : ""}
      <p>Recomendamos agendar uma nova consulta para reavaliação.</p>
      ${btn(URLS.patientSchedule, "Agendar Consulta")}
    `, "renewal_rejected"),
  }),

  no_show_fee: (d) => ({
    subject: "⚠️ Taxa de Não Comparecimento — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">Taxa de Não Comparecimento</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Você não compareceu à consulta com <strong>${d.doctor_name || "o médico"}</strong> em <strong>${d.date || "—"} às ${d.time || "—"}</strong>.</p>
      ${card(`
        <p>Conforme nossa política, será cobrada uma <strong>taxa de 50%</strong> do valor da consulta.</p>
        ${d.amount ? `<p><strong>Valor retido:</strong> R$ ${d.amount}</p>` : ""}
      `, BRAND.amber)}
      <p>Para evitar cobranças futuras, cancele com pelo menos 2h de antecedência.</p>
    `, "no_show_fee"),
  }),

  doctor_invite_code: (d) => ({
    subject: "🔑 Seu Código de Convite — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Código de Convite</h2>
      <p>Olá <strong>Dr(a). ${d.name}</strong>,</p>
      <p>Seu cadastro foi aprovado! Use o código abaixo para completar seu registro na plataforma:</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:white;border:2px dashed ${BRAND.color};padding:16px 40px;border-radius:12px;font-size:28px;font-weight:bold;color:${BRAND.color};letter-spacing:4px;">${d.invite_code}</div>
      </div>
      ${btn(d.register_url || URLS.doctorAuth, "Completar Cadastro")}
      <p style="color:${BRAND.muted};font-size:13px;">Este código é de uso único. Não compartilhe com terceiros.</p>
    `, "doctor_invite_code"),
  }),

  b2b_lead_received: (d) => ({
    subject: "📩 Nova Solicitação B2B — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Nova Solicitação B2B</h2>
      ${card(`
        <p><strong>Empresa:</strong> ${d.company_name || "—"}</p>
        <p><strong>Contato:</strong> ${d.contact_name || "—"}</p>
        <p><strong>E-mail:</strong> ${d.email || "—"}</p>
        <p><strong>Telefone:</strong> ${d.phone || "—"}</p>
        ${d.message ? `<p><strong>Mensagem:</strong> ${d.message}</p>` : ""}
      `)}
    `, "b2b_lead_received"),
  }),

  nps_survey: (d) => ({
    subject: "⭐ Como foi sua experiência? — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Avalie Sua Experiência</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Sua opinião é muito importante! Avalie sua consulta com <strong>${d.doctor_name || "o médico"}</strong>.</p>
      ${btn(d.survey_url || URLS.patientDashboard, "Avaliar Agora ⭐")}
    `, "nps_survey"),
  }),

  waitlist_slot_available: (d) => ({
    subject: "🎉 Vaga Disponível! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Vaga Disponível!</h2>
      <p>Olá <strong>${d.patient_name || "Paciente"}</strong>,</p>
      <p>Uma vaga abriu para sua consulta com <strong>${d.doctor_name}</strong> no dia <strong>${d.date}</strong>!</p>
      ${card(`<p>⚡ Reserve rápido — a vaga é por ordem de chegada!</p>`, BRAND.green)}
      ${btn(URLS.patientSchedule, "Reservar Agora", BRAND.green)}
    `, "waitlist_slot_available"),
  }),

  kyc_approved: (d) => ({
    subject: "✅ Documentação Aprovada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Documentação Aprovada!</h2>
      <p>Olá <strong>Dr(a). ${d.name || "Profissional"}</strong>,</p>
      <p>Sua documentação foi <strong style="color:${BRAND.green};">aprovada</strong>! Já pode atender na AloClínica.</p>
      ${card(`<p>✅ Agora você tem acesso completo à plataforma para receber pacientes e emitir documentos digitais.</p>`, BRAND.green)}
      ${btn(URLS.doctorDashboard, "Acessar Painel Médico", BRAND.green)}
    `, "kyc_approved"),
  }),

  kyc_rejected: (d) => ({
    subject: "❌ Documentação Não Aprovada — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.red};margin:0 0 16px;">Documentação Não Aprovada</h2>
      <p>Olá <strong>${d.name || "Profissional"}</strong>,</p>
      <p>Sua verificação de documentos <strong style="color:${BRAND.red};">não foi aprovada</strong>.</p>
      ${d.reason ? `<div style="background:#fef2f2;padding:12px;border-radius:8px;margin:12px 0;"><strong>Motivo:</strong> ${d.reason}</div>` : ""}
      <p>Por favor, reenvie seus documentos com boa qualidade e iluminação.</p>
      ${btn(d.resubmit_url || URLS.doctorDashboard, "Reenviar Documentos", BRAND.red)}
    `, "kyc_rejected"),
  }),

  payment_failed: (d) => ({
    subject: "⚠️ Falha no Pagamento — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">Não Foi Possível Processar seu Pagamento</h2>
      <p>Olá <strong>${d.name || "Cliente"}</strong>,</p>
      <p>Identificamos uma falha no pagamento ${d.description ? `de <strong>${d.description}</strong>` : ""}.</p>
      ${card(`
        ${d.amount ? `<p><strong>💰 Valor:</strong> R$ ${d.amount}</p>` : ""}
        ${d.reason ? `<p><strong>📝 Motivo:</strong> ${d.reason}</p>` : ""}
        <p>Tente novamente com outro método de pagamento.</p>
      `, BRAND.amber)}
      ${btn(d.retry_url || URLS.patientPlans, "Tentar Novamente", BRAND.amber)}
    `, "payment_failed"),
  }),

  security_alert: (d) => ({
    subject: "🔐 Alerta de Segurança: Novo acesso detectado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.amber};margin:0 0 16px;">Novo Acesso Detectado</h2>
      <p>Olá <strong>${d.name || "Usuário"}</strong>,</p>
      <p>Detectamos um novo login em sua conta AloClínica a partir de um dispositivo desconhecido.</p>
      ${card(`
        <p><strong>🌐 IP:</strong> ${d.ip || "—"}</p>
        <p><strong>📍 Localização:</strong> ${d.location || "—"}</p>
        <p><strong>💻 Dispositivo:</strong> ${d.device || "—"}</p>
        <p><strong>⏰ Horário:</strong> ${d.time || "agora"}</p>
      `, BRAND.amber)}
      <p><strong>Foi você?</strong> Se sim, pode ignorar este e-mail.</p>
      <p>Caso não reconheça este acesso, redefina sua senha imediatamente.</p>
      ${btn(d.confirm_url || URLS.authLogin, "Foi você? Confirmar", BRAND.green)}
      ${btn(d.reset_url || `${URLS.authLogin}?reset=1`, "Não fui eu — Redefinir senha", BRAND.red)}
    `, "security_alert"),
  }),

  welcome_laudista: (d) => ({
    subject: "🔬 Bem-vindo(a), Laudista! — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Bem-vindo(a) ao Portal do Laudista!</h2>
      <p>Olá <strong>Dr(a). ${d.name || "Laudista"}</strong>,</p>
      <p>Sua conta de laudista foi criada com sucesso na AloClínica.</p>
      ${card(`
        <p>🔬 Aqui você pode:</p>
        <ul>
          <li>Visualizar a fila de exames disponíveis</li>
          <li>Assumir exames e emitir laudos digitais</li>
          <li>Assinar digitalmente seus laudos</li>
          <li>Acompanhar seus ganhos</li>
        </ul>
      `)}
      ${btn(URLS.laudistaDashboard, "Acessar Fila de Exames")}
    `, "welcome_laudista"),
  }),

  exam_assigned: (d) => ({
    subject: "🔬 Novo Exame Atribuído — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Você Tem um Novo Exame!</h2>
      <p>Olá <strong>Dr(a). ${d.name || "Laudista"}</strong>,</p>
      <p>Um novo exame foi atribuído a você para laudo.</p>
      ${card(`
        <p><strong>🔬 Tipo de exame:</strong> ${d.exam_type || "—"}</p>
        <p><strong>⚠️ Prioridade:</strong> ${d.priority || "Normal"}</p>
        ${d.clinical_info ? `<p><strong>📋 Info clínica:</strong> ${d.clinical_info}</p>` : ""}
      `)}
      ${btn(URLS.laudistaDashboard, "Ver Exame")}
    `, "exam_assigned"),
  }),

  clinic_exam_report_ready: (d) => ({
    subject: "📄 Laudo Disponível — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Laudo de Exame Pronto!</h2>
      <p>Olá <strong>${d.name || "Equipe da Clínica"}</strong>,</p>
      <p>O laudo do exame solicitado por sua clínica está disponível.</p>
      ${card(`
        <p><strong>🔬 Exame:</strong> ${d.exam_type || "—"}</p>
        <p><strong>🩺 Laudista:</strong> ${d.reporter_name || "—"}</p>
        ${d.patient_name ? `<p><strong>👤 Paciente:</strong> ${d.patient_name}</p>` : ""}
      `)}
      ${btn(URLS.clinicDashboard, "Ver Laudo")}
    `, "clinic_exam_report_ready"),
  }),

  doctor_payout_completed: (d) => ({
    subject: "💰 Saque Realizado — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Saque Concluído!</h2>
      <p>Olá <strong>Dr(a). ${d.name || "Profissional"}</strong>,</p>
      <p>Seu saque via Pix foi processado com sucesso.</p>
      ${card(`
        <p><strong>💰 Valor:</strong> R$ ${d.amount || "—"}</p>
        <p><strong>🔑 Chave Pix:</strong> ${d.pix_key || "—"}</p>
        <p><strong>📅 Data:</strong> ${d.date || "hoje"}</p>
        ${d.transaction_id ? `<p><strong>🧾 ID transação:</strong> ${d.transaction_id}</p>` : ""}
      `, BRAND.green)}
      ${btn(URLS.doctorDashboard, "Ver Financeiro", BRAND.green)}
    `, "doctor_payout_completed"),
  }),

  newsletter_welcome: (d) => ({
    subject: "💙 Bem-vindo(a) à Newsletter AloClínica!",
    html: wrap(`
      <h2 style="color:${BRAND.color};margin:0 0 16px;">Obrigado por se Inscrever!</h2>
      <p>Olá${d.name ? ` <strong>${d.name}</strong>` : ""},</p>
      <p>Você está inscrito(a) na newsletter da AloClínica. Em breve receberá conteúdos sobre saúde, bem-estar e novidades da plataforma.</p>
      ${card(`<p>🩺 Dicas de saúde • 💊 Novidades • 🎁 Ofertas exclusivas</p>`)}
      ${btn(`${PROTOCOL}${ROOT_DOMAIN}`, "Visitar AloClínica")}
      <p style="font-size:11px;color:${BRAND.muted};text-align:center;margin-top:24px;">
        Não deseja mais receber nossos e-mails? <a href="${d.unsubscribe_url || `${PROTOCOL}${ROOT_DOMAIN}/unsubscribe?email=${encodeURIComponent(d.email || "")}`}" style="color:${BRAND.muted};">Cancelar inscrição</a>.
      </p>
    `, "newsletter_welcome"),
  }),

  kyc_approved: (d) => ({
    subject: "✅ Identidade verificada com sucesso — AloClínica",
    html: wrap(`
      <h2 style="color:${BRAND.green};margin:0 0 16px;">Tudo certo, ${d.name || "tudo certo"}!</h2>
      <p>Sua identidade foi <strong>verificada com sucesso</strong> pela nossa IA biométrica. 🎉</p>
      <p>Agora você pode aproveitar todas as funcionalidades da AloClínica com segurança total.</p>
      ${card(`
        <p><strong>🛡️ Verificação:</strong> Biometria facial + documento</p>
        <p><strong>📅 Data:</strong> ${d.verified_at || "agora"}</p>
        ${d.score ? `<p><strong>🎯 Confiabilidade:</strong> ${d.score}%</p>` : ""}
      `, BRAND.green)}
      <p>Você pode continuar de onde parou:</p>
      ${btn(d.return_url || URLS.patientSchedule, d.return_label || "Continuar agendamento", BRAND.green)}
      <p style="font-size:12px;color:${BRAND.muted};margin-top:20px;">
        Seus dados ficam criptografados (AES-256) e nunca são compartilhados com terceiros. Conforme LGPD (Lei 13.709/2018).
      </p>
    `, "kyc_approved"),
  }),
};

// ─── Server ────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Trigger/cron and cross-function calls bypass per-user limits. Everyone
    // else must be an authenticated user and is rate-limited — prevents abuse
    // of the branded email templates for phishing/spam to arbitrary addresses.
    if (!isInternalOrService(req)) {
      const caller = await getCaller(req);
      if (!caller.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!caller.isAdmin) {
        const allowed = await checkRateLimit(`user:${caller.user.id}`, "send-email", 40, 10);
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde um momento." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
          });
        }
      }
    }

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || Deno.env.get("RESEND_API_KEY");

    if (!BREVO_API_KEY) {
      const body: EmailRequest = await req.json();
      console.info("[DEV] Email would be sent:", JSON.stringify(body));
      return new Response(
        JSON.stringify({ success: true, dev: true, message: "Email logged (BREVO_API_KEY not configured)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: EmailRequest = await req.json();
    const { type, to, data } = body;

    // Override: se notification_templates tem o slug+channel='email' ATIVO, usa ele.
    // Senão, cai no template hardcoded abaixo.
    let subject: string;
    let html: string;
    let usedDbTemplate = false;
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: dbTpl } = await sb
        .from("notification_templates")
        .select("subject, body_html")
        .eq("slug", type)
        .eq("channel", "email")
        .eq("is_active", true)
        .maybeSingle();
      if (dbTpl?.body_html && dbTpl?.subject) {
        // Renderiza variáveis {{key}} → data[key]
        const interpolate = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => String((data as any)?.[k] ?? ""));
        subject = interpolate(dbTpl.subject);
        html = interpolate(dbTpl.body_html);
        usedDbTemplate = true;
      } else {
        const template = templates[type];
        if (!template) {
          return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const rendered = template(data);
        subject = rendered.subject;
        html = rendered.html;
      }
    } catch {
      const template = templates[type];
      if (!template) {
        return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const rendered = template(data);
      subject = rendered.subject;
      html = rendered.html;
    }
    const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@telemedicinaaloclinica.sbs";
    const fromName = Deno.env.get("EMAIL_FROM_NAME") || "AloClínica";

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        // Reply-To pro suporte (usuário responde, cai no suporte real, não no noreply)
        replyTo: { email: SUPPORT_EMAIL, name: "Suporte AloClínica" },
        // Headers anti-spam
        headers: {
          "X-Mailer": "AloClinica/1.0",
          "List-Unsubscribe": `<mailto:${SUPPORT_EMAIL}?subject=Unsubscribe>, <${PROTOCOL}${ROOT_DOMAIN}/dashboard/notifications>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const result = await res.json();

    // Logging em notification_log (non-blocking)
    const logEvent = async (status: string, error?: string, providerMsgId?: string) => {
      try {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await sb.from("notification_log").insert({
          template_slug: type,
          channel: "email",
          recipient: to,
          subject,
          status,
          provider: "brevo",
          provider_message_id: providerMsgId ?? null,
          error: error ?? null,
          payload: { db_template: usedDbTemplate, data_keys: Object.keys(data || {}) },
        });
      } catch { /* logging falha não bloqueia resposta */ }
    };

    if (!res.ok) {
      const errStr = JSON.stringify(result);
      if (errStr.includes("verify") || errStr.includes("domain") || errStr.includes("sender") || errStr.includes("not_authenticated")) {
        console.warn("Brevo domain not authenticated — email skipped:", to, "template:", type);
        await logEvent("failed", "domain_not_authenticated");
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "domain_not_authenticated", details: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Brevo error:", result);
      await logEvent("failed", JSON.stringify(result).slice(0, 500));
      return new Response(JSON.stringify({ error: "Failed to send email", details: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Não loga endereço de email (LGPD/PII). Usa hash dos primeiros chars + domínio.
    const emailDigest = to ? `${String(to).slice(0, 1)}***@${String(to).split("@")[1] ?? ""}` : "?";
    console.log(`Email sent via Brevo: type=${type} to=${emailDigest} msgId=${result.messageId}`);
    await logEvent("sent", undefined, result.messageId);
    return new Response(JSON.stringify({ success: true, id: result.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
