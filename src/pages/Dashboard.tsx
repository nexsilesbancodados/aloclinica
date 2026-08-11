import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Routes, Route, useSearchParams, useNavigate, useParams } from "react-router-dom";
import { usePresence } from "@/hooks/use-presence";
import { useSentryUser } from "@/hooks/useSentryUser";
import { prefetchOnIdle } from "@/hooks/use-prefetch-route";
import { lazy, Suspense, ReactNode, useEffect } from "react";
import { db } from "@/integrations/supabase/untyped";
import { warn } from "@/lib/logger";

import PingoLoader from "@/components/PingoLoader";
import ReVerificationGate from "@/components/auth/ReVerificationGate";
import { KycRequiredGate } from "@/components/auth/KycRequiredGate";
import { FirstLoginKycGate } from "@/components/auth/FirstLoginKycGate";

// ── LAZY imports: dashboard shells ──
const PatientDashboard = lazy(() => import("@/components/dashboards/PatientDashboard"));
const DoctorDashboard = lazy(() => import("@/components/dashboards/DoctorDashboard"));
const ClinicDashboard = lazy(() => import("@/components/dashboards/ClinicDashboard")); // kept for admin view-as
const AdminDashboard = lazy(() => import("@/components/dashboards/AdminDashboard"));
const ReceptionDashboard = lazy(() => import("@/components/dashboards/ReceptionDashboard")); // kept for admin view-as
const SupportDashboard = lazy(() => import("@/components/dashboards/SupportDashboard"));
const PartnerDashboard = lazy(() => import("@/components/dashboards/PartnerDashboard")); // kept for admin view-as
const OrgaoDashboard = lazy(() => import("@/components/dashboards/OrgaoDashboard"));

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
const AppointmentReceipt = lazy(() => import("@/components/patient/AppointmentReceipt"));
const MedicalHistory = lazy(() => import("@/components/patient/MedicalHistory"));
const PaymentHistory = lazy(() => import("@/components/patient/PaymentHistory"));
const PatientExamUpload = lazy(() => import("@/components/patient/PatientExamUpload"));
const PatientHealth = lazy(() => import("@/components/patient/PatientHealth"));
const PatientSupportChat = lazy(() => import("@/components/patient/PatientSupportChat"));
const DependentsManager = lazy(() => import("@/components/patient/DependentsManager"));
const HealthTimeline = lazy(() => import("@/components/patient/HealthTimeline"));
const SymptomDiary = lazy(() => import("@/components/patient/SymptomDiary"));
const DoctorPrescriptions = lazy(() => import("@/components/doctor/DoctorPrescriptions"));
const DoctorEarnings = lazy(() => import("@/components/doctor/DoctorEarnings"));
const MedicalCertificate = lazy(() => import("@/components/doctor/MedicalCertificate"));
const DoctorWaitingRoom = lazy(() => import("@/components/doctor/DoctorWaitingRoom"));
const PatientDocuments = lazy(() => import("@/components/doctor/PatientDocuments"));
const DoctorPublicProfile = lazy(() => import("@/components/doctor/DoctorPublicProfile"));
const SimplePrescription = lazy(() => import("@/components/doctor/SimplePrescription"));
const UrgentCareQueue = lazy(() => import("@/components/patient/UrgentCareQueue"));
const PrescriptionRenewalForm = lazy(() => import("@/components/patient/PrescriptionRenewalForm"));
const DoctorOnDutyPanel = lazy(() => import("@/components/doctor/DoctorOnDutyPanel"));
const DoctorWallet = lazy(() => import("@/components/doctor/DoctorWallet"));
const RenewalQueue = lazy(() => import("@/components/doctor/RenewalQueue"));
const VideoRoom = lazy(() => import("@/components/consultation/VideoRoom"));

