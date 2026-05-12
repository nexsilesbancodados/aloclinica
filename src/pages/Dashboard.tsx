import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Routes, Route, useSearchParams, useNavigate, useParams } from "react-router-dom";
import { usePresence } from "@/hooks/use-presence";
import { prefetchOnIdle } from "@/hooks/use-prefetch-route";
import { lazy, Suspense, ReactNode, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import { warn } from "@/lib/logger";

import PingoLoader from "@/components/PingoLoader";
import ReVerificationGate from "@/components/auth/ReVerificationGate";
import { KycRequiredGate } from "@/components/auth/KycRequiredGate";

// ── LAZY imports: dashboard shells ──
const PatientDashboard = lazy(() => import("@/components/dashboards/PatientDashboard"));
const DoctorDashboard = lazy(() => import("@/components/dashboards/DoctorDashboard"));
const ClinicDashboard = lazy(() => import("@/components/dashboards/ClinicDashboard")); // kept for admin view-as
const AdminDashboard = lazy(() => import("@/components/dashboards/AdminDashboard"));
const ReceptionDashboard = lazy(() => import("@/components/dashboards/ReceptionDashboard")); // kept for admin view-as
const SupportDashboard = lazy(() => import("@/components/dashboards/SupportDashboard"));
const PartnerDashboard = lazy(() => import("@/components/dashboards/PartnerDashboard")); // kept for admin view-as
const LaudistaDashboard = lazy(() => import("@/components/dashboards/LaudistaDashboard"));
const CartaoDashboard = lazy(() => import("@/components/dashboards/CartaoDashboard"));

// ── Cartão Benefícios sub-pages ──
const CarteirinhaDigital = lazy(() => import("@/components/cartao/CarteirinhaDigital"));
const PingoTicket = lazy(() => import("@/components/cartao/PingoTicket"));
const RedeCredenciada = lazy(() => import("@/components/cartao/RedeCredenciada"));
const MeuPlano = lazy(() => import("@/components/cartao/MeuPlano"));
const FaturasCartao = lazy(() => import("@/components/cartao/FaturasCartao"));
const DependentesCartao = lazy(() => import("@/components/cartao/DependentesCartao"));
const SuporteCartao = lazy(() => import("@/components/cartao/SuporteCartao"));
const LgpdCartao = lazy(() => import("@/components/cartao/LgpdCartao"));

// ── LAZY imports: sub-pages ──
const UserProfile = lazy(() => import("@/components/profile/UserProfile"));
const PanelSettings = lazy(() => import("@/components/settings/PanelSettings"));
const DoctorSearch = lazy(() => import("@/components/patient/DoctorSearch"));
const AppointmentsList = lazy(() => import("@/components/patient/AppointmentsList"));
const DoctorAvailability = lazy(() => import("@/components/doctor/DoctorAvailability"));
const DoctorPatients = lazy(() => import("@/components/doctor/DoctorPatients"));
const DoctorConsultations = lazy(() => import("@/components/doctor/DoctorConsultations"));
const DoctorCalendar = lazy(() => import("@/components/doctor/DoctorCalendar"));
const PatientEMR = lazy(() => import("@/components/medical/PatientEMR"));
const PanelCenter = lazy(() => import("@/components/admin/PanelCenter"));

// ── LAZY imports: less-used pages (prefetched on idle) ──
const BookAppointment = lazy(() => import("@/components/patient/BookAppointment"));
const AppointmentDetail = lazy(() => import("@/components/patient/AppointmentDetail"));
const AppointmentConfirmed = lazy(() => import("@/components/patient/AppointmentConfirmed"));
const MedicalHistory = lazy(() => import("@/components/patient/MedicalHistory"));
const PaymentHistory = lazy(() => import("@/components/patient/PaymentHistory"));
const PatientExamUpload = lazy(() => import("@/components/patient/PatientExamUpload"));
const PatientHealth = lazy(() => import("@/components/patient/PatientHealth"));
const PatientSupportChat = lazy(() => import("@/components/patient/PatientSupportChat"));
const DependentsManager = lazy(() => import("@/components/patient/DependentsManager"));
const HealthTimeline = lazy(() => import("@/components/patient/HealthTimeline"));
const SymptomDiary = lazy(() => import("@/components/patient/SymptomDiary"));
const PatientExamResults = lazy(() => import("@/components/patient/PatientExamResults"));
const DoctorPrescriptions = lazy(() => import("@/components/doctor/DoctorPrescriptions"));
const DoctorEarnings = lazy(() => import("@/components/doctor/DoctorEarnings"));
const MedicalCertificate = lazy(() => import("@/components/doctor/MedicalCertificate"));
const DoctorWaitingRoom = lazy(() => import("@/components/doctor/DoctorWaitingRoom"));
const PatientDocuments = lazy(() => import("@/components/doctor/PatientDocuments"));
const DoctorPublicProfile = lazy(() => import("@/components/doctor/DoctorPublicProfile"));
const ExamReportQueue = lazy(() => import("@/components/doctor/ExamReportQueue"));
const ExamReportEditor = lazy(() => import("@/components/doctor/ExamReportEditor"));
const ExamRequestForm = lazy(() => import("@/components/doctor/ExamRequestForm"));
const SimplePrescription = lazy(() => import("@/components/doctor/SimplePrescription"));
const UrgentCareQueue = lazy(() => import("@/components/patient/UrgentCareQueue"));
const PrescriptionRenewalForm = lazy(() => import("@/components/patient/PrescriptionRenewalForm"));
const DoctorOnDutyPanel = lazy(() => import("@/components/doctor/DoctorOnDutyPanel"));
const LaudistaReportQueue = lazy(() => import("@/components/laudista/LaudistaReportQueue"));
const LaudistaMyReports = lazy(() => import("@/components/laudista/LaudistaMyReports"));

const LaudistaFinanceiro = lazy(() => import("@/components/laudista/LaudistaFinanceiro"));
const DoctorWallet = lazy(() => import("@/components/doctor/DoctorWallet"));
const LaudistaExamRequest = lazy(() => import("@/components/doctor/ExamRequestForm"));
const LaudistaReportEditor = lazy(() => import("@/components/doctor/ExamReportEditor"));
const RenewalQueue = lazy(() => import("@/components/doctor/RenewalQueue"));
const VideoRoom = lazy(() => import("@/components/consultation/VideoRoom"));

// ── Ophthalmology ──
const OphthalmologyExamQueue = lazy(() => import("@/components/ophthalmology/OphthalmologyExamQueue"));
const OphthalmologyExamForm = lazy(() => import("@/components/ophthalmology/OphthalmologyExamForm"));
const OphthalmologyExamDetail = lazy(() => import("@/components/ophthalmology/OphthalmologyExamDetail"));
const OphthalmologyPrescriptionForm = lazy(() => import("@/components/ophthalmology/OphthalmologyPrescriptionForm"));
const OphthalmologyMyExams = lazy(() => import("@/components/ophthalmology/OphthalmologyMyExams"));
const OphthalmologyEditExam = lazy(() => import("@/components/ophthalmology/OphthalmologyEditExam"));
const PrescriptionForm = lazy(() => import("@/components/consultation/PrescriptionForm"));
const RateConsultationPage = lazy(() => import("@/components/patient/RateConsultationPage"));
const PreConsultationPage = lazy(() => import("@/components/patient/PreConsultationPage"));
const ChatPage = lazy(() => import("@/components/chat/ChatPage"));
const MedicalRecords = lazy(() => import("@/components/medical/MedicalRecords"));
const AIAssistantPanel = lazy(() => import("@/components/ai/AIAssistantPanel"));
// Clinic components (kept minimal for admin view-as)
const ClinicDoctorsManagement = lazy(() => import("@/components/clinic/ClinicDoctorsManagement"));
const ClinicMyExams = lazy(() => import("@/components/clinic/ClinicMyExams"));
const ClinicExamUpload = lazy(() => import("@/components/clinic/ClinicExamUpload"));
const ClinicExamList = lazy(() => import("@/components/clinic/ClinicExamList"));
const ClinicSchedules = lazy(() => import("@/components/clinic/ClinicSchedules"));
const ClinicPatients = lazy(() => import("@/components/clinic/ClinicPatients"));
const ClinicWaitingRoom = lazy(() => import("@/components/clinic/ClinicWaitingRoom"));
const AdminDoctors = lazy(() => import("@/components/admin/AdminDoctors"));
const AdminPatients = lazy(() => import("@/components/admin/AdminPatients"));
const AdminClinics = lazy(() => import("@/components/admin/AdminClinics"));
const AdminAppointments = lazy(() => import("@/components/admin/AdminAppointments"));
const AdminSpecialties = lazy(() => import("@/components/admin/AdminSpecialties"));
const AdminLogs = lazy(() => import("@/components/admin/AdminLogs"));
const AdminInviteCodes = lazy(() => import("@/components/admin/AdminInviteCodes"));
const AdminReports = lazy(() => import("@/components/admin/AdminReports"));
const AdminUsers = lazy(() => import("@/components/admin/AdminUsers"));
const AdminApprovals = lazy(() => import("@/components/admin/AdminApprovals"));
const AdminKycReview = lazy(() => import("@/components/admin/AdminKycReview"));
const AdminBilling = lazy(() => import("@/components/admin/AdminBilling"));
const AdminPlatformSettings = lazy(() => import("@/components/admin/AdminPlatformSettings"));
const AdminNotificationTemplates = lazy(() => import("@/components/admin/AdminNotificationTemplates"));
const AdminSecurity = lazy(() => import("@/components/admin/AdminSecurity"));
const AdminLgpdExports = lazy(() => import("@/components/admin/AdminLgpdExports"));
const AdminThemeEditor = lazy(() => import("@/components/admin/AdminThemeEditor"));
const AdminSlaMedicos = lazy(() => import("@/components/admin/AdminSlaMedicos"));
const BillingPortal = lazy(() => import("@/components/billing/BillingPortal"));
const AdminSwitchPanel = lazy(() => import("@/components/admin/AdminSwitchPanel"));
const AdminNPS = lazy(() => import("@/components/admin/AdminNPS"));
const AdminWhatsApp = lazy(() => import("@/components/admin/AdminWhatsApp"));
const AdminLiveConsultations = lazy(() => import("@/components/admin/AdminLiveConsultations"));
const SystemHealth = lazy(() => import("@/components/admin/SystemHealth"));
const AdminFinancial = lazy(() => import("@/components/admin/AdminFinancial"));
const AdminCoupons = lazy(() => import("@/components/admin/AdminCoupons"));
const AdminDoctorApplications = lazy(() => import("@/components/admin/AdminDoctorApplications"));
const AdminPACSConfig = lazy(() => import("@/components/admin/AdminPACSConfig"));
const AdminSiteConfig = lazy(() => import("@/components/admin/AdminSiteConfig"));
const AdminFullSiteEditor = lazy(() => import("@/components/admin/AdminFullSiteEditor"));
const AdminMediaLibrary = lazy(() => import("@/components/admin/AdminMediaLibrary"));
const AdminPingoCard = lazy(() => import("@/components/admin/AdminPingoCard"));
const AdminPaymentTest = lazy(() => import("@/components/admin/AdminPaymentTest"));
const PingoCardPanel = lazy(() => import("@/components/patient/PingoCardPanel"));
const SupportInbox = lazy(() => import("@/components/support/SupportInbox"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const HealthCardPage = lazy(() => import("@/components/patient/HealthCardPage"));
const CarePlansPage = lazy(() => import("@/components/patient/CarePlansPage"));
const VaccinationsPage = lazy(() => import("@/components/patient/VaccinationsPage"));
const LGPDCenter = lazy(() => import("@/components/patient/LGPDCenter"));
const VisualAcuityTestPage = lazy(() => import("@/components/ophthalmology/VisualAcuityPage"));
const PatientOphthalmologyHub = lazy(() => import("@/pages/PatientOphthalmologyHub"));

// EMR wrapper with route params
const PatientEMRPage = () => {
  const { patientUserId } = useParams();
  if (!patientUserId) return <Navigate to="/dashboard/patients" replace />;
  return <PatientEMR patientId={patientUserId} isDoctor readOnly={false} />;
};


const RoleGuard = ({ allowed, roles, children }: { allowed: string[]; roles: string[]; children: ReactNode }) => {
  const isAdmin = roles.includes("admin");
  if (isAdmin) return <>{children}</>;
  if (allowed.some(r => roles.includes(r))) return <>{children}</>;
  return <Navigate to="/dashboard" replace />;
};

/**
 * ContextGuard: ensures the active ?role= context matches the panel being accessed.
 * Prevents e.g. a doctor+laudista user on ?role=laudista from accessing doctor-only routes.
 */
const ContextGuard = ({ panel, forceRole, roles, children }: { panel: string; forceRole: string | null; roles: string[]; children: ReactNode }) => {
  const isAdmin = roles.includes("admin");
  if (isAdmin) return <>{children}</>;
  // If ?role= is set and doesn't match this panel's expected context, redirect
  if (forceRole && forceRole !== panel) {
    return <Navigate to={`/dashboard?role=${forceRole}`} replace />;
  }
  return <>{children}</>;
};

const Dashboard = () => {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const forceRole = searchParams.get("role");
  usePresence();

  // Prefetch secondary routes after dashboard renders
  useEffect(() => {
    if (loading) return;
    const primaryRole = roles.includes("admin") ? "admin"
      : roles.includes("doctor") ? "doctor"
      : roles.includes("patient") ? "patient"
      : null;

    if (primaryRole === "admin") {
      prefetchOnIdle([
        () => import("@/components/admin/AdminDoctors"),
        () => import("@/components/admin/AdminPatients"),
        () => import("@/components/admin/AdminUsers"),
        () => import("@/components/admin/AdminFinancial"),
      ]);
    } else if (primaryRole === "doctor") {
      prefetchOnIdle([
        () => import("@/components/doctor/DoctorPrescriptions"),
        () => import("@/components/doctor/DoctorEarnings"),
        () => import("@/components/doctor/DoctorWaitingRoom"),
      ]);
    } else if (primaryRole === "patient") {
      prefetchOnIdle([
        () => import("@/components/patient/MedicalHistory"),
        () => import("@/components/patient/BookAppointment"),
        () => import("@/components/patient/PatientHealth"),
      ]);
    }
  }, [loading, roles]);

  if (loading) {
    return null;
  }

  if (!user) return <Navigate to="/paciente" replace />;

  const isAdmin = roles.includes("admin");
  const validForceRoles = ["patient", "doctor", "support", "admin", "laudista", "ophthalmologist", "cartao_beneficios"];

  // Allow any user to use ?role= IF they actually have that role (not just admins)
  const primaryRole = (() => {
    if (forceRole && validForceRoles.includes(forceRole)) {
      // Admin can force any role
      if (isAdmin) return forceRole;
      // Non-admin can only use ?role= if they actually have that role
      if (roles.includes(forceRole as any)) return forceRole;
    }
    // Default role resolution
    if (isAdmin) return "admin";
    // Laudista takes priority over doctor if user has laudista role
    // (laudistas also have doctor role but their primary context is laudista)
    if (roles.includes("laudista")) return "laudista";
    if (roles.includes("ophthalmologist")) return "ophthalmologist";
    if (roles.includes("doctor")) return "doctor";
    if (roles.includes("receptionist")) return "receptionist";
    if (roles.includes("support")) return "support";
    if (roles.includes("clinic")) return "clinic";
    if (roles.includes("partner")) return "partner";
    if (roles.includes("cartao_beneficios")) return "cartao_beneficios";
    return "patient";
  })();

  const IndexDashboard = () => {
    if (isAdmin && !forceRole) return <Navigate to="/dashboard/admin/panel-center" replace />;
    switch (primaryRole) {
      case "admin": return <AdminDashboard />;
      case "doctor": return <DoctorDashboard />;
      case "laudista": return <LaudistaDashboard />;
      case "ophthalmologist": return <DoctorDashboard />;
      case "receptionist": return <ReceptionDashboard />;
      case "support": return <SupportDashboard />;
      case "clinic": return <ClinicDashboard />;
      case "partner": return <PartnerDashboard />;
      case "cartao_beneficios": return <CartaoDashboard />;
      default: return <PatientDashboard />;
    }
  };

  return (
    <ReVerificationGate>
    <Suspense fallback={<PingoLoader />}>
    <Routes>
      <Route index element={<IndexDashboard />} />

      {/* Role dashboards (eager) */}
      <Route path="patient" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientDashboard /></ContextGuard></RoleGuard>} />
      <Route path="doctor" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorDashboard /></ContextGuard></RoleGuard>} />
      <Route path="clinic" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicDashboard /></ContextGuard></RoleGuard>} />
      <Route path="admin" element={<RoleGuard allowed={[]} roles={roles}><AdminDashboard /></RoleGuard>} />
      <Route path="receptionist" element={<RoleGuard allowed={["receptionist"]} roles={roles}><ContextGuard panel="receptionist" forceRole={forceRole} roles={roles}><ReceptionDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="partner" element={<RoleGuard allowed={["partner"]} roles={roles}><ContextGuard panel="partner" forceRole={forceRole} roles={roles}><PartnerDashboard /></ContextGuard></RoleGuard>} />

      {/* Shared — preserve ?role context */}
      <Route path="profile" element={<UserProfile />} />
      <Route path="settings" element={<PanelSettings />} />
      <Route path="ai-assistant" element={<AIAssistantPanel />} />

      {/* Patient routes */}
      <Route path="doctors" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><DoctorSearch /></ContextGuard></RoleGuard>} />
      <Route path="appointments" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentsList /></ContextGuard></RoleGuard>} />
      <Route path="appointments/:appointmentId" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentDetail /></ContextGuard></RoleGuard>} />
      <Route path="appointments/:appointmentId/confirmed" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentConfirmed /></ContextGuard></RoleGuard>} />
      <Route path="schedule" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><DoctorSearch /></ContextGuard></RoleGuard>} />
      <Route path="schedule/:doctorId" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><KycRequiredGate reason="Antes de marcar uma consulta, precisamos confirmar sua identidade. É exigência regulatória da telemedicina (CFM Resolução 2.314/2022)."><BookAppointment /></KycRequiredGate></ContextGuard></RoleGuard>} />
      
      <Route path="history" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><MedicalHistory /></ContextGuard></RoleGuard>} />
      <Route path="payment-history" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PaymentHistory /></ContextGuard></RoleGuard>} />
      <Route path="billing" element={<RoleGuard allowed={["patient", "doctor", "clinic"]} roles={roles}><BillingPortal /></RoleGuard>} />
      <Route path="patient/documents" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientExamUpload /></ContextGuard></RoleGuard>} />
      <Route path="patient/health" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientHealth /></ContextGuard></RoleGuard>} />
      <Route path="patient/support" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientSupportChat /></ContextGuard></RoleGuard>} />
      <Route path="chat" element={<RoleGuard allowed={["patient", "doctor"]} roles={roles}><ChatPage /></RoleGuard>} />
      <Route path="medical-records" element={<RoleGuard allowed={["patient", "doctor"]} roles={roles}><MedicalRecords /></RoleGuard>} />
      <Route path="timeline" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><HealthTimeline /></ContextGuard></RoleGuard>} />
      <Route path="patient/diary" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><SymptomDiary /></ContextGuard></RoleGuard>} />
      <Route path="urgent-care" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><UrgentCareQueue /></ContextGuard></RoleGuard>} />
      <Route path="prescription-renewal" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PrescriptionRenewalForm /></ContextGuard></RoleGuard>} />
      <Route path="patient/exam-results" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientExamResults /></ContextGuard></RoleGuard>} />
      <Route path="patient/health-card" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><HealthCardPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/care-plans" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><CarePlansPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/vaccinations" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><VaccinationsPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/lgpd" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><LGPDCenter /></ContextGuard></RoleGuard>} />
      <Route path="patient/visual-acuity" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><VisualAcuityTestPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/ophthalmology" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><PatientOphthalmologyHub /></ContextGuard></RoleGuard>} />
      <Route path="notifications" element={<Notifications />} />
      
      <Route path="book" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><DoctorSearch /></ContextGuard></RoleGuard>} />

      {/* Doctor routes — blocked when ?role=laudista */}
      <Route path="availability" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorAvailability /></ContextGuard></RoleGuard>} />
      <Route path="patients" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorPatients /></ContextGuard></RoleGuard>} />
      <Route path="patients/:patientUserId/emr" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><PatientEMRPage /></ContextGuard></RoleGuard>} />
      <Route path="prescriptions" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorPrescriptions /></ContextGuard></RoleGuard>} />
      <Route path="earnings" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorEarnings /></ContextGuard></RoleGuard>} />
      <Route path="certificates" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><MedicalCertificate /></ContextGuard></RoleGuard>} />
      <Route path="medical-certificate/:appointmentId" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><MedicalCertificate /></ContextGuard></RoleGuard>} />
      <Route path="doctor/consultations" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorConsultations /></ContextGuard></RoleGuard>} />
      <Route path="doctor/calendar" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorCalendar /></ContextGuard></RoleGuard>} />
      <Route path="doctor/waiting-room" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorWaitingRoom /></ContextGuard></RoleGuard>} />
      <Route path="doctor/documents" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><PatientDocuments /></ContextGuard></RoleGuard>} />
      <Route path="doctor/on-duty" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorOnDutyPanel /></ContextGuard></RoleGuard>} />
      <Route path="doctor/renewal-queue" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><RenewalQueue /></ContextGuard></RoleGuard>} />
      <Route path="doctor/report-queue" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><ExamReportQueue /></ContextGuard></RoleGuard>} />
      <Route path="doctor/report-editor/:examId" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><ExamReportEditor /></ContextGuard></RoleGuard>} />
      <Route path="doctor/exam-request" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><ExamRequestForm /></ContextGuard></RoleGuard>} />
      <Route path="doctor/simple-prescription" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><SimplePrescription /></ContextGuard></RoleGuard>} />
      <Route path="doctor/wallet" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorWallet /></ContextGuard></RoleGuard>} />

      {/* Ophthalmology */}
      <Route path="ophthalmology/queue" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyExamQueue /></RoleGuard>} />
      <Route path="ophthalmology/new-exam" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyExamForm /></RoleGuard>} />
      <Route path="ophthalmology/exam/:examId" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyExamDetail /></RoleGuard>} />
      <Route path="ophthalmology/edit/:examId" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyEditExam /></RoleGuard>} />
      <Route path="ophthalmology/prescription/:examId" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyPrescriptionForm /></RoleGuard>} />
      <Route path="ophthalmology/my-exams" element={<RoleGuard allowed={["doctor", "ophthalmologist"]} roles={roles}><OphthalmologyMyExams /></RoleGuard>} />

      {/* Consultation */}
      <Route path="consultation/:appointmentId" element={<RoleGuard allowed={["doctor", "patient"]} roles={roles}><KycRequiredGate reason="Para entrar em uma consulta por vídeo, sua identidade precisa estar verificada. É exigência do CFM (Resolução 2.314/2022)."><VideoRoom /></KycRequiredGate></RoleGuard>} />
      <Route path="prescribe/:appointmentId" element={<RoleGuard allowed={["doctor"]} roles={roles}><PrescriptionForm /></RoleGuard>} />
      <Route path="rate/:appointmentId" element={<RoleGuard allowed={["patient"]} roles={roles}><RateConsultationPage /></RoleGuard>} />
      <Route path="pre-consultation/:appointmentId" element={<RoleGuard allowed={["patient"]} roles={roles}><PreConsultationPage /></RoleGuard>} />
      <Route path="doctor-profile/:doctorId" element={<DoctorPublicProfile />} />

      {/* Clinic */}
      <Route path="clinic/doctors" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicDoctorsManagement /></ContextGuard></RoleGuard>} />
      <Route path="clinic/schedules" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicSchedules /></ContextGuard></RoleGuard>} />
      <Route path="clinic/patients" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicPatients /></ContextGuard></RoleGuard>} />
      <Route path="clinic/waiting-room" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicWaitingRoom /></ContextGuard></RoleGuard>} />
      <Route path="clinic/finance" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><AdminFinancial /></ContextGuard></RoleGuard>} />
      <Route path="clinic/reports" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><AdminReports /></ContextGuard></RoleGuard>} />
      <Route path="clinic/exam-request" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><LaudistaExamRequest /></ContextGuard></RoleGuard>} />
      <Route path="clinic/my-exams" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicMyExams /></ContextGuard></RoleGuard>} />
      <Route path="clinic/exam-upload" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicExamUpload /></ContextGuard></RoleGuard>} />
      <Route path="clinic/exam-list" element={<RoleGuard allowed={["clinic"]} roles={roles}><ContextGuard panel="clinic" forceRole={forceRole} roles={roles}><ClinicExamList /></ContextGuard></RoleGuard>} />

      {/* Support */}
      <Route path="support/inbox" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/chat" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/logs" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/users" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/online" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/audit" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />

      {/* Partner/Reception removed — platform focused on telelaudo + consultas avulsas */}

      {/* Admin */}
      <Route path="admin/doctors" element={<RoleGuard allowed={[]} roles={roles}><AdminDoctors /></RoleGuard>} />
      <Route path="admin/users" element={<RoleGuard allowed={[]} roles={roles}><AdminUsers /></RoleGuard>} />
      <Route path="admin/patients" element={<RoleGuard allowed={[]} roles={roles}><AdminPatients /></RoleGuard>} />
      <Route path="admin/clinics" element={<RoleGuard allowed={[]} roles={roles}><AdminClinics /></RoleGuard>} />
      <Route path="admin/appointments" element={<RoleGuard allowed={[]} roles={roles}><AdminAppointments /></RoleGuard>} />
      <Route path="admin/specialties" element={<RoleGuard allowed={[]} roles={roles}><AdminSpecialties /></RoleGuard>} />
      <Route path="admin/logs" element={<RoleGuard allowed={[]} roles={roles}><AdminLogs /></RoleGuard>} />
      <Route path="admin/invite-codes" element={<RoleGuard allowed={[]} roles={roles}><AdminInviteCodes /></RoleGuard>} />
      <Route path="admin/reports" element={<RoleGuard allowed={[]} roles={roles}><AdminReports /></RoleGuard>} />
      <Route path="admin/approvals" element={<RoleGuard allowed={[]} roles={roles}><AdminApprovals /></RoleGuard>} />
      <Route path="admin/kyc-review" element={<RoleGuard allowed={[]} roles={roles}><AdminKycReview /></RoleGuard>} />
      <Route path="admin/billing" element={<RoleGuard allowed={[]} roles={roles}><AdminBilling /></RoleGuard>} />
      <Route path="admin/platform-settings" element={<RoleGuard allowed={[]} roles={roles}><AdminPlatformSettings /></RoleGuard>} />
      <Route path="admin/notification-templates" element={<RoleGuard allowed={[]} roles={roles}><AdminNotificationTemplates /></RoleGuard>} />
      <Route path="admin/security" element={<RoleGuard allowed={[]} roles={roles}><AdminSecurity /></RoleGuard>} />
      <Route path="admin/lgpd-exports" element={<RoleGuard allowed={[]} roles={roles}><AdminLgpdExports /></RoleGuard>} />
      <Route path="admin/theme" element={<RoleGuard allowed={[]} roles={roles}><AdminThemeEditor /></RoleGuard>} />
      <Route path="admin/sla-medicos" element={<RoleGuard allowed={[]} roles={roles}><AdminSlaMedicos /></RoleGuard>} />
      <Route path="admin/doctor-applications" element={<RoleGuard allowed={[]} roles={roles}><AdminDoctorApplications /></RoleGuard>} />
      <Route path="admin/switch-panel" element={<RoleGuard allowed={[]} roles={roles}><AdminSwitchPanel /></RoleGuard>} />
      <Route path="admin/nps" element={<RoleGuard allowed={[]} roles={roles}><AdminNPS /></RoleGuard>} />
      <Route path="admin/whatsapp" element={<RoleGuard allowed={[]} roles={roles}><AdminWhatsApp /></RoleGuard>} />
      <Route path="admin/health" element={<RoleGuard allowed={[]} roles={roles}><SystemHealth /></RoleGuard>} />
      <Route path="admin/live" element={<RoleGuard allowed={[]} roles={roles}><AdminLiveConsultations /></RoleGuard>} />
      <Route path="admin/panel-center" element={<RoleGuard allowed={[]} roles={roles}><PanelCenter /></RoleGuard>} />
      <Route path="admin/financial" element={<RoleGuard allowed={[]} roles={roles}><AdminFinancial /></RoleGuard>} />
      <Route path="admin/coupons" element={<RoleGuard allowed={[]} roles={roles}><AdminCoupons /></RoleGuard>} />
      <Route path="admin/pacs" element={<RoleGuard allowed={[]} roles={roles}><AdminPACSConfig /></RoleGuard>} />
      <Route path="admin/site-config" element={<RoleGuard allowed={[]} roles={roles}><AdminSiteConfig /></RoleGuard>} />
      <Route path="admin/site-editor" element={<RoleGuard allowed={[]} roles={roles}><AdminFullSiteEditor /></RoleGuard>} />
      <Route path="admin/media" element={<RoleGuard allowed={[]} roles={roles}><AdminMediaLibrary /></RoleGuard>} />
      <Route path="admin/pingo-card" element={<RoleGuard allowed={[]} roles={roles}><AdminPingoCard /></RoleGuard>} />
      <Route path="admin/payment-test" element={<RoleGuard allowed={[]} roles={roles}><AdminPaymentTest /></RoleGuard>} />


      {/* Laudista — blocked when ?role=doctor */}
      <Route path="laudista" element={<RoleGuard allowed={["doctor", "laudista"]} roles={roles}><ContextGuard panel="laudista" forceRole={forceRole} roles={roles}><LaudistaDashboard /></ContextGuard></RoleGuard>} />
      <Route path="laudista/queue" element={<RoleGuard allowed={["doctor", "laudista"]} roles={roles}><ContextGuard panel="laudista" forceRole={forceRole} roles={roles}><LaudistaReportQueue /></ContextGuard></RoleGuard>} />
      <Route path="laudista/my-reports" element={<RoleGuard allowed={["doctor", "laudista"]} roles={roles}><ContextGuard panel="laudista" forceRole={forceRole} roles={roles}><LaudistaMyReports /></ContextGuard></RoleGuard>} />
      <Route path="laudista/report-editor/:examId" element={<RoleGuard allowed={["doctor", "laudista"]} roles={roles}><ContextGuard panel="laudista" forceRole={forceRole} roles={roles}><LaudistaReportEditor /></ContextGuard></RoleGuard>} />
      <Route path="laudista/financeiro" element={<RoleGuard allowed={["doctor", "laudista"]} roles={roles}><ContextGuard panel="laudista" forceRole={forceRole} roles={roles}><LaudistaFinanceiro /></ContextGuard></RoleGuard>} />

      {/* ─── Cartão Benefícios ─── */}
      <Route path="cartao" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><CartaoDashboard /></ContextGuard></RoleGuard>} />
      <Route path="cartao/carteirinha" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><CarteirinhaDigital /></ContextGuard></RoleGuard>} />
      <Route path="cartao/ticket" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><PingoTicket /></ContextGuard></RoleGuard>} />
      <Route path="cartao/rede" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><RedeCredenciada /></ContextGuard></RoleGuard>} />
      <Route path="cartao/plano" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><MeuPlano /></ContextGuard></RoleGuard>} />
      <Route path="cartao/faturas" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><FaturasCartao /></ContextGuard></RoleGuard>} />
      <Route path="cartao/dependentes" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><DependentesCartao /></ContextGuard></RoleGuard>} />
      <Route path="cartao/suporte" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><SuporteCartao /></ContextGuard></RoleGuard>} />
      <Route path="cartao/lgpd" element={<RoleGuard allowed={["cartao_beneficios"]} roles={roles}><ContextGuard panel="cartao_beneficios" forceRole={forceRole} roles={roles}><LgpdCartao /></ContextGuard></RoleGuard>} />

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to={`/dashboard${forceRole ? `?role=${forceRole}` : ''}`} replace />}
      />
    </Routes>
    </Suspense>
    </ReVerificationGate>
  );
};

export default Dashboard;
