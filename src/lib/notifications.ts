import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string | null;
  user_id: string;
}

interface DoctorInfo {
  user_id: string;
  name: string;
  phone: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Fetch profile data for a given user_id. Returns null if not found. */
const getProfile = async (userId: string): Promise<ProfileData | null> => {
  const { data } = await db
    .from("profiles")
    .select("first_name, last_name, phone, user_id")
    .eq("user_id", userId)
    .single();
  return data;
};

/** Resolve doctor profile + profile data from a doctor_profiles.id. */
const getDoctorInfo = async (doctorProfileId: string): Promise<DoctorInfo | null> => {
  const { data: docProfile } = await db
    .from("doctor_profiles")
    .select("user_id")
    .eq("id", doctorProfileId)
    .single();
  if (!docProfile) return null;
  const profile = await getProfile(docProfile.user_id);
  return {
    user_id: docProfile.user_id,
    name: profile ? `Dr(a). ${profile.first_name} ${profile.last_name}` : "Médico",
    phone: profile?.phone ?? "",
  };
};

/** Format a date string as localised pt-BR date + time. */
const formatDateTime = (isoString: string) => {
  const d = new Date(isoString);
  return {
    dateStr: d.toLocaleDateString("pt-BR"),
    timeStr: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
};

// Fire-and-forget helpers — errors are logged but never thrown to callers.

const sendWhatsApp = (phone: string, message: string) =>
  db.functions
    .invoke("send-whatsapp", { body: { phone, message } })
    .catch(err => logError("sendWhatsApp failed", err, { phone: phone.slice(0, 5) + "…" }));

const sendEmail = (type: string, to: string, data: Record<string, string>) =>
  db.functions
    .invoke("send-email", { body: { type, to, data } })
    .catch(err => logError("sendEmail failed", err, { type }));

const sendPush = (user_id: string, title: string, message: string, link?: string) =>
  db.functions
    .invoke("send-push-notification", { body: { user_id, title, message, link } })
    .catch(err => logError("sendPush failed", err, { user_id }));

const insertNotification = (
  user_id: string,
  title: string,
  message: string,
  type: string,
  link?: string,
) =>
  db
    .from("notifications")
    .insert({ user_id, title, message, type, link })
    .then(() => {});

/**
 * notify — wrapper unificado pra disparar push + criar registro in-app.
 *
 * Por padrão dispara push (best-effort) e cria a notificação in-app. O
 * push só vai pra usuários que ativaram notificações via PushNotificationToggle.
 * Falhas no push não afetam o registro in-app.
 *
 * Use `{ push: false }` para notificações silenciosas (ex.: badge counters).
 */
export const notify = async (
  user_id: string,
  title: string,
  message: string,
  type: string,
  options: { link?: string; push?: boolean } = {},
) => {
  const { link, push = true } = options;
  await insertNotification(user_id, title, message, type, link);
  if (push) sendPush(user_id, title, message, link);
};

/** Envia a mesma notificação para vários usuários de uma vez. */
export const notifyMany = async (
  user_ids: string[],
  title: string,
  message: string,
  type: string,
  options: { link?: string; push?: boolean } = {},
) => {
  const { link, push = true } = options;
  if (user_ids.length === 0) return;
  await db.from("notifications").insert(
    user_ids.map(user_id => ({ user_id, title, message, type, link }))
  );
  if (push) {
    await Promise.allSettled(user_ids.map(uid => sendPush(uid, title, message, link)));
  }
};

// ─── Exported notification functions ──────────────────────────────────────────

/** Notify appointment cancellation via Email + WhatsApp + In-App */
export const notifyAppointmentCancelled = async (
  appointmentId: string,
  cancelledByName: string,
  reason?: string,
) => {
  try {
    const { data: appt } = await db
      .from("appointments")
      .select("id, scheduled_at, patient_id, doctor_id, guest_patient_id")
      .eq("id", appointmentId)
      .single();
    if (!appt) return;

    const { dateStr, timeStr } = formatDateTime(appt.scheduled_at);
    const doctor = await getDoctorInfo(appt.doctor_id);
    const doctorName = doctor?.name ?? "Médico";
    const reasonText = reason ? `📝 Motivo: ${reason}\n` : "";

    let patientName = "Paciente";
    let patientPhone = "";
    const patientUserId = appt.patient_id;

    if (appt.guest_patient_id) {
      const { data: guest } = await db
        .from("guest_patients")
        .select("full_name, phone")
        .eq("id", appt.guest_patient_id)
        .single();
      if (guest) { patientName = guest.full_name; patientPhone = guest.phone; }
    } else if (appt.patient_id) {
      const profile = await getProfile(appt.patient_id);
      if (profile) {
        patientName = `${profile.first_name} ${profile.last_name}`;
        patientPhone = profile.phone ?? "";
      }
    }

    sendEmail("appointment_cancelled", "skip", {
      patient_name: patientName, doctor_name: doctorName,
      date: dateStr, time: timeStr, reason: reason ?? "", cancelled_by: cancelledByName,
    });

    if (patientPhone) {
      sendWhatsApp(patientPhone,
        `❌ *Consulta Cancelada*\n\nOlá ${patientName},\nSua consulta com ${doctorName} em ${dateStr} às ${timeStr} foi cancelada.\n${reasonText}\nDeseja reagendar? Acesse a plataforma. 💚`);
    }
    if (doctor?.phone) {
      sendWhatsApp(doctor.phone,
        `❌ *Consulta Cancelada*\n\n${doctorName}, a consulta com ${patientName} em ${dateStr} às ${timeStr} foi cancelada.${reason ? `\nMotivo: ${reason}` : ""}`);
    }
    if (doctor?.user_id) {
      sendEmail("appointment_cancelled", "resolve-from-user", {
        patient_name: patientName, doctor_name: doctorName,
        date: dateStr, time: timeStr, reason: reason ?? "",
        cancelled_by: cancelledByName, recipient_user_id: doctor.user_id,
      });
    }
    if (patientUserId) {
      insertNotification(patientUserId, "❌ Consulta Cancelada",
        `Sua consulta com ${doctorName} em ${dateStr} às ${timeStr} foi cancelada.${reason ? ` Motivo: ${reason}` : ""}`,
        "appointment", "/dashboard/appointments?role=patient");
    }
    if (doctor) {
      insertNotification(doctor.user_id, "❌ Consulta Cancelada",
        `Consulta com ${patientName} em ${dateStr} às ${timeStr} foi cancelada.${reason ? ` Motivo: ${reason}` : ""}`,
        "appointment", "/dashboard/doctor/consultations?role=doctor");
    }
  } catch (err) {
    logError("notifyAppointmentCancelled failed", err, { appointmentId });
  }
};

/** Notify certificate issued via Email + WhatsApp + In-App */
export const notifyCertificateSent = async (
  patientName: string,
  patientCpf: string,
  doctorName: string,
  certType: string,
  verificationCode: string,
  days?: number,
) => {
  try {
    if (!patientCpf) return;
    const cpfDigits = patientCpf.replace(/\D/g, "");
    const { data: profile } = await db
      .from("profiles")
      .select("user_id, phone, first_name")
      .eq("cpf", cpfDigits)
      .single();
    if (!profile) return;

    sendEmail("certificate_sent", "resolve-from-user", {
      patient_name: patientName, doctor_name: doctorName,
      cert_type: certType, verification_code: verificationCode,
      days: days?.toString() ?? "",
    });
    if (profile.phone) {
      sendWhatsApp(profile.phone,
        `📋 *Atestado Médico Emitido*\n\nOlá ${patientName},\n${doctorName} emitiu um ${certType} para você.\n\n🔐 Código de verificação: ${verificationCode}\n${days ? `📅 Dias de afastamento: ${days}\n` : ""}\nAcesse a plataforma para baixar o PDF. 💚`);
    }
    insertNotification(profile.user_id, "📋 Atestado Emitido",
      `${doctorName} emitiu um ${certType}. Código: ${verificationCode}`,
      "document", "/dashboard/patient/documents?role=patient");
  } catch (err) {
    logError("notifyCertificateSent failed", err, { certType });
  }
};

/** Notify doctor approved/rejected */
export const notifyDoctorApproval = async (
  doctorUserId: string,
  doctorName: string,
  approved: boolean,
  reason?: string,
) => {
  try {
    sendEmail(
      approved ? "doctor_approved" : "doctor_rejected",
      "resolve-from-user",
      { name: doctorName, reason: reason ?? "", login_url: `${window.location.origin}/medico` },
    );
    insertNotification(
      doctorUserId,
      approved ? "✅ Cadastro Aprovado!" : "❌ Cadastro Não Aprovado",
      approved
        ? "Seu cadastro médico foi aprovado! Configure sua disponibilidade e comece a atender."
        : `Seu cadastro não foi aprovado.${reason ? ` Motivo: ${reason}` : ""}`,
      approved ? "success" : "warning",
      approved ? "/dashboard?role=doctor" : undefined,
    );
  } catch (err) {
    logError("notifyDoctorApproval failed", err, { doctorUserId, approved });
  }
};

/** Notify consultation started — doctor entered the room */
export const notifyConsultationStarted = async (
  appointmentId: string,
  doctorName: string,
) => {
  try {
    const { data: appt } = await db
      .from("appointments")
      .select("patient_id, guest_patient_id")
      .eq("id", appointmentId)
      .single();
    if (!appt) return;

    const consultationUrl = `${window.location.origin}/dashboard/consultation/${appointmentId}`;
    const link = `/dashboard/consultation/${appointmentId}`;

    if (appt.patient_id) {
      const profile = await getProfile(appt.patient_id);
      const patientName = profile?.first_name ?? "Paciente";
      if (profile?.phone) {
        sendWhatsApp(profile.phone,
          `📹 *${doctorName} está na sala!*\n\nOlá ${patientName}, seu médico já está aguardando na sala de consulta.\n\n🔗 Acesse agora: ${consultationUrl}\n\nEntre o mais rápido possível! 💚`);
      }
      sendPush(appt.patient_id, `📹 ${doctorName} está na sala!`, "Seu médico já está aguardando. Acesse agora!", link);
      insertNotification(appt.patient_id, `📹 ${doctorName} está na sala!`,
        "Seu médico já está aguardando na sala de consulta virtual. Acesse agora!",
        "consultation", link);
    }

    if (appt.guest_patient_id) {
      const { data: guest } = await db
        .from("guest_patients")
        .select("phone, full_name")
        .eq("id", appt.guest_patient_id)
        .single();
      if (guest?.phone) {
        sendWhatsApp(guest.phone,
          `📹 *${doctorName} está na sala!*\n\nOlá ${guest.full_name}, seu médico já está aguardando.\n\n🔗 Acesse: ${consultationUrl}`);
      }
    }
  } catch (err) {
    logError("notifyConsultationStarted failed", err, { appointmentId });
  }
};

/** Notify document uploaded by doctor */
export const notifyDocumentUploaded = async (
  patientId: string,
  doctorName: string,
  fileName: string,
  description?: string,
) => {
  try {
    const profile = await getProfile(patientId);
    const patientName = profile?.first_name ?? "Paciente";
    sendEmail("document_uploaded", "resolve-from-user", {
      patient_name: patientName, doctor_name: doctorName,
      file_name: fileName, description: description ?? "",
    });
    if (profile?.phone) {
      sendWhatsApp(profile.phone,
        `📎 *Novo Documento Disponível*\n\nOlá ${patientName},\n${doctorName} enviou um novo documento: ${fileName}\n${description ? `📝 ${description}\n` : ""}\nAcesse a plataforma para baixar. 💚`);
    }
    insertNotification(patientId, "📎 Novo Documento",
      `${doctorName} enviou: ${fileName}`,
      "document", "/dashboard/patient/documents?role=patient");
  } catch (err) {
    logError("notifyDocumentUploaded failed", err, { patientId });
  }
};

/** Notify prescription sent to patient */
export const notifyPrescriptionSent = async (
  patientId: string,
  doctorName: string,
  diagnosis?: string,
  medicationsSummary?: string,
) => {
  try {
    const profile = await getProfile(patientId);
    const patientName = profile?.first_name ?? "Paciente";
    sendEmail("prescription_sent", "resolve-from-user", {
      patient_name: patientName, doctor_name: doctorName,
      diagnosis: diagnosis ?? "", medications: medicationsSummary ?? "",
    });
    if (profile?.phone) {
      sendWhatsApp(profile.phone,
        `💊 *Nova Receita Médica*\n\nOlá ${patientName},\n${doctorName} emitiu uma nova receita para você.\n${diagnosis ? `📋 Diagnóstico: ${diagnosis}\n` : ""}\nAcesse a plataforma para baixar o PDF. 💚`);
    }
    sendPush(patientId, `💊 Nova Receita de ${doctorName}`,
      "Uma nova receita médica foi emitida. Acesse para visualizar.",
      "/dashboard/patient/health?role=patient");
    insertNotification(patientId, "💊 Nova Receita Médica",
      `${doctorName} emitiu uma nova receita.${diagnosis ? ` Diagnóstico: ${diagnosis}` : ""}`,
      "prescription", "/dashboard/patient/health?role=patient");
  } catch (err) {
    logError("notifyPrescriptionSent failed", err, { patientId });
  }
};

/** Notify appointment rescheduled */
export const notifyAppointmentRescheduled = async (
  appointmentId: string,
  newDate: string,
  newTime: string,
) => {
  try {
    const { data: appt } = await db
      .from("appointments")
      .select("patient_id, doctor_id, guest_patient_id, scheduled_at")
      .eq("id", appointmentId)
      .single();
    if (!appt) return;

    const doctor = await getDoctorInfo(appt.doctor_id);
    const doctorName = doctor?.name ?? "Médico";

    let patientName = "Paciente";
    let patientPhone = "";
    const patientUserId = appt.patient_id;

    if (appt.guest_patient_id) {
      const { data: guest } = await db
        .from("guest_patients")
        .select("full_name, phone")
        .eq("id", appt.guest_patient_id)
        .single();
      if (guest) { patientName = guest.full_name; patientPhone = guest.phone; }
    } else if (appt.patient_id) {
      const profile = await getProfile(appt.patient_id);
      if (profile) {
        patientName = `${profile.first_name} ${profile.last_name}`;
        patientPhone = profile.phone ?? "";
      }
    }

    sendEmail("appointment_rescheduled", "resolve-from-user", {
      patient_name: patientName, doctor_name: doctorName, new_date: newDate, new_time: newTime,
    });
    if (patientPhone) {
      sendWhatsApp(patientPhone,
        `🔄 *Consulta Reagendada*\n\nOlá ${patientName},\nSua consulta com ${doctorName} foi reagendada.\n\n📅 Nova data: *${newDate}*\n⏰ Novo horário: *${newTime}*\n\nAcesse a plataforma para mais detalhes. 💚`);
    }
    if (patientUserId) {
      insertNotification(patientUserId, "🔄 Consulta Reagendada",
        `Sua consulta com ${doctorName} foi reagendada para ${newDate} às ${newTime}.`,
        "appointment", "/dashboard/appointments?role=patient");
    }
    // Notify doctor as well (WhatsApp + In-App + Email)
    if (doctor?.phone) {
      sendWhatsApp(doctor.phone,
        `🔄 *Consulta Reagendada*\n\n${doctorName}, a consulta com ${patientName} foi reagendada.\n\n📅 Nova data: *${newDate}*\n⏰ Novo horário: *${newTime}*\n\nAcesse sua agenda para conferir os detalhes.`);
    }
    if (doctor?.user_id) {
      insertNotification(doctor.user_id, "🔄 Consulta Reagendada",
        `A consulta com ${patientName} foi reagendada para ${newDate} às ${newTime}.`,
        "appointment", "/dashboard/doctor/consultations?role=doctor");
      sendEmail("appointment_rescheduled", "resolve-from-user", {
        patient_name: patientName, doctor_name: doctorName,
        new_date: newDate, new_time: newTime, recipient_user_id: doctor.user_id,
      });
    }
  } catch (err) {
    logError("notifyAppointmentRescheduled failed", err, { appointmentId });
  }
};

/** Notify doctor about a new appointment */
export const notifyNewAppointment = async (
  appointmentId: string,
  doctorProfileId: string,
  patientName: string,
  dateStr: string,
  timeStr: string,
) => {
  try {
    const doctor = await getDoctorInfo(doctorProfileId);
    if (!doctor) return;
    if (doctor.phone) {
      sendWhatsApp(doctor.phone,
        `📅 *Novo Agendamento*\n\nOlá ${doctor.name},\nVocê tem uma nova consulta agendada!\n\n👤 Paciente: ${patientName}\n📅 Data: ${dateStr}\n⏰ Horário: ${timeStr}\n\nAcesse o painel para mais detalhes. 💚`);
    }
    sendPush(doctor.user_id, "📅 Novo Agendamento",
      `${patientName} agendou uma consulta para ${dateStr} às ${timeStr}.`,
      "/dashboard/doctor/consultations?role=doctor");
    insertNotification(doctor.user_id, "📅 Novo Agendamento",
      `${patientName} agendou uma consulta para ${dateStr} às ${timeStr}.`,
      "appointment", "/dashboard/doctor/consultations?role=doctor");
  } catch (err) {
    logError("notifyNewAppointment failed", err, { doctorProfileId });
  }
};

/** Notify patient about payment confirmation */
export const notifyPaymentConfirmed = async (
  patientId: string,
  doctorName: string,
  dateStr: string,
  amount?: string,
) => {
  try {
    const profile = await getProfile(patientId);
    const patientName = profile?.first_name ?? "Paciente";
    const amountText = amount ? ` de R$ ${amount}` : "";
    if (profile?.phone) {
      sendWhatsApp(profile.phone,
        `✅ *Pagamento Confirmado*\n\nOlá ${patientName},\nSeu pagamento${amountText} para a consulta com ${doctorName} em ${dateStr} foi confirmado!\n\nSua consulta está garantida. 💚`);
    }
    insertNotification(patientId, "✅ Pagamento Confirmado",
      `Pagamento${amountText} confirmado para consulta com ${doctorName}.`,
      "payment", "/dashboard/appointments?role=patient");
  } catch (err) {
    logError("notifyPaymentConfirmed failed", err, { patientId });
  }
};

/** Notify clinic approved/rejected */
export const notifyClinicApproval = async (
  clinicUserId: string,
  clinicName: string,
  approved: boolean,
  reason?: string,
) => {
  try {
    sendEmail(
      approved ? "clinic_approved" : "clinic_rejected",
      "resolve-from-user",
      { name: clinicName, clinic_name: clinicName, reason: reason ?? "", login_url: `${window.location.origin}/clinica` },
    );
    insertNotification(
      clinicUserId,
      approved ? "✅ Clínica Aprovada!" : "❌ Clínica Não Aprovada",
      approved
        ? `Sua clínica ${clinicName} foi aprovada! Configure seus médicos e comece a operar.`
        : `Sua clínica ${clinicName} não foi aprovada.${reason ? ` Motivo: ${reason}` : ""}`,
      approved ? "success" : "warning",
      approved ? "/dashboard?role=clinic" : undefined,
    );
  } catch (err) {
    logError("notifyClinicApproval failed", err, { clinicUserId, approved });
  }
};

/** Notify consultation completed */
export const notifyConsultationCompleted = async (
  appointmentId: string,
  doctorName: string,
) => {
  try {
    const { data: appt } = await db
      .from("appointments")
      .select("patient_id, guest_patient_id")
      .eq("id", appointmentId)
      .single();
    if (!appt?.patient_id) return;

    const profile = await getProfile(appt.patient_id);
    const patientName = profile?.first_name ?? "Paciente";
    const rateLink = `/dashboard/rate/${appointmentId}`;

    sendEmail("consultation_completed", "resolve-from-user", {
      patient_name: patientName, doctor_name: doctorName,
    });
    if (profile?.phone) {
      sendWhatsApp(profile.phone,
        `🎉 *Consulta Finalizada*\n\nOlá ${patientName},\nSua consulta com ${doctorName} foi concluída!\n\n⭐ Avalie sua experiência na plataforma.\n📋 Receitas e documentos já estão disponíveis no seu painel.\n\nObrigado por usar a AloClinica! 💚`);
    }
    sendPush(appt.patient_id, "🎉 Consulta Finalizada",
      `Avalie sua consulta com ${doctorName}!`, rateLink);
    insertNotification(appt.patient_id, "🎉 Consulta Finalizada",
      `Sua consulta com ${doctorName} foi concluída. Avalie sua experiência!`,
      "consultation", rateLink);
  } catch (err) {
    logError("notifyConsultationCompleted failed", err, { appointmentId });
  }
};

/** Notify welcome patient via Email */
export const notifyWelcomePatient = async (patientName: string, email: string) => {
  sendEmail("welcome", email, { name: patientName })
    .catch(err => logError("notifyWelcomePatient failed", err));
};

/** Notify welcome doctor via Email */
export const notifyWelcomeDoctor = async (doctorName: string, email: string, crm?: string) => {
  sendEmail("welcome_doctor", email, { name: doctorName, crm: crm ?? "" })
    .catch(err => logError("notifyWelcomeDoctor failed", err));
};