const PrescriptionForm = lazy(() => import("@/components/consultation/PrescriptionForm"));
const ExamRequestForm = lazy(() => import("@/components/doctor/ExamRequestForm"));
const RateConsultationPage = lazy(() => import("@/components/patient/RateConsultationPage"));
const PreConsultationPage = lazy(() => import("@/components/patient/PreConsultationPage"));
const QuickRxRenewal = lazy(() => import("@/components/patient/QuickRxRenewal"));
const FamilyMembers = lazy(() => import("@/components/patient/FamilyMembers"));
const AccessLog = lazy(() => import("@/components/patient/AccessLog"));
const ExamMarketplace = lazy(() => import("@/components/patient/ExamMarketplace"));
const ReferralPage = lazy(() => import("@/components/patient/ReferralPage"));
const ChatPage = lazy(() => import("@/components/chat/ChatPage"));
const MedicalRecords = lazy(() => import("@/components/medical/MedicalRecords"));
const AIAssistantPanel = lazy(() => import("@/components/ai/AIAssistantPanel"));
// Clinic components (kept minimal for admin view-as)
const ClinicDoctorsManagement = lazy(() => import("@/components/clinic/ClinicDoctorsManagement"));
const ClinicSchedules = lazy(() => import("@/components/clinic/ClinicSchedules"));
const ClinicPatients = lazy(() => import("@/components/clinic/ClinicPatients"));
const ClinicWaitingRoom = lazy(() => import("@/components/clinic/ClinicWaitingRoom"));
const AdminDoctors = lazy(() => import("@/components/admin/AdminDoctors"));
const AdminPatients = lazy(() => import("@/components/admin/AdminPatients"));
const AdminClinics = lazy(() => import("@/components/admin/AdminClinics"));
const AdminAppointments = lazy(() => import("@/components/admin/AdminAppointments"));
const AdminSpecialties = lazy(() => import("@/components/admin/AdminSpecialties"));
const AdminLogs = lazy(() => import("@/components/admin/AdminLogs"));
const AdminFraudSignals = lazy(() => import("@/components/admin/AdminFraudSignals"));
const ClinicalProtocols = lazy(() => import("@/components/doctor/ClinicalProtocols"));
const AdminLeads = lazy(() => import("@/components/admin/AdminLeads"));
const AdminContractNew = lazy(() => import("@/components/admin/AdminContractNew"));
const AdminInviteCodes = lazy(() => import("@/components/admin/AdminInviteCodes"));
const AdminReports = lazy(() => import("@/components/admin/AdminReports"));
const AdminUsers = lazy(() => import("@/components/admin/AdminUsers"));
const AdminApprovals = lazy(() => import("@/components/admin/AdminApprovals"));
const AdminKycReview = lazy(() => import("@/components/admin/AdminKycReview"));

const AdminPlatformSettings = lazy(() => import("@/components/admin/AdminPlatformSettings"));
const AdminFeatureFlags = lazy(() => import("@/components/admin/AdminFeatureFlags"));
const AdminMaintenanceCenter = lazy(() => import("@/components/admin/AdminMaintenanceCenter"));
const AdminNotificationTemplates = lazy(() => import("@/components/admin/AdminNotificationTemplates"));
const AdminSecurity = lazy(() => import("@/components/admin/AdminSecurity"));
const AdminLgpdExports = lazy(() => import("@/components/admin/AdminLgpdExports"));
const AdminThemeEditor = lazy(() => import("@/components/admin/AdminThemeEditor"));
const BillingPortal = lazy(() => import("@/components/billing/BillingPortal"));
const AdminNPS = lazy(() => import("@/components/admin/AdminNPS"));
const AdminWhatsApp = lazy(() => import("@/components/admin/AdminWhatsApp"));
const AdminBroadcast = lazy(() => import("@/components/admin/AdminBroadcast"));
const AdminLiveConsultations = lazy(() => import("@/components/admin/AdminLiveConsultations"));
const SystemHealth = lazy(() => import("@/components/admin/SystemHealth"));
const AdminFinancial = lazy(() => import("@/components/admin/AdminFinancial"));
const AdminCoupons = lazy(() => import("@/components/admin/AdminCoupons"));
const AdminDoctorApplications = lazy(() => import("@/components/admin/AdminDoctorApplications"));

const AdminSiteConfig = lazy(() => import("@/components/admin/AdminSiteConfig"));
const AdminFullSiteEditor = lazy(() => import("@/components/admin/AdminFullSiteEditor"));
const AdminMediaLibrary = lazy(() => import("@/components/admin/AdminMediaLibrary"));

