import { toast } from "sonner";

/**
 * Centralized toast feedback for all user-facing actions.
 * Provides consistent messaging and semantics across the app.
 */

// ─── Appointment ────────────────────────────────────────────────────────────

export const toastAppointmentBooked = () =>
  toast.success("Consulta agendada!", {
    description: "Realize o pagamento para confirmar.",
  });

export const toastAppointmentCancelled = () =>
  toast.success("Consulta cancelada", {
    description: "A consulta foi cancelada com sucesso.",
  });

export const toastAppointmentRescheduled = (newDate: string) =>
  toast.success("Consulta reagendada!", {
    description: `Nova data: ${newDate}`,
  });

export const toastAppointmentCompleted = () =>
  toast.success("Consulta finalizada!", {
    description: "Avalie sua experiência para ajudar outros pacientes.",
  });

// ─── Payment ────────────────────────────────────────────────────────────────

export const toastPaymentProcessing = () =>
  toast.info("Processando pagamento...", {
    description: "Aguarde enquanto confirmamos seu pagamento.",
  });

export const toastPaymentConfirmed = () =>
  toast.success("Pagamento confirmado! ✅", {
    description: "Sua consulta está garantida.",
  });

export const toastPaymentFailed = (reason?: string) =>
  toast.error("Falha no pagamento", {
    description: reason || "Verifique os dados e tente novamente.",
  });

export const toastPixCopied = () =>
  toast.success("Código PIX copiado!", {
    description: "Cole no app do seu banco para pagar.",
  });

export const toastRefundProcessed = (amount?: string) =>
  toast.success("Reembolso processado 💸", {
    description: amount ? `R$ ${amount} será devolvido.` : "O valor será devolvido em breve.",
  });

// ─── Check-in ───────────────────────────────────────────────────────────────

export const toastCheckinSuccess = () =>
  toast.success("Check-in realizado! ✅", {
    description: "Aguarde o médico iniciar a consulta.",
  });

export const toastCheckinFailed = (reason: string) =>
  toast.error("Check-in não realizado", { description: reason });

// ─── Prescription / Documents ───────────────────────────────────────────────

export const toastPrescriptionSent = () =>
  toast.success("Receita enviada! 💊", {
    description: "O paciente foi notificado.",
  });

export const toastCertificateSent = () =>
  toast.success("Atestado emitido! 📋", {
    description: "O paciente pode acessar no painel.",
  });

export const toastDocumentUploaded = () =>
  toast.success("Documento enviado! 📎", {
    description: "O paciente receberá notificação.",
  });

// ─── Sharing ────────────────────────────────────────────────────────────────

export const toastShareLinkCopied = () =>
  toast.success("Link copiado! 🔗", {
    description: "Válido por 7 dias. Compartilhe com quem desejar.",
  });

export const toastShareLinkFailed = () =>
  toast.error("Erro ao gerar link", {
    description: "Tente novamente em alguns segundos.",
  });

// ─── Support ────────────────────────────────────────────────────────────────

export const toastTicketCreated = () =>
  toast.success("Ticket criado! 🎫", {
    description: "Nossa equipe responderá em breve.",
  });

export const toastTicketMessageSent = () =>
  toast.success("Mensagem enviada");

// ─── Profile / Settings ─────────────────────────────────────────────────────

export const toastProfileUpdated = () =>
  toast.success("Perfil atualizado! ✅");

export const toastAvailabilityUpdated = () =>
  toast.success("Disponibilidade atualizada! 📅");

export const toastDoctorOnDuty = () =>
  toast.success("Plantão ativado! 🟢", {
    description: "Você receberá pacientes da fila.",
  });

export const toastDoctorOffDuty = () =>
  toast.info("Plantão desativado", {
    description: "Você não receberá mais pacientes da fila.",
  });

// ─── Renewals ───────────────────────────────────────────────────────────────

export const toastRenewalApproved = () =>
  toast.success("Renovação aprovada! ✅", {
    description: "A nova receita está disponível para download.",
  });

export const toastRenewalRejected = (reason?: string) =>
  toast.error("Renovação não aprovada", {
    description: reason || "Agende uma teleconsulta para reavaliar.",
  });

// ─── Generic ────────────────────────────────────────────────────────────────

export const toastSaved = (entity?: string) =>
  toast.success(entity ? `${entity} salvo(a)!` : "Salvo com sucesso!");

export const toastDeleted = (entity?: string) =>
  toast.success(entity ? `${entity} removido(a)` : "Removido com sucesso");

export const toastError = (message?: string) =>
  toast.error("Ocorreu um erro", {
    description: message || "Tente novamente em alguns instantes.",
  });

export const toastCopied = (what?: string) =>
  toast.success(what ? `${what} copiado!` : "Copiado!");

export const toastLoading = (message: string) =>
  toast.loading(message);