const AdminPayouts = lazy(() => import("@/components/admin/AdminPayouts"));
const AdminContratos = lazy(() => import("@/components/admin/AdminContratos"));
const SupportInbox = lazy(() => import("@/components/support/SupportInbox"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const CarePlansPage = lazy(() => import("@/components/patient/CarePlansPage"));
const VaccinationsPage = lazy(() => import("@/components/patient/VaccinationsPage"));
const LGPDCenter = lazy(() => import("@/components/patient/LGPDCenter"));

// EMR wrapper with route params
const PatientEMRPage = () => {
  const { patientUserId } = useParams();
  // Loga acesso ao prontuário do paciente — alimenta a trilha LGPD
  useEffect(() => {
    if (patientUserId) {
      import("@/lib/activity").then((m) =>
        m.logActivity({ action: "view", entity_type: "medical_record", entity_id: patientUserId, reason: "doctor_emr_access" }),
      );
    }
  }, [patientUserId]);
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
  useSentryUser();

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
  const validForceRoles = ["patient", "doctor", "support", "admin", "contract_manager"];

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
    if (roles.includes("doctor")) return "doctor";
    if (roles.includes("receptionist")) return "receptionist";
    if (roles.includes("support")) return "support";
    if (roles.includes("clinic")) return "clinic";
    if (roles.includes("partner")) return "partner";
    if (roles.includes("contract_manager" as any)) return "contract_manager";
    return "patient";
  })();

  const IndexDashboard = () => {
    if (isAdmin && !forceRole) return <Navigate to="/dashboard/admin/panel-center" replace />;
    switch (primaryRole) {
      case "admin": return <AdminDashboard />;
      case "doctor": return <DoctorDashboard />;
      case "receptionist": return <ReceptionDashboard />;
      case "support": return <SupportDashboard />;
      case "clinic": return <ClinicDashboard />;
      case "partner": return <PartnerDashboard />;
      case "contract_manager": return <OrgaoDashboard />;
      default: return <PatientDashboard />;
    }
  };

  return (
    <ReVerificationGate>
    <FirstLoginKycGate>
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
      <Route path="orgao" element={<RoleGuard allowed={["contract_manager"]} roles={roles}><OrgaoDashboard /></RoleGuard>} />

      {/* Shared — preserve ?role context */}
      <Route path="profile" element={<UserProfile />} />
      <Route path="settings" element={<PanelSettings />} />
      <Route path="ai-assistant" element={<AIAssistantPanel />} />

      {/* Patient routes */}
      <Route path="doctors" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><DoctorSearch /></ContextGuard></RoleGuard>} />
      <Route path="appointments" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentsList /></ContextGuard></RoleGuard>} />
      <Route path="appointments/:appointmentId" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentDetail /></ContextGuard></RoleGuard>} />
      <Route path="appointments/:appointmentId/confirmed" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentConfirmed /></ContextGuard></RoleGuard>} />
      <Route path="appointments/:appointmentId/recibo" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AppointmentReceipt /></ContextGuard></RoleGuard>} />
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
      <Route path="prescriptions/renew/:prescriptionId" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><QuickRxRenewal /></ContextGuard></RoleGuard>} />
      <Route path="patient/family" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><FamilyMembers /></ContextGuard></RoleGuard>} />
      <Route path="patient/access-log" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><AccessLog /></ContextGuard></RoleGuard>} />
      <Route path="patient/exams" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><ExamMarketplace /></ContextGuard></RoleGuard>} />
      <Route path="patient/referral" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><ReferralPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/care-plans" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><CarePlansPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/vaccinations" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><VaccinationsPage /></ContextGuard></RoleGuard>} />
      <Route path="patient/lgpd" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><LGPDCenter /></ContextGuard></RoleGuard>} />
      {/* patient/health-card removed with Pingo Card feature */}
      <Route path="notifications" element={<Notifications />} />
      
      <Route path="book" element={<RoleGuard allowed={["patient"]} roles={roles}><ContextGuard panel="patient" forceRole={forceRole} roles={roles}><DoctorSearch /></ContextGuard></RoleGuard>} />

      {/* Doctor routes */}
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
      <Route path="doctor/simple-prescription" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><SimplePrescription /></ContextGuard></RoleGuard>} />
      <Route path="doctor/wallet" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><DoctorWallet /></ContextGuard></RoleGuard>} />

      {/* Consultation */}
      <Route path="consultation/:appointmentId" element={<RoleGuard allowed={["doctor", "patient"]} roles={roles}><KycRequiredGate reason="Para entrar em uma consulta por vídeo, sua identidade precisa estar verificada. É exigência do CFM (Resolução 2.314/2022)."><VideoRoom /></KycRequiredGate></RoleGuard>} />
      <Route path="prescribe/:appointmentId" element={<RoleGuard allowed={["doctor"]} roles={roles}><PrescriptionForm /></RoleGuard>} />
      <Route path="exam-request" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><ExamRequestForm /></ContextGuard></RoleGuard>} />
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

      {/* Support */}
      <Route path="support/inbox" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/chat" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/logs" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/users" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/online" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />
      <Route path="support/audit" element={<RoleGuard allowed={["support"]} roles={roles}><ContextGuard panel="support" forceRole={forceRole} roles={roles}><SupportDashboard /></ContextGuard></RoleGuard>} />

      {/* Partner/Reception removed — platform focused on telemedicina + consultas avulsas */}

      {/* Admin */}
      <Route path="admin/doctors" element={<RoleGuard allowed={[]} roles={roles}><AdminDoctors /></RoleGuard>} />
      <Route path="admin/users" element={<RoleGuard allowed={[]} roles={roles}><AdminUsers /></RoleGuard>} />
      <Route path="admin/patients" element={<RoleGuard allowed={[]} roles={roles}><AdminPatients /></RoleGuard>} />
      <Route path="admin/clinics" element={<RoleGuard allowed={[]} roles={roles}><AdminClinics /></RoleGuard>} />
      <Route path="admin/appointments" element={<RoleGuard allowed={[]} roles={roles}><AdminAppointments /></RoleGuard>} />
      <Route path="admin/specialties" element={<RoleGuard allowed={[]} roles={roles}><AdminSpecialties /></RoleGuard>} />
      <Route path="admin/logs" element={<RoleGuard allowed={[]} roles={roles}><AdminLogs /></RoleGuard>} />
      <Route path="admin/fraud-signals" element={<RoleGuard allowed={[]} roles={roles}><AdminFraudSignals /></RoleGuard>} />
      <Route path="doctor/protocols" element={<RoleGuard allowed={["doctor"]} roles={roles}><ContextGuard panel="doctor" forceRole={forceRole} roles={roles}><ClinicalProtocols /></ContextGuard></RoleGuard>} />
      <Route path="admin/leads" element={<RoleGuard allowed={[]} roles={roles}><AdminLeads /></RoleGuard>} />
      <Route path="admin/contracts/new" element={<RoleGuard allowed={[]} roles={roles}><AdminContractNew /></RoleGuard>} />
      <Route path="admin/invite-codes" element={<RoleGuard allowed={[]} roles={roles}><AdminInviteCodes /></RoleGuard>} />
      <Route path="admin/reports" element={<RoleGuard allowed={[]} roles={roles}><AdminReports /></RoleGuard>} />
      <Route path="admin/approvals" element={<RoleGuard allowed={[]} roles={roles}><AdminApprovals /></RoleGuard>} />
      <Route path="admin/kyc-review" element={<RoleGuard allowed={[]} roles={roles}><AdminKycReview /></RoleGuard>} />
      
      <Route path="admin/feature-flags" element={<RoleGuard allowed={[]} roles={roles}><AdminFeatureFlags /></RoleGuard>} />
      <Route path="admin/platform-settings" element={<RoleGuard allowed={[]} roles={roles}><AdminPlatformSettings /></RoleGuard>} />
      <Route path="admin/maintenance" element={<RoleGuard allowed={[]} roles={roles}><AdminMaintenanceCenter /></RoleGuard>} />
      <Route path="admin/notification-templates" element={<RoleGuard allowed={[]} roles={roles}><AdminNotificationTemplates /></RoleGuard>} />
      <Route path="admin/broadcast" element={<RoleGuard allowed={[]} roles={roles}><AdminBroadcast /></RoleGuard>} />
      <Route path="admin/security" element={<RoleGuard allowed={[]} roles={roles}><AdminSecurity /></RoleGuard>} />
      <Route path="admin/lgpd-exports" element={<RoleGuard allowed={[]} roles={roles}><AdminLgpdExports /></RoleGuard>} />
      <Route path="admin/theme" element={<RoleGuard allowed={[]} roles={roles}><AdminThemeEditor /></RoleGuard>} />
      <Route path="admin/doctor-applications" element={<RoleGuard allowed={[]} roles={roles}><AdminDoctorApplications /></RoleGuard>} />
      <Route path="admin/nps" element={<RoleGuard allowed={[]} roles={roles}><AdminNPS /></RoleGuard>} />
      <Route path="admin/whatsapp" element={<RoleGuard allowed={[]} roles={roles}><AdminWhatsApp /></RoleGuard>} />
      <Route path="admin/health" element={<RoleGuard allowed={[]} roles={roles}><SystemHealth /></RoleGuard>} />
      <Route path="admin/live" element={<RoleGuard allowed={[]} roles={roles}><AdminLiveConsultations /></RoleGuard>} />
      <Route path="admin/panel-center" element={<RoleGuard allowed={[]} roles={roles}><PanelCenter /></RoleGuard>} />
      <Route path="admin/financial" element={<RoleGuard allowed={[]} roles={roles}><AdminFinancial /></RoleGuard>} />
      <Route path="admin/coupons" element={<RoleGuard allowed={[]} roles={roles}><AdminCoupons /></RoleGuard>} />
      
      <Route path="admin/site-config" element={<RoleGuard allowed={[]} roles={roles}><AdminSiteConfig /></RoleGuard>} />
      <Route path="admin/site-editor" element={<RoleGuard allowed={[]} roles={roles}><AdminFullSiteEditor /></RoleGuard>} />
      <Route path="admin/media" element={<RoleGuard allowed={[]} roles={roles}><AdminMediaLibrary /></RoleGuard>} />
      
      <Route path="admin/payouts" element={<RoleGuard allowed={[]} roles={roles}><AdminPayouts /></RoleGuard>} />
      <Route path="admin/contratos" element={<RoleGuard allowed={[]} roles={roles}><AdminContratos /></RoleGuard>} />

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to={`/dashboard${forceRole ? `?role=${forceRole}` : ''}`} replace />}
      />
    </Routes>
    </Suspense>
    </FirstLoginKycGate>
    </ReVerificationGate>
  );
};

export default Dashboard;
